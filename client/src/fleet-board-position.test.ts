import test from "node:test";
import assert from "node:assert/strict";
import { estimatePosition, formatDuration } from "./fleet-board-position";

const trip = { status: "IN_PROGRESS" as const, startedAt: "2026-11-25T01:00:00Z", departedAt: "2026-11-25T01:00:00Z", expectedReturnAt: "2026-11-25T05:00:00Z", arrivedAt: null };
const at = (iso: string) => Date.parse(iso);

test("cars move out, sit around the destination at halfway, then head back", () => {
  assert.deepEqual(estimatePosition(trip, at("2026-11-25T02:00:00Z")), { progress: 0.25, phase: "outbound", overdueMs: 0 });
  assert.equal(estimatePosition(trip, at("2026-11-25T03:00:00Z")).phase, "at-destination");
  assert.deepEqual(estimatePosition(trip, at("2026-11-25T04:00:00Z")), { progress: 0.75, phase: "returning", overdueMs: 0 });
});

test("a confirmed arrival holds the car at the destination until halfway", () => {
  const arrived = { ...trip, arrivedAt: "2026-11-25T01:40:00Z" };
  assert.deepEqual(estimatePosition(arrived, at("2026-11-25T01:50:00Z")), { progress: 0.5, phase: "arrived", overdueMs: 0 });
  assert.equal(estimatePosition(arrived, at("2026-11-25T04:00:00Z")).phase, "returning");
});

test("overdue cars sit at HR with the time overdue; waiting and open-ended trips are parked", () => {
  assert.deepEqual(estimatePosition(trip, at("2026-11-25T06:30:00Z")), { progress: 1, phase: "overdue", overdueMs: 90 * 60000 });
  assert.equal(estimatePosition({ ...trip, status: "AWAITING_DEPARTURE" }, at("2026-11-25T02:00:00Z")).phase, "collecting");
  assert.equal(estimatePosition({ ...trip, expectedReturnAt: null }, at("2026-11-25T02:00:00Z")).phase, "no-return-time");
  assert.equal(formatDuration(90 * 60000), "1 h 30 min");
  assert.equal(formatDuration(26 * 3600000), "1 d 2 h");
});
