import { useState } from "react";
import { createPortal } from "react-dom";
import { MailCheck, X } from "lucide-react";
import type { EmployeeEmailImportPreview } from "@hr-training/shared";
import { api } from "./api";
import type { Employee } from "./types";

export function EmployeeEmailImport({ employees, onImported, showNotice }: {
  employees: Employee[]; onImported: () => Promise<void>; showNotice: (message: string) => void;
}) {
  const [preview, setPreview] = useState<EmployeeEmailImportPreview | null>(null);
  const [choices, setChoices] = useState<string[]>([]);
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const rows = preview?.rows.flatMap((row, index) => choices[index] && !row.invalid ? [{ employeeId: choices[index], email: row.email }] : []) ?? [];
  const duplicates = new Set(rows.map((row) => row.employeeId)).size !== rows.length;
  const replacements = rows.filter((row) => { const employee = employees.find((person) => person.employeeId === row.employeeId); return employee?.email && employee.email.toLowerCase() !== row.email; }).length;
  const sortedEmployees = [...employees].sort((a, b) => (a.name || a.employeeId).localeCompare(b.name || b.employeeId));
  return <>
    <label className="button button-secondary upload-button"><MailCheck size={16} />{busy ? "Reading emails…" : "Import emails"}<input type="file" accept=".xlsx,.csv" disabled={busy} onChange={async (event) => {
      const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
      setBusy(true); setError("");
      try { const result = await api.previewEmployeeEmails(file); setPreview(result); setChoices(result.rows.map((row) => row.employeeId ?? "")); setReplaceExisting(false); }
      catch (cause) { showNotice(cause instanceof Error ? cause.message : "The email list could not be read."); }
      finally { setBusy(false); }
    }} /></label>
    {preview && createPortal(<div className="fleet-dialog-backdrop"><section className="fleet-dialog email-import-dialog" role="dialog" aria-modal="true" aria-label="Match employee emails"><header><div><span>{preview.matched} name matches · {preview.needsReview} need review</span><strong>Match employee emails</strong></div><button disabled={busy} onClick={() => setPreview(null)} aria-label="Close email import"><X size={19} /></button></header>
      <div className="email-import-body"><p>Check each match before saving. Choose an employee for unmatched names, or leave the account out. Employees without an email stay in the directory.</p>
        <div className="table-wrap"><table className="data-table"><thead><tr><th>Email account</th><th>Employee</th><th>Review</th></tr></thead><tbody>{preview.rows.map((row, index) => {
          const employee = employees.find((person) => person.employeeId === choices[index]);
          return <tr key={row.row}><td><strong>{row.name || "No display name"}</strong><small>{row.email}</small></td><td><select aria-label={`Employee for ${row.email}`} disabled={busy || row.invalid} value={choices[index]} onChange={(event) => setChoices((current) => current.map((value, item) => item === index ? event.target.value : value))}><option value="">Leave out</option>{sortedEmployees.map((person) => <option key={person.id} value={person.employeeId}>{person.name || person.employeeId} · {person.employeeId} · {person.department.name}</option>)}</select></td><td>{row.invalid ? row.issue : employee?.email && employee.email.toLowerCase() !== row.email ? `Existing: ${employee.email}` : choices[index] ? "Ready to save" : row.issue || "Left out"}</td></tr>;
        })}</tbody></table></div>
        <label className="email-replace-option"><input type="checkbox" checked={replaceExisting} disabled={busy} onChange={(event) => setReplaceExisting(event.target.checked)} />Replace existing email addresses ({replacements} selected). Otherwise, keep them.</label>
        {duplicates && <p className="form-error">The same employee is selected more than once. Choose one email per employee.</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
      </div><footer className="email-import-footer"><span>{rows.length} selected · {preview.rows.length - rows.length} left out</span><button className="button button-primary" disabled={busy || !rows.length || duplicates} onClick={async () => {
        setBusy(true); setError("");
        try { const result = await api.commitEmployeeEmails(rows, replaceExisting); await onImported(); showNotice(`${result.imported} employee emails saved${result.skipped ? `; ${result.skipped} existing addresses kept` : ""}.`); setPreview(null); }
        catch (cause) { setError(cause instanceof Error ? cause.message : "Emails could not be saved."); }
        finally { setBusy(false); }
      }}>{busy ? "Saving…" : "Save selected emails"}</button></footer>
    </section></div>, document.body)}
  </>;
}
