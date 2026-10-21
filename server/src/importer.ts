import { parse as parseCsv } from "csv-parse/sync";
import readXlsxFile, { readSheetNames } from "read-excel-file/node";
import { z } from "zod";
import {
  employeeStatuses, type EmployeeImportError, type EmployeeImportPreview,
  type EmployeeImportRow, type EmployeeStatus
} from "@hr-training/shared";

const requiredHeaders = ["employee_id", "department"];
const aliases: Record<string, string> = {
  employee: "employee_id", employee_number: "employee_id", employee_no: "employee_id",
  employeeid: "employee_id", staff_id: "employee_id", staff_no: "employee_id",
  full_name: "name", employee_name: "name", job_type: "role", job_title: "role",
  position: "role", employment_status: "status", email_address: "email"
};
const normalizeHeader = (value: unknown) => {
  const header = String(value ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_").replace(/[^a-z0-9_]/g, "");
  return aliases[header] ?? header;
};
const text = (value: unknown) => String(value ?? "").trim();
export type ImportTable = { headers: string[]; rows: unknown[][]; headerRow: number; sheet?: string };

function findTable(rows: unknown[][], sheet?: string, required = requiredHeaders): ImportTable {
  const headerIndex = rows.findIndex((row) => {
    const headers = row.map(normalizeHeader);
    return required.every((header) => headers.includes(header));
  });
  const index = headerIndex < 0 ? 0 : headerIndex;
  return { headers: (rows[index] ?? []).map(normalizeHeader), rows: rows.slice(index + 1), headerRow: index + 1, sheet };
}

export const readImportTable = async (buffer: Buffer, filename: string, required = requiredHeaders): Promise<ImportTable> => {
  let table: ImportTable;
  if (/\.xlsx$/i.test(filename)) {
    const sheets = await readSheetNames(buffer);
    const tables: ImportTable[] = [];
    for (const sheet of sheets) tables.push(findTable(await readXlsxFile(buffer, { sheet }), sheet, required));
    const matches = tables.filter((candidate) => required.every((header) => candidate.headers.includes(header)));
    if (matches.length > 1) throw Object.assign(new Error("More than one matching sheet was found. Upload a workbook containing just the sheet you want to import."), { status: 400 });
    table = matches[0] ?? tables[0] ?? findTable([]);
  } else if (/\.csv$/i.test(filename)) {
    table = findTable(parseCsv(buffer.toString("utf8"), { bom: true, relax_column_count: true, skip_empty_lines: false, trim: true }) as unknown[][], undefined, required);
  } else {
    throw Object.assign(new Error("Choose an .xlsx or .csv file. For older .xls files, save as .xlsx in Excel first."), { status: 400 });
  }
  return table;
};

export const parseEmployeeImport = async (buffer: Buffer, filename = "employees.csv"): Promise<EmployeeImportPreview> => {
  const table = await readImportTable(buffer, filename);
  const errors: EmployeeImportError[] = [];
  const validRows: EmployeeImportRow[] = [];
  const rows = table.rows.map((values, index) => ({ values, rowNumber: table.headerRow + index + 1 }))
    .filter(({ values }) => values.some((value) => text(value)));
  const meta = () => ({ totalRows: rows.length, validRows: validRows.length, invalidRows: rows.length - validRows.length, ...(table.sheet ? { sheet: table.sheet } : {}) });
  for (const header of requiredHeaders) {
    if (!table.headers.includes(header)) errors.push({ row: table.headerRow, field: header, message: `Missing required column "${header}".` });
  }
  const seenHeaders = new Set<string>();
  for (const header of table.headers.filter(Boolean)) {
    if (seenHeaders.has(header)) errors.push({ row: table.headerRow, field: header, message: `More than one column maps to "${header}". Keep one column for this field.` });
    seenHeaders.add(header);
  }
  if (errors.length) return { rows: [], errors, meta: meta() };
  const seenIds = new Set<string>();
  for (const { values, rowNumber } of rows) {
    const row = Object.fromEntries(table.headers.filter(Boolean).map((header) => [header, text(values[table.headers.indexOf(header)])]));
    const employeeId = row.employee_id;
    const department = row.department;
    const status = (row.status || "ACTIVE").toUpperCase().replace(/[\s-]+/g, "_") as EmployeeStatus;
    const rowErrors: EmployeeImportError[] = [];
    if (!employeeId) rowErrors.push({ row: rowNumber, field: "employee_id", message: "Employee ID is required." });
    if (!department) rowErrors.push({ row: rowNumber, field: "department", message: "Department is required." });
    if (!employeeStatuses.includes(status)) rowErrors.push({ row: rowNumber, field: "status", message: `Status must be ${employeeStatuses.join(", ")}.` });
    if (row.email && !z.string().email().safeParse(row.email).success) rowErrors.push({ row: rowNumber, field: "email", message: "Enter a valid email address or leave it blank." });
    if (seenIds.has(employeeId)) rowErrors.push({ row: rowNumber, field: "employee_id", message: "Duplicate employee ID in this file. Keep one row per employee." });
    if (employeeId) seenIds.add(employeeId);
    if (rowErrors.length) { errors.push(...rowErrors); continue; }
    validRows.push({ employeeId, department, name: row.name || undefined,
      line: row.line || undefined, role: row.role || undefined, status,
      ...(row.company ? { company: row.company } : {}), ...(row.base ? { base: row.base } : {}), ...(row.email ? { email: row.email.toLowerCase() } : {}) });
  }
  return { rows: validRows, errors, meta: meta() };
};
