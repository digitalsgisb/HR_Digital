import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "./app.js";
import { prisma } from "./prisma.js";

function serve(t: test.TestContext) {
  const restore: Array<() => void> = [];
  const replace = (target: any, key: string, handler: any) => { const old = target[key]; target[key] = handler; restore.push(() => { target[key] = old; }); };
  t.after(() => restore.reverse().forEach(fn => fn()));
  return { replace, start: async () => {
    const server = createApp().listen(0, "127.0.0.1");
    await new Promise<void>(resolve => server.once("listening", resolve));
    t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
    const address = server.address(); assert.ok(address && typeof address !== "string");
    return `http://127.0.0.1:${address.port}/api`;
  } };
}

test("the board lists each car with its current trip, last pin and next booking", async t => {
  const { replace, start } = serve(t);
  replace(prisma.vehicle, "findMany", async () => [{ id: "a", plate: "AAA 1", model: "Myvi", category: "Pool", photo: null, mileage: 10, status: "IN_USE" }, { id: "b", plate: "BBB 2", model: "Axia", category: "Pool", photo: null, mileage: 20, status: "AVAILABLE" }]);
  const ping = { kind: "ARRIVE", latitude: 3.1, longitude: 101.6, accuracy: 12, recordedAt: new Date("2026-11-25T02:00:00Z") };
  const trip = (id: string, vehicleId: string, status: string, bookedFrom: string | null, pings: unknown[] = []) => ({ id, vehicleId, status, driverName: "Ali", driverEmployeeId: "EMP1", destination: "Shah Alam", purpose: "Visit", startedAt: new Date(bookedFrom ?? "2026-11-25T01:00:00Z"), departedAt: null, bookedFrom: bookedFrom ? new Date(bookedFrom) : null, expectedReturnAt: null, arrivedAt: null, locationConsent: true, pings });
  replace(prisma.vehicleTrip, "findMany", async () => [trip("t1", "a", "IN_PROGRESS", null, [ping]), trip("b2", "b", "BOOKED", "2026-11-27T01:00:00Z"), trip("b1", "b", "BOOKED", "2026-11-26T01:00:00Z")]);
  const root = await start();
  const response = await fetch(`${root}/vehicle-board`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const board = await response.json();
  const [a, b] = board.cars;
  assert.equal(a.current.id, "t1");
  assert.equal(a.current.lastPing.kind, "ARRIVE");
  assert.equal(a.current.vehicleId, undefined);
  assert.equal(b.current, null);
  assert.equal(b.next.id, "b1", "the earliest booking is next");
});

test("arrival is recorded once, only by the driver, with a location only when they consented", async t => {
  const { replace, start } = serve(t);
  replace(prisma.employee, "findFirst", async ({ where }: any) => ({ id: "e", employeeId: where.employeeId.equals, name: where.employeeId.equals === "EMP1" ? "Ali" : "Siti", status: "ACTIVE" }));
  const trip: any = { id: "t1", driverEmployeeId: "EMP1", status: "IN_PROGRESS", archivedAt: null, arrivedAt: null, locationConsent: false };
  const pings: any[] = [];
  const tx: any = {
    $queryRaw: async () => [],
    vehicleTrip: { findUnique: async () => ({ ...trip }), update: async ({ data }: any) => Object.assign(trip, data) },
    vehicleTripPing: { create: async ({ data }: any) => pings.push(data) }
  };
  replace(prisma, "$transaction", async (run: any) => run(tx));
  const root = await start();
  const arrive = (body: unknown) => fetch(`${root}/vehicle-trips/t1/arrive`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const location = { latitude: 3.1, longitude: 101.6, accuracy: 10 };
  assert.equal((await arrive({ driverEmployeeId: "EMP2", driverName: "Siti", location })).status, 403);
  assert.equal((await arrive({ driverEmployeeId: "EMP1", driverName: "Ali", location })).status, 200);
  assert.ok(trip.arrivedAt);
  assert.equal(pings.length, 0, "no consent, no location");
  const first = trip.arrivedAt;
  trip.locationConsent = true;
  assert.equal((await arrive({ driverEmployeeId: "EMP1", driverName: "Ali", location })).status, 200);
  assert.equal(trip.arrivedAt, first, "the first arrival time is kept");
  assert.equal(pings.length, 1);
  assert.equal(pings[0].kind, "ARRIVE");
  assert.equal((await arrive({ driverEmployeeId: "EMP1", driverName: "Ali", location: { latitude: 200, longitude: 0 } })).status, 400);
  trip.status = "COMPLETED";
  assert.equal((await arrive({ driverEmployeeId: "EMP1", driverName: "Ali" })).status, 409);
});
