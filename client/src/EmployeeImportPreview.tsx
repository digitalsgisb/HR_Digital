import type { EmployeeImportPreview as Preview } from "@hr-training/shared";
import { FileSpreadsheet, X } from "lucide-react";

export function EmployeeImportPreview({ preview, busy, onImport, onDismiss }: {
  preview: Preview; busy: boolean; onImport: () => void; onDismiss: () => void;
}) {
  return <section className="card employee-import-preview" aria-label="Employee import preview">
    <div className="import-banner"><FileSpreadsheet size={22} /><div>
      <strong>Review employee import</strong>
      <span>{preview.meta.validRows} ready · {preview.meta.invalidRows} rows need fixing{preview.meta.sheet ? ` · ${preview.meta.sheet}` : ""}</span>
    </div><button onClick={onImport} disabled={busy || !preview.rows.length}>{busy ? "Importing…" : `Import ${preview.meta.validRows} employees`}</button>
      <button onClick={onDismiss} disabled={busy} aria-label="Dismiss import"><X size={17} /></button></div>
    <p>Employee# becomes Employee ID. Job Type becomes Role. Company and Base are saved too. Existing employees with the same ID will be updated. Without a Status column, imported employees are marked Active.</p>
    {preview.rows.length > 0 && <details open><summary>Preview first {Math.min(5, preview.rows.length)} employees</summary>
      <div className="table-wrap"><table className="data-table"><thead><tr><th>Employee ID</th><th>Name</th><th>Email</th><th>Company</th><th>Base</th><th>Department</th><th>Role</th><th>Status</th></tr></thead><tbody>
        {preview.rows.slice(0, 5).map((row) => <tr key={row.employeeId}><td>{row.employeeId}</td><td>{row.name || "—"}</td><td>{row.email || "No email"}</td><td>{row.company || "—"}</td><td>{row.base || "—"}</td><td>{row.department}</td><td>{row.role || "—"}</td><td>{row.status.replaceAll("_", " ")}</td></tr>)}
      </tbody></table></div></details>}
    {preview.errors.length > 0 && <details open><summary>{preview.errors.length} issues to review</summary>
      <p>Rows with issues will be skipped. Fix them in Excel and upload again to include them.</p>
      <div className="table-wrap"><table className="data-table"><thead><tr><th>Spreadsheet row</th><th>Field</th><th>Issue</th></tr></thead><tbody>{preview.errors.map((error, index) => <tr key={index}><td>{error.row}</td><td>{error.field}</td><td>{error.message}</td></tr>)}</tbody></table></div>
    </details>}
  </section>;
}
