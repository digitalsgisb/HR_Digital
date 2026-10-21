import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseEmployeeImport } from "./importer.js";

describe("parseEmployeeImport", () => {
  it("allows blank emails and imports valid email columns", async () => {
    const result = await parseEmployeeImport(Buffer.from('Employee#,Name,Department,Email\n001,Sample,Production,\n002,Other,Production,OTHER@example.com\n003,Invalid,Production,bad-address'));
    assert.equal(result.meta.validRows, 2);
    assert.equal(result.rows[0].email, undefined);
    assert.equal(result.rows[1].email, "other@example.com");
    assert.equal(result.errors[0].field, "email");
  });
  it("reads SGI employment columns without losing company or base", async () => {
    const preview = await parseEmployeeImport(Buffer.from(
      '\uFEFFEmployee#,Name,Company,Base,Department,Job Type\n007001,Sample Employee,Example Industries,Port Klang,Maintenance,"TECH, MAINT"'
    ));
    assert.equal(preview.errors.length, 0);
    assert.deepEqual(preview.rows[0], {
      employeeId: "007001", name: "Sample Employee", company: "Example Industries",
      base: "Port Klang", department: "Maintenance", role: "TECH, MAINT", line: undefined, status: "ACTIVE"
    });
  });

  it("finds a header after title rows and reports original row numbers", async () => {
    const preview = await parseEmployeeImport(Buffer.from(
      'Employment details\nEmployee#,Name,Department,Status\n001,Sample,Production,on leave\n,,,\n002,Missing Department,,active\n001,Duplicate,Production,active\n003,Invalid Status,Production,unknown'
    ));
    assert.deepEqual(preview.meta, { totalRows: 4, validRows: 1, invalidRows: 3 });
    assert.equal(preview.rows[0].status, "ON_LEAVE");
    assert.deepEqual(preview.errors.map(({ row, field }) => ({ row, field })), [
      { row: 5, field: "department" }, { row: 6, field: "employee_id" }, { row: 7, field: "status" }
    ]);
    assert.match(preview.errors[2].message, /ON_LEAVE/);
    assert.match(preview.errors[2].message, /TERMINATED/);
  });

  it("rejects conflicting ID columns rather than silently overwriting one", async () => {
    const preview = await parseEmployeeImport(Buffer.from('Employee#,employee_id,Department\n001,002,Production'));
    assert.equal(preview.rows.length, 0);
    assert.match(preview.errors[0].message, /More than one column/);
  });

  it("explains how to convert unsupported legacy Excel files", async () => {
    await assert.rejects(parseEmployeeImport(Buffer.from('legacy'), 'employees.xls'), /save as .xlsx/);
  });

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
