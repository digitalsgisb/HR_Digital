import assert from "node:assert/strict";
import { test } from "node:test";
import { parseProductionRows } from "./production-roster.js";

test("Conversion assignments use section headings and skip attendance totals and vacant slots", () => {
  const result = parseProductionRows([
    ["Section : FC1 GROUP A"], ["No.", "Employee No.", "Employee Name"],
    [1, 5000609, "Roster name (LDR)"], [], [2], ["Total Actual", 8],
    ["Attendance Section : FC2 Shift A"], ["Section : MF GROUP A"], [1, 5000461, "Other"],
    ["Section : MF Normal Shift"], [1, 5000477, "Normal"],
    ["Section : LM & SA"], [1, 5000011, "Support"],
    ["Section : Supervisor"], [1, 5000017, "Supervisor"]
  ]);
  assert.equal(result.length, 5);
  assert.deepEqual(result.map(({line,group}) => ({line,group})), [
    {line:"FC1",group:"A"}, {line:"MF",group:"A"}, {line:"MF",group:"Normal Shift"},
    {line:"LM & SA",group:null}, {line:"Supervisor",group:null}
  ]);
  assert.equal(result[0].row, 3);
});

test("conflicting IDs and unknown section headings stop the import", () => {
  assert.throws(() => parseProductionRows([["Section : FC1 GROUP A"], [1,5000609], ["Section : FC1 GROUP B"], [1,5000609]]), /Duplicate/);
  assert.throws(() => parseProductionRows([["Section : Unknown"], [1,5000609]]), /Unrecognized/);
  assert.throws(() => parseProductionRows([[1,5000609]]), /no section/);
  assert.throws(() => parseProductionRows([]), /No Conversion employees/);
});
