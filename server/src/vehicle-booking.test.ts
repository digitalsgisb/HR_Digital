import test from "node:test";
import assert from "node:assert/strict";
import { env } from "./env.js";
import { bookingWindow, carUnavailableReason, checkInBooking, createBooking, findClash, releaseNoShows } from "./vehicle-booking.js";
import { processFleetEmails } from "./fleet-email.js";
import type { prisma } from "./prisma.js";

const now = new Date("2026-11-25T02:10:00Z"); // 10:10 Malaysia time
const at = (iso: string) => new Date(iso);
const status = (error: unknown) => (error as { status?: number }).status;

test("booking windows: now or 30-minute steps, up to 14 days ahead, at most 3 days long", () => {
  const immediate = bookingWindow(null, "2026-11-25T04:00:00Z", now);
  assert.equal(immediate.immediate, true);
  assert.equal(immediate.from, now);
  const later = bookingWindow("2026-11-26T01:00:00Z", "2026-11-26T05:30:00Z", now);
  assert.equal(later.immediate, false);
  for (const [start, end] of [
    ["2026-11-26T01:15:00Z", "2026-11-26T05:30:00Z"], // off the half hour
    ["2026-11-25T02:00:00Z", "2026-11-25T05:00:00Z"], // in the past
    ["2026-12-10T01:00:00Z", "2026-12-10T05:00:00Z"], // beyond 14 days
    ["2026-11-26T01:00:00Z", "2026-11-26T01:00:00Z"], // empty
    ["2026-11-26T01:00:00Z", "2026-11-29T01:30:00Z"]  // longer than 3 days
  ] as const) assert.throws(() => bookingWindow(start, end, now), (error: unknown) => status(error) === 400, `${start} → ${end}`);
  assert.throws(() => bookingWindow(null, "2026-11-25T02:00:00Z", now), (error: unknown) => status(error) === 400);
  assert.throws(() => bookingWindow(null, "2026-11-28T03:00:00Z", now), (error: unknown) => status(error) === 400);
});

test("clashes use booked times with no buffer, and a car still out is busy until now", () => {
  const booked = { id: "b", status: "BOOKED", bookedFrom: at("2026-11-26T01:00:00Z"), startedAt: at("2026-11-26T01:00:00Z"), expectedReturnAt: at("2026-11-26T05:00:00Z") };
  assert.equal(findClash([booked], at("2026-11-26T05:00:00Z"), at("2026-11-26T07:00:00Z"), now), undefined, "back-to-back is fine");
  assert.equal(findClash([booked], at("2026-11-26T04:30:00Z"), at("2026-11-26T07:00:00Z"), now)?.id, "b");
  assert.equal(findClash([booked], at("2026-11-26T02:00:00Z"), at("2026-11-26T03:00:00Z"), now, "b"), undefined, "a booking does not clash with itself");
  const overdue = { id: "o", status: "IN_PROGRESS", bookedFrom: null, startedAt: at("2026-11-24T01:00:00Z"), expectedReturnAt: at("2026-11-25T00:00:00Z") };
  assert.equal(findClash([overdue], now, at("2026-11-25T04:00:00Z"), now)?.id, "o", "an overdue car blocks taking it now");
  assert.equal(findClash([overdue], at("2026-11-26T01:00:00Z"), at("2026-11-26T03:00:00Z"), now), undefined, "but not a booking tomorrow");
});

test("service and out-of-service cars cannot be booked", () => {
  const car = { archivedAt: null, status: "AVAILABLE", mileage: 100, serviceAt: 1000, serviceDueDate: null };
  assert.equal(carUnavailableReason(car, now, false), null);
  assert.match(carUnavailableReason({ ...car, status: "OUT_OF_SERVICE" }, now, false)!, /out of service/);
  assert.match(carUnavailableReason({ ...car, mileage: 1000 }, now, false)!, /service/);
  assert.match(carUnavailableReason({ ...car, serviceDueDate: at("2026-11-26T00:00:00Z") }, at("2026-11-26T01:00:00Z"), false)!, /service/);
  assert.equal(carUnavailableReason({ ...car, status: "IN_USE" }, at("2026-11-26T01:00:00Z"), false), null, "a car out today can be booked for tomorrow");
  assert.match(carUnavailableReason({ ...car, status: "IN_USE" }, now, true)!, /in use/);
});

