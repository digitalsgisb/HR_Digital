import { Router } from "express";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";
import { AttendanceError } from "./attendance.js";
import { departmentWithHod } from "./department-hod.js";
import { newTripToken, tripLinkDelivery } from "./fleet-email.js";

export const SLOT_MS = 30 * 60000;
export const MAX_AHEAD_MS = 14 * 86400000;
export const MAX_LENGTH_MS = 3 * 86400000;
/** Check-in opens this long before the booked start, and the booking is released this long after it. */
export const CHECK_IN_WINDOW_MS = 30 * 60000;

/** Statuses that occupy a car's calendar. BOOKED does not hold the car yet; the other two do. */
export const scheduledStatuses = ["BOOKED", "AWAITING_DEPARTURE", "IN_PROGRESS"] as const;
const holdingStatuses = ["AWAITING_DEPARTURE", "IN_PROGRESS"];

const myt = (date: Date) => new Intl.DateTimeFormat("en-MY", { timeZone: "Asia/Kuala_Lumpur", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: true }).format(date);
const onSlot = (date: Date) => date.getTime() % SLOT_MS === 0;

export type BookingWindow = { from: Date; to: Date; immediate: boolean };

/** "Book now" passes no start; a later booking starts on a 30-minute step within 14 days. Max 3 days long. */
export function bookingWindow(startAt: string | null | undefined, endAt: string, now = new Date()): BookingWindow {
  const to = new Date(endAt);
  if (Number.isNaN(to.getTime())) throw new AttendanceError(400, "Choose a valid return time.");
  if (!onSlot(to)) throw new AttendanceError(400, "Return times use 30-minute steps.");
  if (!startAt) {
    if (to <= now) throw new AttendanceError(400, "Expected return must be in the future.");
    if (to.getTime() - now.getTime() > MAX_LENGTH_MS) throw new AttendanceError(400, "A booking can be at most 3 days long.");
    return { from: now, to, immediate: true };
  }
  const from = new Date(startAt);
  if (Number.isNaN(from.getTime())) throw new AttendanceError(400, "Choose a valid start time.");
  if (!onSlot(from)) throw new AttendanceError(400, "Start times use 30-minute steps.");
  if (from <= now) throw new AttendanceError(400, "Start time must be in the future. Choose \"Now\" to take a car straight away.");
  if (from.getTime() - now.getTime() > MAX_AHEAD_MS) throw new AttendanceError(400, "Bookings can be made up to 14 days ahead.");
  if (to <= from) throw new AttendanceError(400, "Return time must be after the start time.");
  if (to.getTime() - from.getTime() > MAX_LENGTH_MS) throw new AttendanceError(400, "A booking can be at most 3 days long.");
  return { from, to, immediate: false };
}

type Scheduled = { id: string; status: string; bookedFrom: Date | null; startedAt: Date; expectedReturnAt: Date | null };

/** The time a trip occupies on its car's calendar. A car still out is treated as busy until now. */
export function scheduledSpan(trip: Scheduled, now = new Date()) {
  const from = trip.bookedFrom ?? trip.startedAt;
  if (trip.status === "BOOKED") return { from, to: trip.expectedReturnAt ?? from };
  // A car still out (no return time, or overdue) stays busy for anyone taking it right now.
  const stillOut = new Date(now.getTime() + 60000);
  const end = trip.expectedReturnAt && trip.expectedReturnAt > stillOut ? trip.expectedReturnAt : stillOut;
  return { from, to: end };
}

/** The first trip whose span overlaps [from, to) — no buffer: a booking may start exactly when another ends. */
export function findClash<T extends Scheduled>(trips: T[], from: Date, to: Date, now = new Date(), excludeId?: string) {
  return trips.find(trip => {
    if (trip.id === excludeId) return false;
    const span = scheduledSpan(trip, now);
    return span.from < to && span.to > from;
  });
}

type CarState = { archivedAt: Date | null; status: string; mileage: number; serviceAt: number; serviceDueDate: Date | null };
/** Why a car cannot be booked for a window starting at `from`, or null when it can. */
export function carUnavailableReason(car: CarState, from: Date, immediate: boolean) {
  if (car.archivedAt) return "This car is no longer in the fleet.";
  if (car.status === "OUT_OF_SERVICE") return "This car is out of service.";
  if (car.status === "SERVICE_DUE" || car.mileage >= car.serviceAt || (car.serviceDueDate && car.serviceDueDate <= from)) return "This car is due for service.";
  if (immediate && car.status !== "AVAILABLE") return "This car is in use right now.";
  return null;
}

