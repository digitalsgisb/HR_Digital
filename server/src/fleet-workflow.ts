import { Router } from "express";
import { z } from "zod";
import { prisma } from "./prisma.js";
import { AttendanceError, normalizeAttendanceName } from "./attendance.js";
import { attachmentSchema } from "./training-portal.js";
import { vehicleConditions } from "@hr-training/shared";
export const departureSchema = identitySchema();
function identitySchema() { return z.object({ destination:z.string().trim().min(2).max(500).optional(), purpose:z.string().trim().min(2).max(1000).optional(), passengers:z.number().int().min(1).max(20).optional(), driverEmployeeId: z.string().trim().min(1), driverName: z.string().trim().min(2), odometerStart: z.number().int().min(0), odometerPhotoBefore: z.string().max(6000000).regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/), fuelBefore: z.number().int().min(0).max(100), conditionBefore: z.enum(vehicleConditions), checksBefore: z.object({ exterior: z.literal(true), tyres: z.literal(true), lights: z.literal(true), documents: z.literal(true) }), notesBefore: z.string().trim().max(10000).optional() }); }
const identity = z.object({ driverEmployeeId: z.string().trim().min(1), driverName: z.string().trim().min(2) });
export const reservationSchema = identity.extend({ vehicleId: z.string().min(1), destination: z.string().trim().min(2).max(500), purpose: z.string().trim().min(2).max(1000), passengers: z.number().int().min(1).max(20).default(1), expectedReturnAt: z.string().datetime() });
export const maintenanceSchema = z.object({ type: z.enum(["Scheduled service", "Repair", "Tyres", "Inspection", "Other"]), servicedAt: z.string().datetime(), odometer: z.number().int().min(0), workshop: z.string().trim().min(2).max(200), workCompleted: z.string().trim().min(2).max(10000), cost: z.number().min(0).max(9999999999.99), attachment: attachmentSchema.nullable().optional(), nextServiceAt: z.number().int().min(0).nullable(), nextServiceDate: z.string().datetime().nullable(), releaseVehicle: z.boolean().default(false) }).refine(v => v.nextServiceAt === null || v.nextServiceAt > v.odometer, "Next service mileage must exceed the recorded odometer.").refine(v => v.nextServiceDate === null || new Date(v.nextServiceDate) > new Date(v.servicedAt), "Next service date must be after the maintenance date.");
async function verifyDriver(input: z.infer<typeof identity>) { const employee = await prisma.employee.findFirst({ where: { employeeId: { equals: input.driverEmployeeId, mode: "insensitive" }, status: "ACTIVE" } }); if (!employee?.name || normalizeAttendanceName(employee.name) !== normalizeAttendanceName(input.driverName))
    throw new AttendanceError(400, "Employee ID and full name must match an active employee."); return employee; }
