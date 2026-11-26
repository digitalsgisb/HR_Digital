import { Fragment, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, CalendarDays, Check, MapPin, RefreshCw, RotateCcw } from "lucide-react";
import { workflowRequest } from "./FleetAccess";
import { errorText, optimistic } from "./optimistic";

type Phase = "UPCOMING" | "IN_PROGRESS" | "FOLLOW_UP";
type KindCounts = { sent: number; scheduled: number; failed: number; cancelled: number };
type TrainingSummary = {
  id: string; title: string; code: string; dateStart: string; dateEnd: string | null; venue: string | null; trainer: string | null;
  phase: Phase; participants: number; withoutEmail: number;
  evaluations: { eligible: number; submitted: number; outstanding: number };
  emails: { sent: number; scheduled: number; failed: number; sends: number; lastSentAt: string | null };
  byKind: Record<string, KindCounts>;
};
type EmailCell = { id: string; kind: string; state: "SCHEDULED" | "SENDING" | "SENT" | "RECURRING" | "FAILED" | "CANCELLED"; recipient: string; dueAt: string; sentAt: string | null; lastError: string | null; sends: number; reminders: number; escalated: boolean };
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
    <div className="module-intro email-intro"><div><h2>Training tracker</h2><p>Follow each current training from invitation to evaluation: who has been emailed, what is still scheduled and who has not submitted.</p></div><button className="button button-light" disabled={busy} onClick={() => void load()}><RefreshCw size={16} />Refresh</button></div>
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
  const load = async (quiet = false) => {
    if (!quiet) setBusy(true); setError("");
    try { setData(await workflowRequest<TrainingDetail>(`/training-email/trainings/${encodeURIComponent(id)}`)); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not load this training."); }
    finally { setBusy(false); }
  };
  useEffect(() => { void load(); }, [id]);
  const setCellState = (jobId: string, state: EmailCell["state"]) => setData(current => current && {
    ...current,
    participants: current.participants.map(person => ({ ...person, emails: Object.fromEntries(Object.entries(person.emails).map(([kind, cell]) => [kind, cell.id === jobId ? { ...cell, state } : cell])) })),
  });
  const retry = (jobId: string) => {
    setError("");
    void optimistic(() => {
      setCellState(jobId, "SCHEDULED");
      showNotice("Email queued for another attempt.");
      return () => setCellState(jobId, "FAILED");
    }, () => workflowRequest(`/training-email/jobs/${encodeURIComponent(jobId)}/retry`, {}), { ids: [jobId] }).then(result => {
      if (result.ok) void load(true);
      else setError(`The email was not queued. ${errorText(result.error, "Please try again.")}`);
    });
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
      <section className="card data-card journey-card">
        <div className="section-header tracker-table-head"><div><h3>Participant journeys</h3><p className="journey-sub">Each line follows one person from invitation to the 3-month review.</p></div><label className="field">Show<select value={filter} onChange={e => setFilter(e.target.value as typeof filter)}><option value="all">Everyone</option><option value="failed">Failed emails</option><option value="outstanding">Evaluation outstanding</option><option value="no-email">No email address</option></select></label></div>
        <div className="journey-list">
          {people.length > 0 && <div className="journey-row journey-phases" aria-hidden="true"><span /><div className="journey-rail-grid"><span style={{ gridColumn: "1 / 3" }}>Before training</span><span style={{ gridColumn: "3 / 4" }}>Training day</span><span style={{ gridColumn: "4 / 9" }}>After training</span></div><span /></div>}
          {people.map(person => {
            const stops = journeyFor(person, data, ended, outstanding(person));
            const current = stops.find(stop => stop.current);
            return <Fragment key={person.employeeId}><article className="journey-row">
              <div className="journey-person"><strong>{person.name}</strong><small>{person.staffId} · {person.department}</small><small>{person.email || "No email address"}</small>
                <span className={`journey-now ${current?.status ?? "complete"}`}>{current ? current.now : "Journey complete"}</span></div>
              <ol className="journey-rail-grid journey-rail" style={{ ["--reached" as string]: lastReached(stops) }} aria-label={`Journey for ${person.name}`}>
                {stops.map(stop => <li key={stop.key} className={`journey-stop ${stop.status}${stop.current ? " current" : ""}`} title={stop.error ?? undefined}>
                  <span className="journey-node" aria-hidden="true">{stop.status === "done" ? <Check size={12} strokeWidth={3} /> : stop.status === "failed" || stop.status === "late" ? "!" : null}</span>
                  <strong>{stop.label}</strong>
                  <small><span className="visually-hidden">{stateWord[stop.status]}: </span>{stop.detail}</small>
                  {stop.extra && <small className="journey-extra">{stop.extra}</small>}
                  {stop.status === "failed" && stop.jobId && <button className="tracker-retry" disabled={busy} onClick={() => retry(stop.jobId!)}><RotateCcw size={12} />Retry</button>}
                </li>)}
              </ol>
              <button className="button button-secondary tracker-history-button" aria-expanded={open === person.employeeId} onClick={() => setOpen(open === person.employeeId ? null : person.employeeId)}>History ({person.history.length})</button>
            </article>
            {open === person.employeeId && <div className="journey-history">
              {person.history.length ? <ol className="tracker-history">{person.history.map(event => <li key={event.id} className={event.outcome.toLowerCase()}><strong>{kindLabel[event.kind] ?? event.kind}</strong><span>{event.outcome === "SENT" ? "Sent" : "Failed"} · {when(event.createdAt)}</span><span>To {event.recipient}{event.cc.length ? ` · CC ${event.cc.join(", ")}` : ""}</span>{event.error && <span className="form-error">{event.error}</span>}</li>)}</ol> : <p>No emails have been sent to this participant yet. Sends are recorded from this update onwards.</p>}
            </div>}</Fragment>;
          })}
        </div>
        {!people.length && <p className="tracker-empty">No participants match this filter.</p>}
        <div className="journey-legend"><span className="done"><i />Done</span><span className="current"><i />Up next</span><span className="waiting"><i />Scheduled</span><span className="late"><i />Failed or overdue</span><span className="skipped"><i />Not needed</span></div>
        <p className="field-help tracker-empty">“Sent” means the mail server accepted the email; it does not confirm the email was opened. Evaluation reminders go out every three days at 9:00 am (weekends move to Monday) until the participant submits. From the 5th reminder the HOD and immediate superior are copied.</p>
      </section>
    </>}
  </section>;
}

