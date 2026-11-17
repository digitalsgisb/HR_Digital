import { Fragment, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, CalendarDays, MapPin, RefreshCw, RotateCcw } from "lucide-react";
import { workflowRequest } from "./FleetAccess";

type Phase = "UPCOMING" | "IN_PROGRESS" | "FOLLOW_UP";
type KindCounts = { sent: number; scheduled: number; failed: number; cancelled: number };
type TrainingSummary = {
  id: string; title: string; code: string; dateStart: string; dateEnd: string | null; venue: string | null; trainer: string | null;
  phase: Phase; participants: number; withoutEmail: number;
  evaluations: { eligible: number; submitted: number; outstanding: number };
  emails: { sent: number; scheduled: number; failed: number; sends: number; lastSentAt: string | null };
  byKind: Record<string, KindCounts>;
};
type EmailCell = { id: string; kind: string; state: "SCHEDULED" | "SENDING" | "SENT" | "RECURRING" | "FAILED" | "CANCELLED"; recipient: string; dueAt: string; sentAt: string | null; lastError: string | null; sends: number };
type HistoryEvent = { id: string; kind: string; recipient: string; cc: string[]; outcome: "SENT" | "FAILED"; error: string | null; createdAt: string };
type Participant = {
  employeeId: string; staffId: string; name: string; department: string; email: string | null; employeeStatus: string;
  attendance: string; checkedInAt: string | null; summarySubmittedAt: string | null; reviewSubmittedAt: string | null;
  emails: Record<string, EmailCell>; history: HistoryEvent[];
};
type TrainingDetail = Omit<TrainingSummary, "participants"> & { ready: boolean; participants: Participant[] };

export const trackerKinds: Array<[string, string]> = [["INVITATION", "Invitation"], ["REMINDER", "Day reminder"], ["FOLLOW_UP", "Evaluation request"], ["SUMMARY_REMINDER", "Evaluation reminders"], ["HOD_SUMMARY", "Copy to HOD"], ["SUPERIOR_REVIEW", "3-month review"]];
const kindLabel = Object.fromEntries(trackerKinds);
const phaseLabel: Record<Phase, string> = { UPCOMING: "Upcoming", IN_PROGRESS: "In progress", FOLLOW_UP: "Follow-up" };
const stateLabel: Record<EmailCell["state"], string> = { SCHEDULED: "Scheduled", SENDING: "Sending", SENT: "Sent", RECURRING: "Sent · repeats", FAILED: "Failed", CANCELLED: "Not needed" };

const when = (value: string) => new Date(value).toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur", dateStyle: "medium", timeStyle: "short" });
const day = (value: string) => new Date(value).toLocaleDateString("en-MY", { timeZone: "Asia/Kuala_Lumpur", weekday: "short", day: "numeric", month: "short", year: "numeric" });
const percent = (value: number, total: number) => (total ? Math.round((value / total) * 100) : 0);

export function TrainingEmailTracker({ initialSessionId, showNotice }: { initialSessionId?: string | null; showNotice: (message: string) => void }) {
  const [selected, setSelected] = useState<string | null>(initialSessionId ?? null);
  return selected
    ? <TrainingEmailDetail id={selected} onBack={() => setSelected(null)} showNotice={showNotice} />
    : <TrainingEmailList onOpen={setSelected} />;
}

