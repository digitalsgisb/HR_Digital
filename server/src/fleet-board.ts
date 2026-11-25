import { Router } from "express";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";

export const locationSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracy: z.number().min(0).max(100000).nullable().optional()
});
/** Optional consent + location sent with depart / arrive / return. Unknown fields are ignored. */
export const locationFields = z.object({ locationConsent: z.boolean().default(false), location: locationSchema.nullable().optional() });

export type PingKind = "DEPART" | "ARRIVE" | "RETURN";
/** Stores where the phone was at one of the three moments; nothing is stored without a location. */
export async function recordPing(tx: Prisma.TransactionClient, tripId: string, kind: PingKind, location: z.infer<typeof locationSchema> | null | undefined) {
  if (!location) return;
  await tx.vehicleTripPing.create({ data: { tripId, kind, latitude: location.latitude, longitude: location.longitude, accuracy: location.accuracy ?? null } });
}

const tripSelect = {
  id: true, vehicleId: true, status: true, driverName: true, driverEmployeeId: true, destination: true, purpose: true, startedAt: true,
  departedAt: true, bookedFrom: true, expectedReturnAt: true, arrivedAt: true, locationConsent: true,
  pings: { orderBy: { recordedAt: "desc" as const }, take: 1, select: { kind: true, latitude: true, longitude: true, accuracy: true, recordedAt: true } }
};

export function createFleetBoardRouter() {
  const router = Router();
  // HR route: the live board. Protected by the same workspace access policy as fleet administration.
  router.get("/vehicle-board", async (_req, res, next) => {
    try {
      const now = new Date();
      const [cars, trips] = await Promise.all([
        prisma.vehicle.findMany({ where: { archivedAt: null }, orderBy: { plate: "asc" }, select: { id: true, plate: true, model: true, category: true, photo: true, mileage: true, status: true } }),
        prisma.vehicleTrip.findMany({ where: { archivedAt: null, status: { in: ["BOOKED", "AWAITING_DEPARTURE", "IN_PROGRESS"] } }, select: tripSelect, orderBy: { startedAt: "asc" } })
      ]);
      const shape = ({ pings, vehicleId: _vehicle, ...trip }: (typeof trips)[number]) => ({ ...trip, lastPing: pings[0] ?? null });
      res.set("Cache-Control", "no-store").json({
        now: now.toISOString(),
        cars: cars.map(car => {
          const own = trips.filter(trip => trip.vehicleId === car.id);
          const current = own.find(trip => trip.status !== "BOOKED");
          const next = own.filter(trip => trip.status === "BOOKED").sort((a, b) => (a.bookedFrom ?? a.startedAt).getTime() - (b.bookedFrom ?? b.startedAt).getTime())[0];
          return { ...car, current: current ? shape(current) : null, next: next ? shape(next) : null };
        })
      });
    } catch (error) { next(error); }
  });
  return router;
}
