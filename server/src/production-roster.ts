import readXlsxFile, { readSheetNames } from "read-excel-file/node";

export type ProductionAssignment = { employeeId: string; name: string; section: "Conversion"; line: string; group: string | null; row: number };
export function parseProductionRows(rows: unknown[][]): ProductionAssignment[] {
  const assignments: ProductionAssignment[] = [];
  const seen = new Set<string>();
  let line = ""; let group: string | null = null;
  rows.forEach((cells, index) => {
    const heading = String(cells[0] ?? "").trim();
    if (/^Section\s*:/i.test(heading)) {
      const label = heading.replace(/^Section\s*:\s*/i, "").trim();
      const match = /^(FC\d+|MF)\s+GROUP\s+([A-Z])$/i.exec(label);
      if (match) { line = match[1].toUpperCase(); group = match[2].toUpperCase(); }
      else if (/^MF\s+Normal Shift$/i.test(label)) { line = "MF"; group = "Normal Shift"; }
      else if (/^LM\s*&\s*SA$/i.test(label)) { line = "LM & SA"; group = null; }
      else if (/^Supervisor$/i.test(label)) { line = "Supervisor"; group = null; }
      else throw new Error(`Unrecognized Conversion section at row ${index + 1}: ${label}`);
    }
    const employeeId = String(cells[1] ?? "").trim();
    if (!/^\d{7}$/.test(employeeId)) return;
    if (!line) throw new Error(`Employee at row ${index + 1} has no section heading.`);
    if (seen.has(employeeId)) throw new Error(`Duplicate employee ID ${employeeId}. Review the roster before importing.`);
    seen.add(employeeId);
    assignments.push({ employeeId, name: String(cells[2] ?? "").trim(), section: "Conversion", line, group, row: index + 1 });
  });
  if (!assignments.length) throw new Error("No Conversion employees were found in the selected sheet.");
  return assignments;
}

export async function parseProductionRoster(buffer: Buffer) {
  const names = await readSheetNames(buffer);
  const sheet = names.find(name => /^OKT\s+2026$/i.test(name.trim())) ?? names.find(name => /^OCT\s+2026$/i.test(name.trim()));
  if (!sheet) throw new Error("The workbook must contain OKT 2026 or OCT 2026. Older tabs are not used.");
  return { sheet, rows: parseProductionRows(await readXlsxFile(buffer, { sheet })) };
}