type Tx = Prisma.TransactionClient;
type Driver = { id: string; employeeId: string; name: string | null };
export type BookingInput = { vehicleId: string; destination: string; purpose: string; passengers: number };

/** Creates a booking (or an immediate reservation) after locking the employee and the car. */
export async function createBooking(tx: Tx, employee: Driver, input: BookingInput, window: BookingWindow, now = new Date()) {
  // Lock the employee as well as the car so concurrent requests cannot double-book either.
  await tx.$queryRaw`SELECT id FROM "Employee" WHERE id = ${employee.id} FOR UPDATE`;
  await tx.$queryRaw`SELECT id FROM "Vehicle" WHERE id = ${input.vehicleId} FOR UPDATE`;
  if (await tx.vehicleTrip.findFirst({ where: { driverEmployeeId: employee.employeeId, archivedAt: null, status: { in: [...scheduledStatuses] } } }))
    throw new AttendanceError(409, "You already have a booking or an open car trip. Use or cancel it first.");
  const clash = findClash(await tx.vehicleTrip.findMany({ where: { vehicleId: input.vehicleId, archivedAt: null, status: { in: [...scheduledStatuses] } } }), window.from, window.to, now);
  if (clash) {
    const span = scheduledSpan(clash, now);
    throw new AttendanceError(409, `This car is already booked ${myt(span.from)} – ${myt(span.to)}. Choose another time or car.`);
  }
  if (window.immediate) {
    const claimed = await tx.vehicle.updateMany({ where: { id: input.vehicleId, archivedAt: null, status: "AVAILABLE", OR: [{ serviceDueDate: null }, { serviceDueDate: { gt: now } }] }, data: { status: "IN_USE" } });
    if (!claimed.count) throw new AttendanceError(409, "This car is unavailable or requires maintenance. Choose another car.");
  }
  const vehicle = await tx.vehicle.findUniqueOrThrow({ where: { id: input.vehicleId } });
  const reason = window.immediate ? (vehicle.mileage >= vehicle.serviceAt ? "This car requires servicing." : null) : carUnavailableReason(vehicle, window.from, false);
  if (reason) throw new AttendanceError(409, reason);
  return tx.vehicleTrip.create({ data: {
    ...input, driverEmployeeId: employee.employeeId, driverName: employee.name!,
    status: window.immediate ? "AWAITING_DEPARTURE" : "BOOKED",
    // A future booking is listed by its start; check-in resets startedAt to the real time.
    ...(window.immediate ? {} : { startedAt: window.from }),
    bookedFrom: window.from, expectedReturnAt: window.to,
    odometerStart: vehicle.mileage, fuelBefore: 0, conditionBefore: "GOOD", checksBefore: {},
    resumeToken: newTripToken(), linkEmailDueAt: now, returnReminderDueAt: window.to
  }, include: { vehicle: true } });
}

