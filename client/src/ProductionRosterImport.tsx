import { useState } from "react";
import { api } from "./api";

export type RosterPreview = { sheet: string; rows: Array<{ employeeId: string; name: string; currentName: string | null; section: "Conversion"; line: string; group: string | null; row: number; matched: boolean }> };
export function ProductionRosterImport({ onSaved }: { onSaved: () => Promise<void> }) {
  const [preview, setPreview] = useState<RosterPreview | null>(null);
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  const matched = preview?.rows.filter(row => row.matched) ?? [];
  return <details className="card form-card"><summary>Conversion line & group roster</summary><p>Upload Conversion Attd 2026.xlsx. Only OKT 2026 / OCT 2026 is read. Matching Production employee IDs receive assignment updates; names, status and training history are retained. Set Roll Making in employee profiles as one section.</p>
    <label className="field"><span>Conversion roster (.xlsx)</span><input type="file" accept=".xlsx" disabled={busy} onChange={async event => { const file = event.target.files?.[0]; event.target.value = ""; if (!file) return; setBusy(true); setPreview(null); setMessage(""); try { setPreview(await api.previewProductionRoster(file)); } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to read roster."); } finally { setBusy(false); } }} /></label>
    {preview && <><p>{preview.sheet} · {matched.length} matched · {preview.rows.length - matched.length} unmatched or outside Production. Unmatched IDs need an employee record in Production before importing.</p><div className="table-wrap"><table className="data-table"><thead><tr><th>Employee ID</th><th>Roster name</th><th>Directory name</th><th>Line / unit</th><th>Group</th><th>Match</th></tr></thead><tbody>{preview.rows.map(row => <tr key={row.employeeId}><td>{row.employeeId}</td><td>{row.name}</td><td>{row.currentName || "—"}</td><td>{row.line}</td><td>{row.group || "—"}</td><td>{row.matched ? "Matched" : "Review employee"}</td></tr>)}</tbody></table></div><button className="button button-primary" disabled={busy || !matched.length} onClick={async () => { setBusy(true); setMessage(""); try { const result = await api.commitProductionRoster(matched); await onSaved(); setPreview(null); setMessage(`${result.imported} Conversion assignments updated.`); } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to save assignments."); } finally { setBusy(false); } }}>{busy ? "Saving…" : `Update ${matched.length} matched employees`}</button><button className="button button-secondary" disabled={busy} onClick={() => setPreview(null)}>Dismiss</button></>}
    {busy && <p role="status">Processing roster…</p>}{message && <p role="status">{message}</p>}
  </details>;
}