type StopStatus = "done" | "waiting" | "future" | "failed" | "late" | "skipped";
type Stop = { key: string; label: string; status: StopStatus; detail: string; now: string; extra?: string; error?: string; jobId?: string; current?: boolean };
const stateWord: Record<StopStatus, string> = { done: "Done", waiting: "Scheduled", future: "Not yet", failed: "Failed", late: "Overdue", skipped: "Not needed" };
const short = (value: string) => new Date(value).toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const shortDay = (value: string) => new Date(value).toLocaleDateString("en-MY", { timeZone: "Asia/Kuala_Lumpur", day: "numeric", month: "short" });

/** One email job as a journey stop. `waitingNow` describes the person if this is where they currently are. */
function emailStop(key: string, label: string, cell: EmailCell | undefined, waitingNow: string): Stop {
  if (!cell) return { key, label, status: "future", detail: "Not yet", now: waitingNow };
  const base = { key, label, now: waitingNow, jobId: cell.id, error: cell.lastError ?? undefined };
  switch (cell.state) {
    case "SENT": return { ...base, status: "done", detail: cell.sentAt ? short(cell.sentAt) : "Sent", extra: cell.sends > 1 ? `Sent ${cell.sends} times` : undefined };
    case "RECURRING": return { ...base, status: "waiting", detail: `${cell.reminders || cell.sends} sent · next ${shortDay(cell.dueAt)}`, extra: cell.escalated ? "HOD copied" : undefined };
    case "SCHEDULED": return { ...base, status: "waiting", detail: `Due ${short(cell.dueAt)}` };
    case "SENDING": return { ...base, status: "waiting", detail: "Sending now" };
    case "FAILED": return { ...base, status: "failed", detail: "Failed to send", now: `${label}: email failed` };
    case "CANCELLED": return { ...base, status: "skipped", detail: "Not needed" };
  }
}

function journeyFor(person: Participant, training: TrainingDetail, ended: boolean, overdue: boolean): Stop[] {
  const required = ["REQUIRED", "COMPLETED"].includes(person.attendance);
  const e = person.emails;
  const day = { key: "DAY", label: "Attended" };
  const attended: Stop = !required ? { ...day, status: "skipped", detail: "Not required", now: "" }
    : person.checkedInAt ? { ...day, status: "done", detail: `Checked in ${short(person.checkedInAt)}`, now: "" }
    : person.attendance === "COMPLETED" ? { ...day, status: "done", detail: "Marked attended", now: "" }
    : ended ? { ...day, status: "late", detail: "No check-in", now: "No check-in recorded" }
    : { ...day, status: "waiting", detail: shortDay(training.dateStart), now: `Training on ${shortDay(training.dateStart)}` };
  const reminders = emailStop("SUMMARY_REMINDER", "Reminders", e.SUMMARY_REMINDER, "Waiting for evaluation");
  // Reminders stop once the evaluation is in.
  if (person.summarySubmittedAt && reminders.status === "waiting") Object.assign(reminders, { status: "done", detail: "Stopped after submission" });
  const evaluation = { key: "SUBMITTED", label: "Evaluation" };
  const submitted: Stop = person.summarySubmittedAt ? { ...evaluation, status: "done", detail: `Submitted ${short(person.summarySubmittedAt)}`, now: "" }
    : !required ? { ...evaluation, status: "skipped", detail: "Not required", now: "" }
    : overdue ? { ...evaluation, status: "late", detail: "Outstanding", now: "Evaluation outstanding" }
    : { ...evaluation, status: "waiting", detail: "Opens after training", now: "Evaluation opens after training" };
  const review = emailStop("SUPERIOR_REVIEW", "3-month review", e.SUPERIOR_REVIEW, "Waiting for 3-month review");
  if (person.reviewSubmittedAt) Object.assign(review, { status: "done", detail: `Received ${short(person.reviewSubmittedAt)}` });
  const stops = [
    emailStop("INVITATION", "Invited", e.INVITATION, "Invitation scheduled"),
    emailStop("REMINDER", "Reminded", e.REMINDER, "Day reminder scheduled"),
    attended,
    emailStop("FOLLOW_UP", "Evaluation sent", e.FOLLOW_UP, "Evaluation request scheduled"),
    reminders,
    submitted,
    emailStop("HOD_SUMMARY", "Copy to HOD", e.HOD_SUMMARY, "HOD copy scheduled"),
    review,
  ];
  // A failure or an overdue step is where the person is stuck; otherwise it is the first step still to come.
  const next = stops.find(stop => stop.status === "failed" || stop.status === "late") ?? stops.find(stop => stop.status === "waiting");
  if (next) next.current = true;
  return stops;
}

/** Index of the furthest stop reached; the filled part of the rail runs up to it. */
function lastReached(stops: Stop[]) {
  let last = 0;
  stops.forEach((stop, index) => { if (stop.status === "done") last = index; });
  return String(last);
}
