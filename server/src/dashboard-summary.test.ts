import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { summarizeCourseHours, summarizeDepartmentHours } from "./dashboard-summary.js";

describe("dashboard summary helpers", () => {
  const records = [
    { department: "Production", employeeId: "EMP001", courseName: "GMP", status: "COMPLETED" as const, hours: 8 },
    { department: "Production", employeeId: "EMP002", courseName: "GMP", status: "REQUIRED" as const, hours: 8 },
    { department: "HR & Admin", employeeId: "EMP010", courseName: "Orientation", status: "COMPLETED" as const, hours: 4 }
  ];

  it("summarizes department hours from completed records only", () => {
    assert.deepEqual(summarizeDepartmentHours(records), [
      { department: "Production", hours: 8, employees: 2 },
      { department: "HR & Admin", hours: 4, employees: 1 }
    ]);
  });

  it("summarizes course hours from completed records only", () => {
    assert.deepEqual(summarizeCourseHours(records), [
      { course: "GMP", hours: 8 },
      { course: "Orientation", hours: 4 }
    ]);
  });
});
