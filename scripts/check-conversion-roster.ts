import { readFileSync } from "node:fs";
import { parseProductionRoster } from "../server/src/production-roster.js";

const filename = process.argv[2];
if (!filename) throw new Error("Pass the Conversion .xlsx workbook path.");
async function main() {
const roster = await parseProductionRoster(readFileSync(filename));
const groups: Record<string, number> = {};
for (const row of roster.rows) {
  const key = `${row.line} / ${row.group || "Ungrouped"}`;
  groups[key] = (groups[key] || 0) + 1;
}
console.log(JSON.stringify({ sheet: roster.sheet, employees: roster.rows.length, groups }, null, 2));
}
void main();