/** Turns a booking into a key-collection reservation at the HR table. */
export async function checkInBooking(tx: Tx, tripId: string, driverEmployeeId: string, now = new Date()) {
  const reference = await tx.vehicleTrip.findUnique({ where: { id: tripId }, select: { vehicleId: true } });
  if (!reference) throw new AttendanceError(404, "Booking not found.");
  await tx.$queryRaw`SELECT id FROM "Vehicle" WHERE id = ${reference.vehicleId} FOR UPDATE`;
  await tx.$queryRaw`SELECT id FROM "VehicleTrip" WHERE id = ${tripId} FOR UPDATE`;
  const trip = await tx.vehicleTrip.findUniqueOrThrow({ where: { id: tripId }, include: { vehicle: true } });
  if (trip.driverEmployeeId !== driverEmployeeId) throw new AttendanceError(403, "This booking belongs to another employee.");
  if (trip.archivedAt || trip.status !== "BOOKED") throw new AttendanceError(409, "This booking is no longer open. Reload the page.");
  const from = trip.bookedFrom ?? trip.startedAt;
  if (now.getTime() < from.getTime() - CHECK_IN_WINDOW_MS) throw new AttendanceError(409, `Check-in opens at ${myt(new Date(from.getTime() - CHECK_IN_WINDOW_MS))}.`);
  if (now.getTime() > from.getTime() + CHECK_IN_WINDOW_MS) throw new AttendanceError(409, "This booking was not checked in within 30 minutes of its start and has been released. Make a new booking.");
  if (await tx.vehicleTrip.findFirst({ where: { vehicleId: trip.vehicleId, archivedAt: null, status: { in: holdingStatuses as ("AWAITING_DEPARTURE" | "IN_PROGRESS")[] } } }))
    throw new AttendanceError(409, "The car has not been returned by the previous driver yet. Please contact HR.");
  const reason = carUnavailableReason(trip.vehicle, now, true);
  if (reason) throw new AttendanceError(409, `${reason} Please contact HR.`);
  await tx.vehicle.update({ where: { id: trip.vehicleId }, data: { status: "IN_USE" } });
  return tx.vehicleTrip.update({ where: { id: trip.id }, data: { status: "AWAITING_DEPARTURE", startedAt: now, odometerStart: trip.vehicle.mileage }, include: { vehicle: true } });
}

/** Releases bookings nobody checked in for within 30 minutes of the start. */
export async function releaseNoShows(now = new Date(), db: typeof prisma = prisma) {
  const released = await db.vehicleTrip.updateMany({
    where: { status: "BOOKED", archivedAt: null, bookedFrom: { lte: new Date(now.getTime() - CHECK_IN_WINDOW_MS) } },
    data: { status: "NO_SHOW", endedAt: now, noticeKind: "NO_SHOW", noticeDueAt: now, linkEmailDueAt: null, returnReminderDueAt: null }
  });
  return released.count;
}

const windowSchema = z.object({ startAt: z.string().datetime().nullable().optional(), endAt: z.string().datetime() });
const detailsSchema = z.object({ vehicleId: z.string().min(1), destination: z.string().trim().min(2).max(500), purpose: z.string().trim().min(2).max(1000), passengers: z.number().int().min(1).max(20).default(1) });
const editSchema = z.object({ vehicleId: z.string().min(1).optional(), startAt: z.string().datetime(), endAt: z.string().datetime(), destination: z.string().trim().min(2).max(500).optional(), purpose: z.string().trim().min(2).max(1000).optional() });

