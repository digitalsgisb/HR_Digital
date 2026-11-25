import type { FleetBoardTrip } from "@hr-training/shared";

export type BoardPhase = "collecting" | "outbound" | "at-destination" | "arrived" | "returning" | "overdue" | "no-return-time";
export type BoardPosition = { progress: number; phase: BoardPhase; overdueMs: number };

/**
 * Estimated place on the HR → destination → HR track (0 = left HR, 0.5 = destination, 1 = right HR).
 * There is no live GPS: the estimate uses departure and expected return times, and a confirmed
 * "I've arrived" holds the car at the destination until the trip's halfway point.
 */
export function estimatePosition(trip: Pick<FleetBoardTrip, "status" | "departedAt" | "startedAt" | "expectedReturnAt" | "arrivedAt">, now: number): BoardPosition {
  if (trip.status !== "IN_PROGRESS") return { progress: 0, phase: "collecting", overdueMs: 0 };
  const start = Date.parse(trip.departedAt ?? trip.startedAt);
  const end = trip.expectedReturnAt ? Date.parse(trip.expectedReturnAt) : NaN;
  if (!Number.isFinite(end) || end <= start) return { progress: trip.arrivedAt ? 0.5 : 0.25, phase: trip.arrivedAt ? "arrived" : "no-return-time", overdueMs: 0 };
  if (now >= end) return { progress: 1, phase: "overdue", overdueMs: now - end };
  const fraction = Math.min(1, Math.max(0, (now - start) / (end - start)));
  if (trip.arrivedAt && fraction < 0.5) return { progress: 0.5, phase: "arrived", overdueMs: 0 };
  const phase: BoardPhase = fraction < 0.45 ? "outbound" : fraction <= 0.55 ? "at-destination" : "returning";
  return { progress: fraction, phase, overdueMs: 0 };
}

export const phaseLabel: Record<BoardPhase, string> = {
  collecting: "Collecting key",
  outbound: "Heading out (estimated)",
  "at-destination": "Around destination (estimated)",
  arrived: "Arrived at destination",
  returning: "Heading back (estimated)",
  overdue: "Overdue",
  "no-return-time": "Out · no return time"
};

export function formatDuration(ms: number) {
  const minutes = Math.max(1, Math.round(ms / 60000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours} h ${minutes % 60} min` : `${Math.floor(hours / 24)} d ${hours % 24} h`;
}
