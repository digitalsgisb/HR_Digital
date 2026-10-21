import { z } from "zod";
import type { EmployeeEmailImportPreview } from "@hr-training/shared";
import { readImportTable } from "./importer.js";

type EmployeeMatch = { employeeId: string; name: string | null; email?: string | null };
const nameKey = (value: string) => value.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

export async function parseEmployeeEmails(buffer: Buffer, filename: string, employees: EmployeeMatch[]): Promise<EmployeeEmailImportPreview> {
  const table = await readImportTable(buffer, filename, ["display_name", "user_principal_name"]);
  if (!["display_name", "user_principal_name"].every((header) => table.headers.includes(header))) {
    throw Object.assign(new Error('Email file needs "Display name" and "User principal name" columns.'), { status: 400 });
  }
  if (new Set(table.headers.filter(Boolean)).size !== table.headers.filter(Boolean).length) {
    throw Object.assign(new Error("The email file contains duplicate column names."), { status: 400 });
  }
  const names = new Map<string, EmployeeMatch[]>();
  for (const employee of employees) {
    if (!employee.name) continue;
    const key = nameKey(employee.name);
    names.set(key, [...(names.get(key) ?? []), employee]);
  }
  const seenEmails = new Set<string>();
  const assignedIds = new Set<string>();
  const rows: EmployeeEmailImportPreview["rows"] = [];
  for (const [index, values] of table.rows.entries()) {
    if (!values.some((value) => String(value ?? "").trim())) continue;
    const name = String(values[table.headers.indexOf("display_name")] ?? "").trim();
    const email = String(values[table.headers.indexOf("user_principal_name")] ?? "").trim().toLowerCase();
    const result: EmployeeEmailImportPreview["rows"][number] = { row: table.headerRow + index + 1, name, email };
    if (!z.string().email().safeParse(email).success) {
      result.issue = "Invalid email address. Fix this row in Excel."; result.invalid = true;
    } else if (seenEmails.has(email)) {
      result.issue = "Duplicate email in this file. Keep one row per address."; result.invalid = true;
    } else {
      const candidates = names.get(nameKey(name)) ?? [];
      const owner = employees.find((employee) => employee.email?.toLowerCase() === email);
      if (candidates.length === 1 && !assignedIds.has(candidates[0].employeeId) && (!owner || owner.employeeId === candidates[0].employeeId)) {
        result.employeeId = candidates[0].employeeId; result.existingEmail = candidates[0].email;
        assignedIds.add(candidates[0].employeeId);
      } else {
        result.issue = owner ? "Address is already assigned. Review the employee." : candidates.length > 1 ? "More than one employee has this name. Choose the employee." : candidates.length === 1 ? "Another row matched this employee. Choose one address." : "No exact name match. Choose an employee or leave this account out.";
      }
    }
    if (email) seenEmails.add(email);
    rows.push(result);
  }
  return { rows, matched: rows.filter((row) => row.employeeId).length, needsReview: rows.filter((row) => !row.employeeId).length };
}
