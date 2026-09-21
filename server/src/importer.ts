import { parse as parseCsv } from "csv-parse/sync";
import readXlsxFile from "read-excel-file/node";
import {
  employeeStatuses,
  type EmployeeImportError,
  type EmployeeImportPreview,
  type EmployeeImportRow,
  type EmployeeStatus
} from "@hr-training/shared";

type RawImportRow = Record<string, unknown>;

const requiredHeaders = ["employee_id", "department"];

const normalizeHeader = (value: string) =>
  value.trim().toLowerCase().replace(/[\s-]+/g, "_").replace(/[^a-z0-9_]/g, "");

const normalizeValue = (value: unknown) => String(value ?? "").trim();

const normalizeStatus = (value: unknown): EmployeeStatus | null => {
  const normalized = normalizeValue(value).toUpperCase();
  if (!normalized) return "ACTIVE";
  return employeeStatuses.includes(normalized as EmployeeStatus) ? (normalized as EmployeeStatus) : null;
};

const normalizeRawRow = (row: RawImportRow): Record<string, string> => {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(row)) {
    normalized[normalizeHeader(key)] = normalizeValue(value);
  }
  return normalized;
};

const readCsvRows = (buffer: Buffer): RawImportRow[] =>
  parseCsv(buffer.toString("utf8"), {
    columns: (headers: string[]) => headers.map(normalizeHeader),
    skip_empty_lines: true,
    trim: true
  }) as RawImportRow[];

const readWorkbookRows = async (buffer: Buffer): Promise<RawImportRow[]> => {
  const rows = await readXlsxFile(buffer);
  const [headers, ...bodyRows] = rows;
  if (!headers) return [];

  const normalizedHeaders = headers.map((header) => normalizeHeader(String(header ?? "")));
  return bodyRows.map((row) =>
    normalizedHeaders.reduce<RawImportRow>((record, header, index) => {
      record[header] = row[index] ?? "";
      return record;
    }, {})
  );
};

export const parseEmployeeImport = async (buffer: Buffer, filename = "employees.csv"): Promise<EmployeeImportPreview> => {
  const isWorkbook = /\.xlsx$/i.test(filename);
  const rawRows = isWorkbook ? await readWorkbookRows(buffer) : readCsvRows(buffer);
  const normalizedRows = rawRows.map(normalizeRawRow);
  const errors: EmployeeImportError[] = [];
  const validRows: EmployeeImportRow[] = [];

  const availableHeaders = new Set(Object.keys(normalizedRows[0] ?? {}));
  for (const header of requiredHeaders) {
    if (!availableHeaders.has(header)) {
      errors.push({
        row: 1,
        field: header,
        message: `Missing required column "${header}".`
      });
    }
  }

  if (errors.some((error) => error.row === 1)) {
    return {
      rows: [],
      errors,
      meta: {
        totalRows: rawRows.length,
        validRows: 0,
        invalidRows: rawRows.length
      }
    };
  }

  normalizedRows.forEach((row, index) => {
    const rowNumber = index + 2;
    const rowErrors: EmployeeImportError[] = [];
    const employeeId = row.employee_id;
    const department = row.department;
    const status = normalizeStatus(row.status);

    if (!employeeId) {
      rowErrors.push({ row: rowNumber, field: "employee_id", message: "Employee ID is required." });
    }

    if (!department) {
      rowErrors.push({ row: rowNumber, field: "department", message: "Department is required." });
    }

    if (!status) {
      rowErrors.push({
        row: rowNumber,
        field: "status",
        message: "Status must be ACTIVE, INACTIVE, or RESIGNED."
      });
    }

    if (rowErrors.length > 0) {
      errors.push(...rowErrors);
      return;
    }

    validRows.push({
      employeeId,
      department,
      name: row.name || undefined,
      line: row.line || undefined,
      role: row.role || undefined,
      status: status ?? "ACTIVE"
    });
  });

  return {
    rows: validRows,
    errors,
    meta: {
      totalRows: rawRows.length,
      validRows: validRows.length,
      invalidRows: rawRows.length - validRows.length
    }
  };
};
