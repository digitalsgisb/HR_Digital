import { Router } from "express";
import { z } from "zod";
import { prisma } from "./prisma.js";
import { AttendanceError, normalizeAttendanceName } from "./attendance.js";
import { attachmentSchema } from "./training-portal.js";
import { vehicleConditions } from "@hr-training/shared";
import { departmentWithHod } from "./department-hod.js";
import { newTripToken, tripLinkDelivery, tripTokenPattern } from "./fleet-email.js";
import { bookingWindow, checkInBooking, createBooking, scheduledStatuses } from "./vehicle-booking.js";
import { locationFields, recordPing } from "./fleet-board.js";
export const departureSchema = identitySchema();
function identitySchema() { return z.object({ destination:z.string().trim().min(2).max(500).optional(), purpose:z.string().trim().min(2).max(1000).optional(), passengers:z.number().int().min(1).max(20).optional(), driverEmployeeId: z.string().trim().min(1), driverName: z.string().trim().min(2), odometerStart: z.number().int().min(0), odometerPhotoBefore: z.string().max(6000000).regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/), fuelBefore: z.number().int().min(0).max(100), conditionBefore: z.enum(vehicleConditions), checksBefore: z.object({ exterior: z.literal(true), tyres: z.literal(true), lights: z.literal(true), documents: z.literal(true) }), notesBefore: z.string().trim().max(10000).optional() }); }
const identity = z.object({ driverEmployeeId: z.string().trim().min(1), driverName: z.string().trim().min(2) });
// startAt omitted/null = "book now" (collect the key straight away); otherwise an advance booking.
export const reservationSchema = identity.extend({ vehicleId: z.string().min(1), destination: z.string().trim().min(2).max(500), purpose: z.string().trim().min(2).max(1000), passengers: z.number().int().min(1).max(20).default(1), startAt: z.string().datetime().nullable().optional(), expectedReturnAt: z.string().datetime() });
export const maintenanceSchema = z.object({ type: z.enum(["Scheduled service", "Repair", "Tyres", "Inspection", "Other"]), servicedAt: z.string().datetime(), odometer: z.number().int().min(0), workshop: z.string().trim().min(2).max(200), workCompleted: z.string().trim().min(2).max(10000), cost: z.number().min(0).max(9999999999.99), attachment: attachmentSchema.nullable().optional(), nextServiceAt: z.number().int().min(0).nullable(), nextServiceDate: z.string().datetime().nullable(), releaseVehicle: z.boolean().default(false) }).refine(v => v.nextServiceAt === null || v.nextServiceAt > v.odometer, "Next service mileage must exceed the recorded odometer.").refine(v => v.nextServiceDate === null || new Date(v.nextServiceDate) > new Date(v.servicedAt), "Next service date must be after the maintenance date.");
async function verifyDriver(input: z.infer<typeof identity>) { const employee = await prisma.employee.findFirst({ where: { employeeId: { equals: input.driverEmployeeId, mode: "insensitive" }, status: "ACTIVE" }, include: { department: departmentWithHod } }); if (!employee?.name || normalizeAttendanceName(employee.name) !== normalizeAttendanceName(input.driverName))
    throw new AttendanceError(400, "Employee ID and full name must match an active employee."); return employee; }