export function createFleetWorkflowRouter() {
    const router = Router();
    router.post("/vehicle-trips/:id/depart", async (req, res, next) => { try {
        const input = departureSchema.parse(req.body);
        const employee = await verifyDriver(input);
        if (input.conditionBefore !== "GOOD")
            throw new AttendanceError(409, "Report this car's condition to HR before departure. Do not drive until cleared.");
        const result = await prisma.$transaction(async (tx) => { const trip = await tx.vehicleTrip.findUniqueOrThrow({ where: { id: String(req.params.id) }, include: { vehicle: true } }); if (trip.driverEmployeeId !== employee.employeeId)
            throw new AttendanceError(403, "This reservation belongs to another employee."); if (trip.vehicle.archivedAt || trip.vehicle.status !== "IN_USE")
            throw new AttendanceError(409, "This car is no longer cleared for departure."); if (input.odometerStart < trip.vehicle.mileage)
            throw new AttendanceError(400, `Starting mileage cannot be below ${trip.vehicle.mileage} km.`); const saved = await tx.vehicleTrip.updateMany({ where: { id: trip.id, status: "AWAITING_DEPARTURE" }, data: { ...input, status: "IN_PROGRESS", departedAt: new Date(), mileageMismatch: input.odometerStart !== trip.vehicle.mileage } }); if (!saved.count)
            throw new AttendanceError(409, "This trip is no longer awaiting departure. Reload the page."); await tx.vehicle.update({ where: { id: trip.vehicleId }, data: { mileage: input.odometerStart } }); return tx.vehicleTrip.findUniqueOrThrow({ where: { id: trip.id }, include: { vehicle: true } }); });
        res.json(result);
    }
    catch (e) {
        next(e);
    } });
    router.post("/vehicle-trips/lookup", async (req, res, next) => { try {
        const employee = await verifyDriver(identity.parse(req.body));
        res.json(await prisma.vehicleTrip.findMany({ where: { driverEmployeeId: employee.employeeId, status: { in: ["AWAITING_DEPARTURE", "IN_PROGRESS"] } }, include: { vehicle: true }, orderBy: { startedAt: "desc" } }));
    }
    catch (e) {
        next(e);
    } });
    router.post("/vehicle-trips/reserve", async (req, res, next) => {
        try {
            const input = reservationSchema.parse(req.body);
            const employee = await verifyDriver(input);
            if (new Date(input.expectedReturnAt) <= new Date())
                throw new AttendanceError(400, "Expected return must be in the future.");
            const trip = await prisma.$transaction(async (tx) => {
                // Lock the employee as well as the car so concurrent scans cannot create two open trips.
                await tx.$queryRaw `SELECT id FROM "Employee" WHERE id = ${employee.id} FOR UPDATE`;
                if (await tx.vehicleTrip.findFirst({ where: { driverEmployeeId: employee.employeeId, status: { in: ["AWAITING_DEPARTURE", "IN_PROGRESS"] } } }))
                    throw new AttendanceError(409, "You already have an open car trip. Resume or return it first.");
                const claimed = await tx.vehicle.updateMany({ where: { id: input.vehicleId, archivedAt: null, status: "AVAILABLE", OR: [{ serviceDueDate: null }, { serviceDueDate: { gt: new Date() } }] }, data: { status: "IN_USE" } });
                if (!claimed.count)
                    throw new AttendanceError(409, "This car is unavailable or requires maintenance. Choose another car.");
                const vehicle = await tx.vehicle.findUniqueOrThrow({ where: { id: input.vehicleId } });
                if (vehicle.mileage >= vehicle.serviceAt)
                    throw new AttendanceError(409, "This car requires servicing.");
                return tx.vehicleTrip.create({ data: { ...input, driverEmployeeId: employee.employeeId, driverName: employee.name!, expectedReturnAt: new Date(input.expectedReturnAt), status: "AWAITING_DEPARTURE", odometerStart: vehicle.mileage, fuelBefore: 0, conditionBefore: "GOOD", checksBefore: {} }, include: { vehicle: true } });
            });
            res.status(201).json(trip);
        }
        catch (e) {
            next(e);
        }
    });
    router.post("/vehicle-trips/:id/cancel-reservation", async (req, res, next) => { try {
        const employee = await verifyDriver(identity.parse(req.body));
        await prisma.$transaction(async (tx) => { const trip = await tx.vehicleTrip.findUniqueOrThrow({ where: { id: String(req.params.id) } }); if (trip.driverEmployeeId !== employee.employeeId)
            throw new AttendanceError(403, "This reservation belongs to another employee."); const saved = await tx.vehicleTrip.updateMany({ where: { id: trip.id, status: "AWAITING_DEPARTURE" }, data: { status: "CANCELLED", endedAt: new Date() } }); if (!saved.count)
            throw new AttendanceError(409, "Only an awaiting-departure reservation can be cancelled."); await tx.vehicle.update({ where: { id: trip.vehicleId }, data: { status: "AVAILABLE" } }); });
        res.json({ message: "Reservation cancelled. Return the key if already collected." });
    }
    catch (e) {
        next(e);
    } });
    router.get("/vehicles/:id/maintenance", async (req, res, next) => { try {
        res.json(await prisma.vehicleMaintenance.findMany({ where: { vehicleId: String(req.params.id) }, orderBy: { servicedAt: "desc" } }));
    }
    catch (e) {
        next(e);
    } });
    router.post("/vehicles/:id/maintenance", async (req, res, next) => { try {
        const input = maintenanceSchema.parse(req.body);
        const result = await prisma.$transaction(async (tx) => { const id = String(req.params.id); await tx.$queryRaw `SELECT id FROM "Vehicle" WHERE id = ${id} FOR UPDATE`; const car = await tx.vehicle.findUniqueOrThrow({ where: { id } }); if (car.archivedAt)
            throw new AttendanceError(409, "This car has been archived."); if (await tx.vehicleTrip.findFirst({ where: { vehicleId: id, status: { in: ["AWAITING_DEPARTURE", "IN_PROGRESS"] } } }))
            throw new AttendanceError(409, "Close the car's open trip before recording maintenance."); if (new Date(input.servicedAt) > new Date())
            throw new AttendanceError(400, "Maintenance date cannot be in the future."); const { releaseVehicle, ...record } = input; const saved = await tx.vehicleMaintenance.create({ data: { ...record, attachment: record.attachment ?? undefined, vehicleId: id, servicedAt: new Date(input.servicedAt), nextServiceDate: input.nextServiceDate ? new Date(input.nextServiceDate) : null } }); const mileage = Math.max(car.mileage, input.odometer); const serviceAt = input.nextServiceAt ?? car.serviceAt; const due = input.nextServiceDate ? new Date(input.nextServiceDate) : releaseVehicle ? null : car.serviceDueDate; await tx.vehicle.update({ where: { id }, data: { mileage, serviceAt, serviceDueDate: due, ...(releaseVehicle ? { status: mileage >= serviceAt || (due && due <= new Date()) ? "SERVICE_DUE" : "AVAILABLE" } : {}) } }); return saved; });
        res.status(201).json(result);
    }
    catch (e) {
        next(e);
    } });
    return router;
}