/** `guest` builds the public /fleet/api router: availability only. */
export function createVehicleBookingRouter({ guest = false } = {}) {
  const router = Router();
  const hr = guest ? Router() : router;
  // Which cars are free for a window. Used by the employee booking form and HR.
  router.get("/vehicle-availability", async (req, res, next) => {
    try {
      const now = new Date();
      const startAt = typeof req.query.startAt === "string" && req.query.startAt ? req.query.startAt : null;
      const window = bookingWindow(startAt, String(req.query.endAt ?? ""), now);
      const excludeId = typeof req.query.excludeTripId === "string" ? req.query.excludeTripId : undefined;
      const [cars, trips] = await Promise.all([
        prisma.vehicle.findMany({ where: { archivedAt: null }, orderBy: { plate: "asc" }, select: { id: true, plate: true, model: true, category: true, photo: true, mileage: true, serviceAt: true, serviceDueDate: true, status: true, archivedAt: true } }),
        prisma.vehicleTrip.findMany({ where: { archivedAt: null, status: { in: [...scheduledStatuses] } }, select: { id: true, vehicleId: true, status: true, bookedFrom: true, startedAt: true, expectedReturnAt: true } })
      ]);
      res.set("Cache-Control", "no-store").json(cars.map(({ serviceAt, serviceDueDate, archivedAt, ...car }) => {
        const clash = findClash(trips.filter(trip => trip.vehicleId === car.id), window.from, window.to, now, excludeId);
        const reason = carUnavailableReason({ ...car, serviceAt, serviceDueDate, archivedAt }, window.from, window.immediate && !(excludeId && trips.some(trip => trip.id === excludeId && trip.vehicleId === car.id)))
          ?? (clash ? `Booked ${myt(scheduledSpan(clash, now).from)} – ${myt(scheduledSpan(clash, now).to)}` : null);
        return { ...car, available: !reason, ...(reason ? { reason } : {}) };
      }));
    } catch (error) { next(error); }
  });

  // HR routes: protected by the same workspace access policy as fleet administration.
  hr.get("/vehicle-bookings", async (_req, res, next) => {
    try {
      res.json(await prisma.vehicleTrip.findMany({ where: { archivedAt: null, status: "BOOKED" }, include: { vehicle: true }, orderBy: { bookedFrom: "asc" }, take: 200 }));
    } catch (error) { next(error); }
  });
  hr.post("/vehicle-bookings", async (req, res, next) => {
    try {
      const input = detailsSchema.merge(windowSchema).extend({ employeeId: z.string().trim().min(1).max(100) }).parse(req.body);
      const employee = await prisma.employee.findFirst({ where: { employeeId: { equals: input.employeeId, mode: "insensitive" }, status: "ACTIVE" }, include: { department: departmentWithHod } });
      if (!employee?.name) throw new AttendanceError(400, "Choose an active employee.");
      const window = bookingWindow(input.startAt, input.endAt);
      const { employeeId: _employee, startAt: _start, endAt: _end, ...details } = input;
      const trip = await prisma.$transaction(tx => createBooking(tx, employee, details, window));
      res.status(201).json({ ...trip, linkDelivery: tripLinkDelivery(employee) });
    } catch (error) { next(error); }
  });
  hr.patch("/vehicle-bookings/:id", async (req, res, next) => {
    try {
      const input = editSchema.parse(req.body);
      const id = String(req.params.id);
      const now = new Date();
      const window = bookingWindow(input.startAt, input.endAt, now);
      const trip = await prisma.$transaction(async tx => {
        const current = await tx.vehicleTrip.findUnique({ where: { id } });
        if (!current) throw new AttendanceError(404, "Booking not found.");
        const vehicleId = input.vehicleId ?? current.vehicleId;
        // Lock both cars in a stable order so two edits cannot deadlock.
        for (const carId of [...new Set([current.vehicleId, vehicleId])].sort()) await tx.$queryRaw`SELECT id FROM "Vehicle" WHERE id = ${carId} FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM "VehicleTrip" WHERE id = ${id} FOR UPDATE`;
        const locked = await tx.vehicleTrip.findUniqueOrThrow({ where: { id } });
        if (locked.archivedAt || locked.status !== "BOOKED") throw new AttendanceError(409, "Only an upcoming booking can be changed.");
        const car = await tx.vehicle.findUniqueOrThrow({ where: { id: vehicleId } });
        const reason = carUnavailableReason(car, window.from, false);
        if (reason) throw new AttendanceError(409, reason);
        const clash = findClash(await tx.vehicleTrip.findMany({ where: { vehicleId, archivedAt: null, status: { in: [...scheduledStatuses] } } }), window.from, window.to, now, id);
        if (clash) throw new AttendanceError(409, `This car is already booked ${myt(scheduledSpan(clash, now).from)} – ${myt(scheduledSpan(clash, now).to)}.`);
        return tx.vehicleTrip.update({ where: { id }, data: {
          vehicleId, bookedFrom: window.from, startedAt: window.from, expectedReturnAt: window.to, returnReminderDueAt: window.to, odometerStart: car.mileage,
          ...(input.destination ? { destination: input.destination } : {}), ...(input.purpose ? { purpose: input.purpose } : {}),
          noticeKind: "HR_CHANGED", noticeDueAt: now
        }, include: { vehicle: true } });
      });
      res.json(trip);
    } catch (error) { next(error); }
  });
  hr.post("/vehicle-bookings/:id/cancel", async (req, res, next) => {
    try {
      const now = new Date();
      const saved = await prisma.vehicleTrip.updateMany({ where: { id: String(req.params.id), archivedAt: null, status: "BOOKED" }, data: { status: "CANCELLED", endedAt: now, noticeKind: "HR_CANCELLED", noticeDueAt: now, linkEmailDueAt: null, returnReminderDueAt: null } });
      if (!saved.count) throw new AttendanceError(409, "Only an upcoming booking can be cancelled here.");
      res.json({ cancelled: true });
    } catch (error) { next(error); }
  });
  return router;
}