export function createFleetWorkflowRouter() {
    const router = Router();
    // HR route: protected by the same workspace access policy as fleet administration.
    router.delete("/vehicle-trips/:id", async (req, res, next) => {
        try {
            const input = z.object({ reason: z.string().trim().min(2).max(1000), confirmCarReturned: z.boolean().default(false) }).parse(req.body);
            const result = await prisma.$transaction(async tx => {
                const reference = await tx.vehicleTrip.findUnique({ where: { id: String(req.params.id) }, select: { vehicleId: true } });
                if (!reference) throw new AttendanceError(404, "Usage record not found.");
                // Match checkout/return lock order, and serialize removal with new reservations.
                await tx.$queryRaw`SELECT id FROM "Vehicle" WHERE id = ${reference.vehicleId} FOR UPDATE`;
                await tx.$queryRaw`SELECT id FROM "VehicleTrip" WHERE id = ${String(req.params.id)} FOR UPDATE`;
                const trip = await tx.vehicleTrip.findUniqueOrThrow({ where: { id: String(req.params.id) }, include: { vehicle: true } });
                if (trip.archivedAt) return { removed: true, releasedVehicle: false };
                const open = ["AWAITING_DEPARTURE", "IN_PROGRESS"].includes(trip.status);
                const booked = trip.status === "BOOKED";
                if (open && !input.confirmCarReturned) throw new AttendanceError(400, "Confirm the car is no longer in use and its key has been returned before removing this usage.");
                await tx.vehicleTrip.update({ where: { id: trip.id }, data: {
                    archivedAt: new Date(), removalReason: input.reason, removedFromStatus: trip.status,
                    ...(open || booked ? { status: "CANCELLED", endedAt: new Date() } : {}),
                    ...(booked ? { noticeKind: "HR_CANCELLED", noticeDueAt: new Date(), linkEmailDueAt: null, returnReminderDueAt: null } : {})
                } });
                let releasedVehicle = false;
                if (open && trip.vehicle.status === "IN_USE" && !await tx.vehicleTrip.findFirst({ where: {
                    vehicleId: trip.vehicleId, archivedAt: null, status: { in: ["AWAITING_DEPARTURE", "IN_PROGRESS"] }, NOT: { id: trip.id }
                } })) {
                    const status = trip.vehicle.archivedAt || trip.conditionBefore === "UNSAFE" ? "OUT_OF_SERVICE"
                        : trip.conditionBefore === "ATTENTION_REQUIRED" || trip.vehicle.mileage >= trip.vehicle.serviceAt || (trip.vehicle.serviceDueDate && trip.vehicle.serviceDueDate <= new Date()) ? "SERVICE_DUE" : "AVAILABLE";
                    await tx.vehicle.update({ where: { id: trip.vehicleId }, data: { status } });
                    releasedVehicle = true;
                }
                // Removing a record never rewinds the odometer or deletes its evidence.
                return { removed: true, releasedVehicle };
            });
            res.json(result);
        } catch (error) { next(error); }
    });
    router.post("/vehicle-drivers/identify", async (req, res, next) => {
        try {
            const input = z.object({ employeeId: z.string().trim().min(1).max(100) }).parse(req.body);
            const employee = await prisma.employee.findFirst({
                where: { employeeId: { equals: input.employeeId, mode: "insensitive" }, status: "ACTIVE" },
                select: { employeeId: true, name: true }
            });
            if (!employee?.name) throw new AttendanceError(404, "Employee ID not found. Check your ID or contact HR.");
            res.set("Cache-Control", "no-store").json({ employeeId: employee.employeeId, name: employee.name });
        } catch (error) {
            next(error);
        }
    });
    router.post("/vehicle-trips/:id/depart", async (req, res, next) => { try {
        const input = departureSchema.parse(req.body);
        const where = locationFields.parse(req.body);
        const employee = await verifyDriver(input);
        if (input.conditionBefore !== "GOOD")
            throw new AttendanceError(409, "Report this car's condition to HR before departure. Do not drive until cleared.");
        const result = await prisma.$transaction(async (tx) => { const reference = await tx.vehicleTrip.findUniqueOrThrow({ where: { id: String(req.params.id) }, select: { vehicleId: true } }); await tx.$queryRaw`SELECT id FROM "Vehicle" WHERE id = ${reference.vehicleId} FOR UPDATE`; await tx.$queryRaw`SELECT id FROM "VehicleTrip" WHERE id = ${String(req.params.id)} FOR UPDATE`; const trip = await tx.vehicleTrip.findUniqueOrThrow({ where: { id: String(req.params.id) }, include: { vehicle: true } }); if (trip.driverEmployeeId !== employee.employeeId)
            throw new AttendanceError(403, "This reservation belongs to another employee."); if (trip.vehicle.archivedAt || trip.vehicle.status !== "IN_USE")
            throw new AttendanceError(409, "This car is no longer cleared for departure."); if (input.odometerStart < trip.vehicle.mileage)
            throw new AttendanceError(400, `Starting mileage cannot be below ${trip.vehicle.mileage} km.`); const saved = await tx.vehicleTrip.updateMany({ where: { id: trip.id, archivedAt: null, status: "AWAITING_DEPARTURE" }, data: { ...input, status: "IN_PROGRESS", departedAt: new Date(), locationConsent: where.locationConsent, mileageMismatch: input.odometerStart !== trip.vehicle.mileage } }); if (!saved.count)
            throw new AttendanceError(409, "This trip is no longer awaiting departure. Reload the page."); await tx.vehicle.update({ where: { id: trip.vehicleId }, data: { mileage: input.odometerStart } }); if (where.locationConsent) await recordPing(tx, trip.id, "DEPART", where.location); return tx.vehicleTrip.findUniqueOrThrow({ where: { id: trip.id }, include: { vehicle: true } }); });
        res.json(result);
    }
    catch (e) {
        next(e);
    } });
    router.post("/vehicle-trips/lookup", async (req, res, next) => { try {
        const employee = await verifyDriver(identity.parse(req.body));
        const trips = await prisma.vehicleTrip.findMany({ where: { driverEmployeeId: employee.employeeId, archivedAt: null, status: { in: [...scheduledStatuses] } }, include: { vehicle: true }, orderBy: { startedAt: "desc" } });
        // Trips opened before personal links existed get one the first time they are found.
        for (const trip of trips) if (!trip.resumeToken) {
            const resumeToken = newTripToken();
            await prisma.vehicleTrip.updateMany({ where: { id: trip.id, resumeToken: null }, data: { resumeToken } });
            trip.resumeToken = (await prisma.vehicleTrip.findUnique({ where: { id: trip.id }, select: { resumeToken: true } }))?.resumeToken ?? resumeToken;
        }
        res.set("Cache-Control", "no-store").json(trips);
    }
    catch (e) {
        next(e);
    } });
    // Personal trip link: reopens the driver's open trip without rescanning or retyping.
    router.get("/vehicle-trips/resume/:token", async (req, res, next) => {
        try {
            res.set("Cache-Control", "no-store");
            const token = String(req.params.token);
            if (!tripTokenPattern.test(token)) throw new AttendanceError(404, "This trip link is not valid. Scan the HR car QR and enter your employee ID.");
            const trip = await prisma.vehicleTrip.findUnique({ where: { resumeToken: token }, include: { vehicle: true } });
            if (!trip) throw new AttendanceError(404, "This trip link is not valid. Scan the HR car QR and enter your employee ID.");
            if (trip.archivedAt || !(scheduledStatuses as readonly string[]).includes(trip.status))
                throw new AttendanceError(410, trip.status === "COMPLETED" ? "This trip is already finished. Thank you." : trip.status === "NO_SHOW" ? "This booking was released because it was not checked in within 30 minutes of its start." : "This trip is no longer open.");
            res.json({ trip, driver: { employeeId: trip.driverEmployeeId, name: trip.driverName } });
        }
        catch (e) {
            next(e);
        }
    });
    router.post("/vehicle-trips/reserve", async (req, res, next) => {
        try {
            const input = reservationSchema.parse(req.body);
            const employee = await verifyDriver(input);
            const window = bookingWindow(input.startAt, input.expectedReturnAt);
            const trip = await prisma.$transaction(tx => createBooking(tx, employee, { vehicleId: input.vehicleId, destination: input.destination, purpose: input.purpose, passengers: input.passengers }, window));
            res.status(201).json({ ...trip, linkDelivery: tripLinkDelivery(employee) });
        }
        catch (e) {
            next(e);
        }
    });
    // "I've arrived": marks arrival for the board, with a location only if the driver consented for this trip.
    router.post("/vehicle-trips/:id/arrive", async (req, res, next) => {
        try {
            const employee = await verifyDriver(identity.parse(req.body));
            const { location } = locationFields.parse(req.body);
            const id = String(req.params.id);
            const trip = await prisma.$transaction(async tx => {
                await tx.$queryRaw`SELECT id FROM "VehicleTrip" WHERE id = ${id} FOR UPDATE`;
                const current = await tx.vehicleTrip.findUnique({ where: { id } });
                if (!current) throw new AttendanceError(404, "Trip not found.");
                if (current.driverEmployeeId !== employee.employeeId) throw new AttendanceError(403, "This trip belongs to another employee.");
                if (current.archivedAt || current.status !== "IN_PROGRESS") throw new AttendanceError(409, "Only a trip in progress can be marked as arrived.");
                if (current.locationConsent) await recordPing(tx, id, "ARRIVE", location);
                return tx.vehicleTrip.update({ where: { id }, data: { arrivedAt: current.arrivedAt ?? new Date() }, include: { vehicle: true } });
            });
            res.json(trip);
        }
        catch (e) {
            next(e);
        }
    });
    router.post("/vehicle-trips/:id/check-in", async (req, res, next) => {
        try {
            const employee = await verifyDriver(identity.parse(req.body));
            res.json(await prisma.$transaction(tx => checkInBooking(tx, String(req.params.id), employee.employeeId)));
        }
        catch (e) {
            next(e);
        }
    });
    router.post("/vehicle-trips/:id/cancel-reservation", async (req, res, next) => { try {
        const employee = await verifyDriver(identity.parse(req.body));
        const cancelled = await prisma.$transaction(async (tx) => { const reference = await tx.vehicleTrip.findUniqueOrThrow({ where: { id: String(req.params.id) }, select: { vehicleId: true } }); await tx.$queryRaw`SELECT id FROM "Vehicle" WHERE id = ${reference.vehicleId} FOR UPDATE`; await tx.$queryRaw`SELECT id FROM "VehicleTrip" WHERE id = ${String(req.params.id)} FOR UPDATE`; const trip = await tx.vehicleTrip.findUniqueOrThrow({ where: { id: String(req.params.id) } }); if (trip.driverEmployeeId !== employee.employeeId)
            throw new AttendanceError(403, "This reservation belongs to another employee."); if (trip.status === "BOOKED") { const booking = await tx.vehicleTrip.updateMany({ where: { id: trip.id, archivedAt: null, status: "BOOKED" }, data: { status: "CANCELLED", endedAt: new Date(), linkEmailDueAt: null, returnReminderDueAt: null } }); if (!booking.count) throw new AttendanceError(409, "This booking is no longer open."); return "booking"; } const saved = await tx.vehicleTrip.updateMany({ where: { id: trip.id, archivedAt: null, status: "AWAITING_DEPARTURE" }, data: { status: "CANCELLED", endedAt: new Date() } }); if (!saved.count)
            throw new AttendanceError(409, "Only an awaiting-departure reservation can be cancelled."); await tx.vehicle.update({ where: { id: trip.vehicleId }, data: { status: "AVAILABLE" } }); return "reservation"; });
        res.json({ message: cancelled === "booking" ? "Booking cancelled. The car is free for others." : "Reservation cancelled. Return the key if already collected." });
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
            throw new AttendanceError(409, "This car has been archived."); if (await tx.vehicleTrip.findFirst({ where: { vehicleId: id, archivedAt: null, status: { in: ["AWAITING_DEPARTURE", "IN_PROGRESS"] } } }))
            throw new AttendanceError(409, "Close the car's open trip before recording maintenance."); if (new Date(input.servicedAt) > new Date())
            throw new AttendanceError(400, "Maintenance date cannot be in the future."); const { releaseVehicle, ...record } = input; const saved = await tx.vehicleMaintenance.create({ data: { ...record, attachment: record.attachment ?? undefined, vehicleId: id, servicedAt: new Date(input.servicedAt), nextServiceDate: input.nextServiceDate ? new Date(input.nextServiceDate) : null } }); const mileage = Math.max(car.mileage, input.odometer); const serviceAt = input.nextServiceAt ?? car.serviceAt; const due = input.nextServiceDate ? new Date(input.nextServiceDate) : releaseVehicle ? null : car.serviceDueDate; await tx.vehicle.update({ where: { id }, data: { mileage, serviceAt, serviceDueDate: due, ...(releaseVehicle ? { status: mileage >= serviceAt || (due && due <= new Date()) ? "SERVICE_DUE" : "AVAILABLE" } : {}) } }); return saved; });
        res.status(201).json(result);
    }
    catch (e) {
        next(e);
    } });
    return router;
}
