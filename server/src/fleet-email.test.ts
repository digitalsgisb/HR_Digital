import test from "node:test";
import assert from "node:assert/strict";
import { env } from "./env.js";
import { fleetTripUrl, newTripToken, nextDailyReminderAt, processFleetEmails, renderFleetTripEmail, tripLinkRecipient, tripTokenPattern } from "./fleet-email.js";
import type { prisma } from "./prisma.js";

test("daily return reminders go out at 09:00 Malaysia time the next calendar day", () => {
  // 18:00 MYT on 25 Nov → 09:00 MYT on 26 Nov.
  assert.equal(nextDailyReminderAt(new Date("2026-11-25T10:00:00Z")).toISOString(), "2026-11-26T01:00:00.000Z");
  // 08:30 MYT is still "today": the next reminder is tomorrow, not 30 minutes later.
  assert.equal(nextDailyReminderAt(new Date("2026-11-25T00:30:00Z")).toISOString(), "2026-11-26T01:00:00.000Z");
  // Weekends are included because cars are used then too.
  assert.equal(nextDailyReminderAt(new Date("2026-11-28T02:00:00Z")).toISOString(), "2026-11-29T01:00:00.000Z");
});

test("trip links go to the employee, else their HOD, else nobody", () => {
  const base = { employeeId: "EMP1", name: "Ali", hodName: null, hodEmail: null, department: null };
  assert.deepEqual(tripLinkRecipient({ ...base, email: "Ali@Example.test" }), { to: "ali@example.test", role: "employee", name: "Ali" });
  assert.deepEqual(tripLinkRecipient({ ...base, email: null, hodName: "Head", hodEmail: "head@example.test" }), { to: "head@example.test", role: "hod", name: "Head" });
  assert.equal(tripLinkRecipient({ ...base, email: "not-an-email" }), null);
  assert.equal(tripLinkRecipient(null), null);
});

test("trip tokens and links are URL-safe and point at the fleet page", () => {
  const token = newTripToken();
  assert.match(token, tripTokenPattern);
  const url = new URL(fleetTripUrl(token));
  assert.equal(url.pathname, "/fleet/");
  assert.equal(url.searchParams.get("trip"), token);
});

test("trip emails escape driver text and carry the lost-link warning", () => {
  const trip = { driverName: "<b>Ali</b>", driverEmployeeId: "EMP1", destination: "Shah Alam", expectedReturnAt: new Date("2026-11-25T09:00:00Z"), status: "IN_PROGRESS", vehicle: { plate: "ABC 1", model: "Myvi" } };
  const hod = renderFleetTripEmail("link", trip, { role: "hod", name: "Head" }, "https://hr.example.test/?fleet=1&trip=x");
  assert.match(hod.subject, /please forward/);
  assert.match(hod.html, /&lt;b&gt;Ali&lt;\/b&gt;/);
  assert.doesNotMatch(hod.html, /<b>Ali<\/b>/);
  assert.match(hod.text, /IF YOU LOSE THIS LINK/);
  const reminder = renderFleetTripEmail("reminder", trip, { role: "employee", name: "Ali" }, "https://hr.example.test/?fleet=1&trip=x", 3);
  assert.match(reminder.subject, /key in your car return/);
  assert.match(reminder.text, /reminder 3/);
});

function fixture() {
  const trip: any = { id: "trip-1", resumeToken: newTripToken(), archivedAt: null, status: "IN_PROGRESS", driverEmployeeId: "EMP1", driverName: "Ali", destination: "Office", expectedReturnAt: new Date("2026-11-25T08:00:00Z"), createdAt: new Date("2026-11-25T01:00:00Z"),
    linkEmailDueAt: new Date("2026-11-25T01:00:00Z"), linkEmailedAt: null, linkEmailRecipient: null, returnReminderDueAt: new Date("2026-11-25T08:00:00Z"), returnRemindersSent: 0, vehicle: { plate: "ABC 1", model: "Myvi" } };
  const employee: any = { employeeId: "EMP1", name: "Ali", email: "ali@example.test", status: "ACTIVE", hodName: null, hodEmail: null, department: null };
  const lte = (value: Date | null, bound?: Date) => !bound || (!!value && value <= bound);
  const matches = (where: any) => (!where.id || where.id === trip.id) && (!where.status?.in || where.status.in.includes(trip.status)) && (where.archivedAt !== null || trip.archivedAt === null)
    && lte(trip.linkEmailDueAt, where.linkEmailDueAt?.lte) && lte(trip.returnReminderDueAt, where.returnReminderDueAt?.lte)
    && (!(where.linkEmailDueAt instanceof Date) || trip.linkEmailDueAt?.getTime() === where.linkEmailDueAt.getTime())
    && (!(where.returnReminderDueAt instanceof Date) || trip.returnReminderDueAt?.getTime() === where.returnReminderDueAt.getTime());
  const apply = (data: any) => { for (const [key, value] of Object.entries(data)) trip[key] = value && typeof value === "object" && "increment" in (value as any) ? trip[key] + (value as any).increment : value; };
  const db = {
    vehicleTrip: {
      findMany: async ({ where }: any) => matches(where) ? [{ ...trip }] : [],
      findUnique: async () => ({ ...trip }),
      updateMany: async ({ where, data }: any) => { if (!matches(where)) return { count: 0 }; apply(data); return { count: 1 }; },
      update: async ({ data }: any) => { apply(data); return trip; }
    },
    employee: { findFirst: async () => employee }
  } as unknown as typeof prisma;
  return { trip, employee, db };
}

