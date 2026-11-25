import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "./app.js";
import { prisma } from "./prisma.js";

async function serve(t: test.TestContext) {
  const server = createApp().listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  return `http://127.0.0.1:${address.port}`;
}
function stub(t: test.TestContext, target: any, key: string, handler: any) {
  const old = target[key]; target[key] = handler; t.after(() => { target[key] = old; });
}

test("the public /fleet/api exposes employee routes only, never HR administration", async t => {
  const root = await serve(t);
  for (const [method, path] of [["GET", "/vehicle-board"], ["GET", "/vehicle-bookings"], ["POST", "/vehicle-bookings"], ["DELETE", "/vehicle-trips/t1"], ["GET", "/vehicles/c1/maintenance"], ["GET", "/vehicle-trips"], ["PUT", "/vehicle-trips/t1/complete"], ["GET", "/employees"], ["GET", "/vehicle-drivers"]] as const) {
    const response = await fetch(`${root}/fleet/api${path}`, { method, headers: { "Content-Type": "application/json" }, body: method === "GET" ? undefined : "{}" });
    assert.equal(response.status, 404, `${method} ${path}`);
  }
});

test("the public car list and in-car QR show only what the page needs", async t => {
  stub(t, prisma.vehicle, "findMany", async ({ select }: any) => {
    assert.equal(select.assigned, undefined, "no internal assignment field");
    return [{ id: "c1", plate: "ABC 1", model: "Myvi", category: "Pool", photo: null, mileage: 10, serviceAt: 1000, serviceDueDate: null, status: "AVAILABLE" }];
  });
  stub(t, prisma.vehicle, "findFirst", async ({ where }: any) => where.id === "c1" ? { id: "c1", plate: "ABC 1", model: "Myvi", photo: null, mileage: 10, status: "IN_USE", serviceAt: 1000, serviceDueDate: null } : null);
  stub(t, prisma.vehicleTrip, "findMany", async () => [
    { id: "t1", status: "IN_PROGRESS", driverName: "Ali", bookedFrom: null, startedAt: new Date("2026-11-25T01:00:00Z"), expectedReturnAt: new Date("2026-11-25T05:00:00Z") },
    { id: "b1", status: "BOOKED", driverName: "Siti", bookedFrom: new Date("2026-11-26T01:00:00Z"), startedAt: new Date("2026-11-26T01:00:00Z"), expectedReturnAt: new Date("2026-11-26T03:00:00Z") }
  ]);
  const root = await serve(t);
  assert.equal((await (await fetch(`${root}/fleet/api/vehicles`)).json())[0].plate, "ABC 1");
  const response = await fetch(`${root}/fleet/api/cars/c1`);
  assert.equal(response.status, 200);
  const car = await response.json();
  assert.equal(car.current.driverName, "Ali");
  assert.equal(car.current.driverEmployeeId, undefined, "no employee IDs on the public car card");
  assert.equal(car.next.driverName, "Siti");
  assert.equal(car.serviceAt, undefined);
  assert.equal((await fetch(`${root}/fleet/api/cars/unknown`)).status, 404);
});

test("only the trip's driver can key in the return on the public page", async t => {
  stub(t, prisma.employee, "findFirst", async ({ where }: any) => ({ id: "e", employeeId: where.employeeId.equals, name: where.employeeId.equals === "EMP1" ? "Ali" : "Siti", status: "ACTIVE" }));
  const trip: any = { id: "t1", vehicleId: "c1", driverEmployeeId: "EMP1", status: "IN_PROGRESS", archivedAt: null, odometerStart: 100, locationConsent: false, vehicle: { serviceAt: 10000, serviceDueDate: null } };
  const tx: any = {
    $queryRaw: async () => [],
    vehicleTrip: { findUniqueOrThrow: async () => trip, update: async ({ data }: any) => Object.assign(trip, data) },
    vehicle: { update: async () => ({}) }
  };
  stub(t, prisma, "$transaction", async (run: any) => run(tx));
  const root = await serve(t);
  const body = { odometerEnd: 150, odometerPhotoAfter: "data:image/jpeg;base64,eA==", fuelAfter: 50, conditionAfter: "GOOD", checksAfter: { interiorClean: true, fuelCardReturned: true, belongingsRemoved: true, damageReported: false } };
  const send = (who: object) => fetch(`${root}/fleet/api/vehicle-trips/t1/return`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, ...who }) });
  assert.equal((await send({ driverEmployeeId: "EMP2", driverName: "Siti" })).status, 403);
  assert.equal(trip.status, "IN_PROGRESS");
  assert.equal((await send({ driverEmployeeId: "EMP1", driverName: "Ali" })).status, 200);
  assert.equal(trip.status, "COMPLETED");
});
