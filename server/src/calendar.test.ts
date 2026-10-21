import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { calendarDays, malaysiaDate, shiftMonth } from "../../client/src/calendar-utils.js";
import { toCalendarSession } from "../../client/src/training-data.js";
import type { SessionListItem } from "../../client/src/types.js";
import { trainingPlanSchema } from "./training-plan.js";

describe("training calendar dates", () => {
  it("rejects invalid times, repeated participants and insufficient capacity", () => {
    const input = { title: "New session", category: "Safety", dateStart: "2026-10-21T01:00:00Z", dateEnd: "2026-10-21T04:00:00Z", trainerName: "Trainer", venue: "Meeting room", capacity: 2, deliveryMethod: "Online", participantEmployeeIds: ["one", "two"] };
    assert.equal(trainingPlanSchema.safeParse(input).success, true);
    assert.equal(trainingPlanSchema.safeParse({ ...input, dateEnd: input.dateStart }).success, false);
    assert.equal(trainingPlanSchema.safeParse({ ...input, participantEmployeeIds: ["one", "one"] }).success, false);
    assert.equal(trainingPlanSchema.safeParse({ ...input, capacity: 1 }).success, false);
  });
  it("crosses year boundaries and creates a complete Monday-first leap-month grid", () => {
    assert.equal(shiftMonth("2026-12", 1), "2027-01");
    assert.equal(shiftMonth("2026-01", -1), "2025-12");
    const days = calendarDays("2024-02");
    assert.equal(days.length, 42);
    assert.equal(days[0].date, "2024-01-29");
    assert.equal(days.filter((day) => !day.muted).length, 29);
    assert.equal(days.find((day) => day.date === "2024-02-29")?.day, 29);
  });
  it("uses the Malaysia date when UTC is still on the previous day", () => {
    assert.equal(malaysiaDate(new Date("2026-10-20T16:30:00Z")), "2026-10-21");
  });
  it("maps saved sessions and never infers completed attendance from an old date", () => {
    const session: SessionListItem = {
      id: "saved", dateStart: "2026-01-01T01:00:00Z", dateEnd: "2026-01-01T04:00:00Z",
      scopeType: "CUSTOM", venue: "Meeting room", capacity: 20, course: { id: "course", code: "REAL", name: "Saved training", defaultHours: 3, status: "ACTIVE", category: "Safety" },
      _count: { completions: 1 }, completions: [{ id: "record", status: "REQUIRED", hours: 0, employee: { id: "person", employeeId: "001", name: "Sample", status: "ACTIVE", department: { id: "dept", code: "OPS", name: "Operations" } } }]
    };
    const result = toCalendarSession(session, new Date("2026-10-21T00:00:00Z"));
    assert.equal(result.time, "09:00"); assert.equal(result.endTime, "12:00");
    assert.equal(result.status, "Scheduled"); assert.equal(result.attendees[0].status, "Required");
    session.completions![0].status = "COMPLETED";
    assert.equal(toCalendarSession(session).status, "Completed");
  });
});