function fakeTx() {
  const car: any = { id: "car", archivedAt: null, status: "AVAILABLE", mileage: 500, serviceAt: 10000, serviceDueDate: null };
  const trips: any[] = [];
  const statusMatches = (where: any, trip: any) => !where.status?.in || where.status.in.includes(trip.status);
  const tx: any = {
    $queryRaw: async () => [],
    vehicle: {
      updateMany: async () => { if (car.status !== "AVAILABLE") return { count: 0 }; car.status = "IN_USE"; return { count: 1 }; },
      update: async ({ data }: any) => Object.assign(car, data),
      findUniqueOrThrow: async () => car
    },
    vehicleTrip: {
      findFirst: async ({ where }: any) => trips.find(trip => !trip.archivedAt && statusMatches(where, trip) && (!where.driverEmployeeId || trip.driverEmployeeId === where.driverEmployeeId) && (!where.vehicleId || trip.vehicleId === where.vehicleId)) ?? null,
      findMany: async ({ where }: any) => trips.filter(trip => !trip.archivedAt && statusMatches(where, trip) && trip.vehicleId === where.vehicleId),
      create: async ({ data }: any) => { const trip = { id: `trip-${trips.length + 1}`, startedAt: now, archivedAt: null, ...data, vehicle: car }; trips.push(trip); return trip; },
      findUnique: async ({ where }: any) => trips.find(trip => trip.id === where.id) ?? null,
      findUniqueOrThrow: async ({ where }: any) => trips.find(trip => trip.id === where.id),
      update: async ({ where, data }: any) => Object.assign(trips.find(trip => trip.id === where.id), data)
    }
  };
  return { tx, car, trips };
}
const details = { vehicleId: "car", destination: "Shah Alam", purpose: "Supplier visit", passengers: 1 };
const ali = { id: "e1", employeeId: "EMP1", name: "Ali" };
const siti = { id: "e2", employeeId: "EMP2", name: "Siti" };

test("an advance booking holds the calendar, not the car, and blocks overlapping bookings", async () => {
  const { tx, car } = fakeTx();
  const booking = await createBooking(tx, ali, details, bookingWindow("2026-11-26T01:00:00Z", "2026-11-26T05:00:00Z", now), now);
  assert.equal(booking.status, "BOOKED");
  assert.equal(car.status, "AVAILABLE", "the car stays free until check-in");
  assert.match(booking.resumeToken ?? "", /^[A-Za-z0-9_-]{32}$/);
  await assert.rejects(createBooking(tx, ali, details, bookingWindow("2026-11-27T01:00:00Z", "2026-11-27T02:00:00Z", now), now), (error: unknown) => status(error) === 409, "one booking per employee");
  await assert.rejects(createBooking(tx, siti, details, bookingWindow("2026-11-26T04:00:00Z", "2026-11-26T06:00:00Z", now), now), (error: unknown) => status(error) === 409, "overlap");
  const later = await createBooking(tx, siti, details, bookingWindow("2026-11-26T05:00:00Z", "2026-11-26T06:00:00Z", now), now);
  assert.equal(later.status, "BOOKED", "back-to-back is allowed");
});

test("booking now claims the car but cannot run into someone's later booking", async () => {
  const { tx, car } = fakeTx();
  await createBooking(tx, ali, details, bookingWindow("2026-11-25T04:00:00Z", "2026-11-25T06:00:00Z", now), now);
  await assert.rejects(createBooking(tx, siti, details, bookingWindow(null, "2026-11-25T05:00:00Z", now), now), (error: unknown) => status(error) === 409);
  assert.equal(car.status, "AVAILABLE");
  const quick = await createBooking(tx, siti, details, bookingWindow(null, "2026-11-25T04:00:00Z", now), now);
  assert.equal(quick.status, "AWAITING_DEPARTURE");
  assert.equal(car.status, "IN_USE");
});