test("the worker sends the link once, then one return reminder per day until the trip closes", async () => {
  const old = { ...env }; Object.assign(env, { emailTransport: "smtp", smtpHost: "localhost", smtpUser: "" });
  try {
    const { trip, db } = fixture();
    const sent: any[] = [];
    const send = async (message: any) => { sent.push(message); return {}; };
    await processFleetEmails(new Date("2026-11-25T02:00:00Z"), db, send);
    assert.equal(sent.length, 1);
    assert.match(sent[0].subject, /trip link/);
    assert.equal(trip.linkEmailDueAt, null);
    assert.equal(trip.linkEmailRecipient, "ali@example.test");
    await processFleetEmails(new Date("2026-11-25T03:00:00Z"), db, send);
    assert.equal(sent.length, 1, "nothing new is due");
    await processFleetEmails(new Date("2026-11-25T08:05:00Z"), db, send);
    assert.equal(sent.length, 2);
    assert.match(sent[1].subject, /Reminder/);
    assert.equal(trip.returnRemindersSent, 1);
    assert.equal(trip.returnReminderDueAt.toISOString(), "2026-11-26T01:00:00.000Z");
    await processFleetEmails(new Date("2026-11-25T12:00:00Z"), db, send);
    assert.equal(sent.length, 2, "only one reminder per day");
    trip.status = "COMPLETED";
    await processFleetEmails(new Date("2026-11-26T01:05:00Z"), db, send);
    assert.equal(sent.length, 2, "closed trips are never reminded");
  } finally { Object.assign(env, old); }
});

test("a failed send is retried after the lease and an employee without email falls back to the HOD", async () => {
  const old = { ...env }; Object.assign(env, { emailTransport: "smtp", smtpHost: "localhost", smtpUser: "" });
  try {
    const { trip, employee, db } = fixture();
    employee.email = null; employee.hodName = "Head"; employee.hodEmail = "head@example.test";
    trip.returnReminderDueAt = null;
    let fail = true;
    const sent: any[] = [];
    const send = async (message: any) => { if (fail) throw new Error("SMTP down"); sent.push(message); return {}; };
    await processFleetEmails(new Date("2026-11-25T02:00:00Z"), db, send);
    assert.equal(sent.length, 0);
    assert.ok(trip.linkEmailDueAt > new Date("2026-11-25T02:00:00Z"), "leased, not lost");
    fail = false;
    await processFleetEmails(new Date("2026-11-25T02:10:00Z"), db, send);
    assert.equal(sent.length, 0, "lease still held");
    await processFleetEmails(new Date("2026-11-25T02:31:00Z"), db, send);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].to, "head@example.test");
    assert.match(sent[0].subject, /please forward/);
  } finally { Object.assign(env, old); }
});

test("a trip link reopens only an open trip", async (t) => {
  const { createApp } = await import("./app.js");
  const { prisma: db } = await import("./prisma.js");
  const token = newTripToken();
  const trip: any = { id: "trip-1", resumeToken: token, archivedAt: null, status: "IN_PROGRESS", driverEmployeeId: "EMP1", driverName: "Ali", vehicle: { plate: "ABC 1" } };
  const old = db.vehicleTrip.findUnique;
  (db.vehicleTrip as any).findUnique = async ({ where }: any) => where.resumeToken === token ? trip : null;
  t.after(() => { (db.vehicleTrip as any).findUnique = old; });
  const server = createApp().listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const root = `http://127.0.0.1:${address.port}/api/vehicle-trips/resume/`;
  const ok = await fetch(root + token);
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get("cache-control"), "no-store");
  assert.deepEqual((await ok.json()).driver, { employeeId: "EMP1", name: "Ali" });
  assert.equal((await fetch(root + "short")).status, 404);
  assert.equal((await fetch(root + newTripToken())).status, 404);
  trip.status = "COMPLETED";
  assert.equal((await fetch(root + token)).status, 410);
});