function TrainingEmailList({ onOpen }: { onOpen: (id: string) => void }) {
  const [scope, setScope] = useState<"current" | "all">("current");
  const [rows, setRows] = useState<TrainingSummary[]>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const request = useRef(0);
  const load = async () => {
    const id = ++request.current; setBusy(true); setError("");
    try { const data = await workflowRequest<{ trainings: TrainingSummary[] }>(`/training-email/trainings?scope=${scope}`); if (id === request.current) setRows(data.trainings); }
    catch (e) { if (id === request.current) { setRows(undefined); setError(e instanceof Error ? e.message : "Could not load training emails."); } }
    finally { if (id === request.current) setBusy(false); }
  };
  useEffect(() => { void load(); return () => { request.current++; }; }, [scope]);
  const failed = rows?.reduce((sum, row) => sum + row.emails.failed, 0) ?? 0;
  return <section className="page-stack">
    <div className="module-intro email-intro"><div><span className="module-kicker">Email centre</span><h2>Training tracker</h2><p>Follow each current training from invitation to evaluation: who has been emailed, what is still scheduled and who has not submitted.</p></div><button className="button button-light" disabled={busy} onClick={() => void load()}><RefreshCw size={16} />Refresh</button></div>
    <div className="page-toolbar"><div className="segmented"><button className={scope === "current" ? "active" : ""} onClick={() => setScope("current")}>Current training</button><button className={scope === "all" ? "active" : ""} onClick={() => setScope("all")}>All training</button></div>{failed > 0 && <span className="tracker-alert">{failed} failed {failed === 1 ? "email needs" : "emails need"} attention</span>}</div>
    {error && <p role="alert" className="form-error">{error}</p>}
    {busy && !rows && <p role="status">Loading training…</p>}
    {rows && !rows.length && <section className="card"><strong>No current training.</strong><p>Upcoming sessions, training in progress and training still collecting evaluations appear here.</p></section>}
    <div className="tracker-grid">{rows?.map(row => <button key={row.id} className="card tracker-card" onClick={() => onOpen(row.id)}>
      <div className="tracker-card-head"><span className={`status-badge tracker-phase ${row.phase.toLowerCase()}`}>{phaseLabel[row.phase]}</span>{row.emails.failed > 0 && <span className="status-badge tracker-failed">{row.emails.failed} failed</span>}</div>
      <h3>{row.title}</h3>
      <p className="tracker-meta"><span><CalendarDays size={13} />{day(row.dateStart)}</span>{row.venue && <span><MapPin size={13} />{row.venue}</span>}</p>
      <Meter label="Invitations sent" value={row.byKind.INVITATION?.sent ?? 0} total={row.participants - row.withoutEmail} />
      <Meter label="Evaluations submitted" value={row.evaluations.submitted} total={row.evaluations.eligible} />
      <dl className="tracker-stats"><div><dt>Participants</dt><dd>{row.participants}</dd></div><div><dt>Emails sent</dt><dd>{row.emails.sends || row.emails.sent}</dd></div><div><dt>Scheduled</dt><dd>{row.emails.scheduled}</dd></div><div><dt>No email</dt><dd>{row.withoutEmail}</dd></div></dl>
      <span className="tracker-open">Open tracker<ArrowRight size={15} /></span>
    </button>)}</div>
  </section>;
}

function Meter({ label, value, total }: { label: string; value: number; total: number }) {
  return <div className="table-progress tracker-meter"><span>{label}<em>{value}/{total}</em></span><div><i style={{ width: `${percent(value, total)}%` }} /></div></div>;
}

