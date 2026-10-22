import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "./app.js";
import { prisma } from "./prisma.js";

test("car QR loads only the requested active car and accepts a guest trip", async (t) => {
  const vehicle = { id: "car-qr", plate: "ABC 123", model: "Test car", mileage: 100, serviceAt: 10000, status: "AVAILABLE", archivedAt: null };
  let saved: any;
  const restore: Array<() => void> = [];
  const replace = (target: any, key: string, handler: any) => { const old = target[key]; target[key] = handler; restore.push(() => { target[key] = old; }); };
  t.after(() => restore.reverse().forEach(fn => fn()));
  replace(prisma.vehicle, "findFirst", async ({ where }: any) => {
    assert.equal(where.archivedAt, null);
    return where.id === vehicle.id ? { ...vehicle, trips: [] } : null;
  });
  replace(prisma.vehicle, "count", async () => 1);
  const tx = {
    vehicle: {
      findUniqueOrThrow: async () => vehicle,
      update: async ({ data }: any) => Object.assign(vehicle, data)
    },
    vehicleTrip: {
      findFirst: async () => saved ?? null,
      create: async ({ data }: any) => (saved = { id: "guest-trip", ...data, status: "IN_PROGRESS" }),
      findUniqueOrThrow: async () => ({ ...saved, vehicle })
    }
  };
  replace(prisma, "$transaction", async (run: any) => run(tx));
  const server = createApp().listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  try {
    const address = server.address(); assert.ok(address && typeof address !== "string");
    const root = `http://127.0.0.1:${address.port}/api`;
    const response = await fetch(`${root}/vehicles/car-qr`);
    assert.equal(response.status, 200);
    assert.equal((await response.json() as any).id, vehicle.id);
    assert.equal((await fetch(`${root}/vehicles/removed-car`)).status, 404);
    const input = { vehicleId: vehicle.id, driverEmployeeId: "GUEST", driverName: "Guest Driver", destination: "Port Klang", purpose: "Site visit", passengers: 1, odometerStart: 100, odometerPhotoBefore: "data:image/jpeg;base64,eA==", fuelBefore: 75, conditionBefore: "GOOD", checksBefore: { exterior: true, tyres: true, lights: true, documents: true } };
    const start = () => fetch(`${root}/vehicle-trips/start`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
    const started = await start();
    assert.equal(started.status, 201);
    assert.equal((await started.json() as any).driverName, "Guest Driver");
    assert.equal(saved.driverEmployeeId, "GUEST");
    assert.equal(vehicle.status, "IN_USE");
    assert.equal((await start()).status, 409);
    saved = undefined;
    vehicle.status = "AVAILABLE";
    vehicle.archivedAt = new Date() as any;
    assert.equal((await start()).status, 409);
    assert.equal(saved, undefined);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