test("check-in opens 30 minutes before the start and needs the car back", async () => {
  const { tx, car, trips } = fakeTx();
  const booking = await createBooking(tx, ali, details, bookingWindow("2026-11-25T04:00:00Z", "2026-11-25T06:00:00Z", now), now);
  await assert.rejects(checkInBooking(tx, booking.id, "EMP1", at("2026-11-25T03:20:00Z")), (error: unknown) => status(error) === 409, "too early");
  await assert.rejects(checkInBooking(tx, booking.id, "EMP2", at("2026-11-25T03:40:00Z")), (error: unknown) => status(error) === 403, "someone else");
  trips.push({ id: "previous", vehicleId: "car", status: "IN_PROGRESS", archivedAt: null, driverEmployeeId: "EMP9", startedAt: now, bookedFrom: null, expectedReturnAt: at("2026-11-25T03:30:00Z") });
  await assert.rejects(checkInBooking(tx, booking.id, "EMP1", at("2026-11-25T03:40:00Z")), (error: unknown) => status(error) === 409, "previous driver not back");
  trips.pop();
  car.mileage = 620;
  const checkedIn = await checkInBooking(tx, booking.id, "EMP1", at("2026-11-25T03:40:00Z"));
  assert.equal(checkedIn.status, "AWAITING_DEPARTURE");
  assert.equal(checkedIn.odometerStart, 620, "uses the mileage at check-in");
  assert.equal(car.status, "IN_USE");
  const late = await createBooking(tx, siti, details, bookingWindow("2026-11-26T04:00:00Z", "2026-11-26T06:00:00Z", now), now);
  await assert.rejects(checkInBooking(tx, late.id, "EMP2", at("2026-11-26T04:31:00Z")), (error: unknown) => status(error) === 409, "after the no-show window");
});

test("no-shows are released 30 minutes after the start and the employee is emailed", async () => {
  const trip: any = { id: "t1", status: "BOOKED", archivedAt: null, bookedFrom: at("2026-11-25T02:00:00Z"), resumeToken: "x".repeat(32), driverEmployeeId: "EMP1", driverName: "Ali", destination: "Office", expectedReturnAt: at("2026-11-25T04:00:00Z"), returnRemindersSent: 0, vehicle: { plate: "ABC 1", model: "Myvi" }, noticeDueAt: null, noticeKind: null, linkEmailDueAt: null, returnReminderDueAt: null };
  const db: any = {
    vehicleTrip: {
      updateMany: async ({ where, data }: any) => {
        if (where.status === "BOOKED") { if (trip.status !== "BOOKED" || trip.bookedFrom > where.bookedFrom.lte) return { count: 0 }; Object.assign(trip, data); return { count: 1 }; }
        if (where.noticeDueAt !== undefined && trip.noticeDueAt?.getTime() !== where.noticeDueAt?.getTime()) return { count: 0 };
        Object.assign(trip, data); return { count: 1 };
      },
      findMany: async ({ where }: any) => where.noticeDueAt && trip.noticeDueAt && trip.noticeDueAt <= where.noticeDueAt.lte ? [{ ...trip }] : [],
      findUnique: async () => ({ ...trip }),
      update: async ({ data }: any) => Object.assign(trip, data)
    },
    employee: { findFirst: async () => ({ employeeId: "EMP1", name: "Ali", email: "ali@example.test", status: "ACTIVE", hodName: null, hodEmail: null, department: null }) }
  };
  assert.equal(await releaseNoShows(at("2026-11-25T02:25:00Z"), db as typeof prisma), 0, "still inside the window");
  assert.equal(await releaseNoShows(at("2026-11-25T02:31:00Z"), db as typeof prisma), 1);
  assert.equal(trip.status, "NO_SHOW");
  const old = { ...env }; Object.assign(env, { emailTransport: "smtp", smtpHost: "localhost", smtpUser: "" });
  try {
    const sent: any[] = [];
    await processFleetEmails(at("2026-11-25T02:32:00Z"), db as typeof prisma, async message => { sent.push(message); return {}; });
    assert.equal(sent.length, 1);
    assert.match(sent[0].subject, /released/);
    assert.doesNotMatch(sent[0].text, /trip=/, "a released booking does not link to the old trip");
    assert.equal(trip.noticeDueAt, null);
  } finally { Object.assign(env, old); }
});