function TrainingEmailDetail({ id, onBack, showNotice }: { id: string; onBack: () => void; showNotice: (message: string) => void }) {
  const [data, setData] = useState<TrainingDetail>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "failed" | "outstanding" | "no-email">("all");
  const load = async () => {
    setBusy(true); setError("");
    try { setData(await workflowRequest<TrainingDetail>(`/training-email/trainings/${encodeURIComponent(id)}`)); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not load this training."); }
    finally { setBusy(false); }
  };
  useEffect(() => { void load(); }, [id]);
  const retry = async (jobId: string) => {
    setBusy(true);
    try { await workflowRequest(`/training-email/jobs/${encodeURIComponent(jobId)}/retry`, {}); showNotice("Email queued for another attempt."); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not retry the email."); setBusy(false); }
  };
  const ended = data ? new Date(data.dateEnd ?? data.dateStart).getTime() < Date.now() : false;
  const outstanding = (person: Participant) => ended && !person.summarySubmittedAt && person.employeeStatus === "ACTIVE" && ["REQUIRED", "COMPLETED"].includes(person.attendance);
  const people = data?.participants.filter(person => filter === "all" || filter === "failed" && Object.values(person.emails).some(cell => cell.state === "FAILED") || filter === "outstanding" && outstanding(person) || filter === "no-email" && !person.email) ?? [];
  return <section className="page-stack">
    <div className="module-intro email-intro"><div><button className="tracker-back" onClick={onBack}><ArrowLeft size={15} />All training</button><h2>{data?.title ?? "Training tracker"}</h2>{data && <p>{day(data.dateStart)} · {data.venue || "Venue not recorded"} · {data.trainer || "Trainer not assigned"}</p>}</div><button className="button button-light" disabled={busy} onClick={() => void load()}><RefreshCw size={16} />Refresh</button></div>
    {error && <p role="alert" className="form-error">{error}</p>}
    {!data && busy && <p role="status">Loading training…</p>}
    {data && <>
      {!data.ready && <p role="status" className="tracker-alert">Automatic email delivery is not ready. Scheduled emails will wait until SMTP is configured.</p>}
      <div className="tracker-summary">
        <div className="card"><span>Status</span><strong>{phaseLabel[data.phase]}</strong></div>
        <div className="card"><span>Participants</span><strong>{data.participants.length}</strong><small>{data.withoutEmail} without an email address</small></div>
        <div className="card"><span>Emails sent</span><strong>{data.emails.sends || data.emails.sent}</strong><small>{data.emails.lastSentAt ? `Last ${when(data.emails.lastSentAt)}` : "Nothing sent yet"}</small></div>
        <div className="card"><span>Scheduled</span><strong>{data.emails.scheduled}</strong><small>{data.emails.failed} failed</small></div>
        <div className="card"><span>Evaluations</span><strong>{data.evaluations.submitted}/{data.evaluations.eligible}</strong><small>{data.evaluations.outstanding} outstanding</small></div>
      </div>
      <section className="card data-card">
        <div className="section-header tracker-table-head"><h3>Participants and emails</h3><label className="field">Show<select value={filter} onChange={e => setFilter(e.target.value as typeof filter)}><option value="all">Everyone</option><option value="failed">Failed emails</option><option value="outstanding">Evaluation outstanding</option><option value="no-email">No email address</option></select></label></div>
        <div className="table-wrap"><table className="data-table tracker-table"><thead><tr><th>Participant</th>{trackerKinds.map(([kind, label]) => <th key={kind}>{label}</th>)}<th>Evaluation</th><th /></tr></thead>
          <tbody>{people.map(person => <Fragment key={person.employeeId}><tr>
            <td><strong>{person.name}</strong><small>{person.staffId} · {person.department}</small><small>{person.email || "No email address"}</small></td>
            {trackerKinds.map(([kind]) => <td key={kind}><Cell cell={person.emails[kind]} busy={busy} onRetry={retry} /></td>)}
            <td>{person.summarySubmittedAt ? <span className="tracker-state sent">Submitted</span> : outstanding(person) ? <span className="tracker-state failed">Outstanding</span> : <span className="tracker-state muted">{["REQUIRED", "COMPLETED"].includes(person.attendance) ? "Not open yet" : "Not required"}</span>}{person.summarySubmittedAt && <small>{when(person.summarySubmittedAt)}</small>}</td>
            <td><button className="button button-secondary tracker-history-button" aria-expanded={open === person.employeeId} onClick={() => setOpen(open === person.employeeId ? null : person.employeeId)}>History ({person.history.length})</button></td>
          </tr>{open === person.employeeId && <tr className="tracker-history-row"><td colSpan={trackerKinds.length + 3}>
            {person.history.length ? <ol className="tracker-history">{person.history.map(event => <li key={event.id} className={event.outcome.toLowerCase()}><strong>{kindLabel[event.kind] ?? event.kind}</strong><span>{event.outcome === "SENT" ? "Sent" : "Failed"} · {when(event.createdAt)}</span><span>To {event.recipient}{event.cc.length ? ` · CC ${event.cc.join(", ")}` : ""}</span>{event.error && <span className="form-error">{event.error}</span>}</li>)}</ol> : <p>No emails have been sent to this participant yet. Sends are recorded from this update onwards.</p>}
          </td></tr>}</Fragment>)}</tbody></table></div>
        {!people.length && <p className="tracker-empty">No participants match this filter.</p>}
        <p className="field-help tracker-empty">“Sent” means the mail server accepted the email; it does not confirm the email was opened. Evaluation reminders repeat every three days until the participant submits.</p>
      </section>
    </>}
  </section>;
}

function Cell({ cell, busy, onRetry }: { cell?: EmailCell; busy: boolean; onRetry: (jobId: string) => void }) {
  if (!cell) return <span className="tracker-state muted">—</span>;
  const detail = cell.state === "SCHEDULED" ? `Due ${when(cell.dueAt)}` : cell.state === "RECURRING" ? `Last ${when(cell.sentAt!)} · next ${when(cell.dueAt)}` : cell.sentAt ? when(cell.sentAt) : null;
  return <div className="tracker-cell" title={cell.lastError ?? undefined}>
    <span className={`tracker-state ${cell.state.toLowerCase()}`}>{stateLabel[cell.state]}{cell.sends > 1 ? ` ×${cell.sends}` : ""}</span>
    {detail && <small>{detail}</small>}
    {cell.lastError && cell.state !== "SENT" && <small className="form-error">{cell.lastError}</small>}
    {cell.state === "FAILED" && <button className="tracker-retry" disabled={busy} onClick={() => onRetry(cell.id)}><RotateCcw size={12} />Retry</button>}
  </div>;
}
