import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseEmployeeImport } from "./importer.js";

describe("parseEmployeeImport", () => {
  it("validates required employee import columns", async () => {
    const preview = await parseEmployeeImport(Buffer.from("name,department\nAiman,Production"), "employees.csv");

    assert.deepEqual(preview.errors, [
      {
      row: 1,
      field: "employee_id",
      message: 'Missing required column "employee_id".'
      }
    ]);
    assert.equal(preview.rows.length, 0);
  });

  it("normalizes valid CSV rows for commit", async () => {
    const preview = await parseEmployeeImport(
      Buffer.from("employee_id,name,department,line,role,status\nEMP001,Aiman,Production,Line 1,Operator,active"),
      "employees.csv"
    );

    assert.equal(preview.errors.length, 0);
    assert.deepEqual(preview.rows, [
      {
        employeeId: "EMP001",
        name: "Aiman",
        department: "Production",
        line: "Line 1",
        role: "Operator",
        status: "ACTIVE"
      }
    ]);
  });
});
