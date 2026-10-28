import {participantStage,reviewStage} from "./evaluation-status";
import { useEffect, useState } from "react";
import { workflowRequest } from "./FleetAccess";
export type Summary = {
    id: string;
    employeeId: string;
    name: string;
    hodEmail: string | null;
    training: string;
    dateEnd: string | null;
    attendance: string;
    employeeStatus?: string;
    submittedAt: string | null;
    evaluationLabels: Record<string,string>;
    reviewLabels: Record<string,string>;
    evaluation: Record<string,string>|null;
    review: Record<string,string>|null;
    reviewDueAt: string|null;
    reviewSubmittedAt: string|null;
    hrComments: string|null;
    learning: string | null;
    application: string | null;
    feedback: string | null;
    notes: string | null;
    attachments: Array<{
        name: string;
        data: string;
    }>;
    delivery: {
        status: string;
        lastError: string | null;
    } | null;
    url: string;
};
export function TrainingSummaries() {
    const [rows, setRows] = useState<Summary[]>([]);
    const [query, setQuery] = useState("");
    const [filter, setFilter] = useState("all");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(true);
    const load = async () => { setError(""); setLoading(true); try {
        setRows(await workflowRequest<Summary[]>("/training-summaries"));
    }
    catch (e) {
        setError(e instanceof Error ? e.message : "Could not load summaries.");
    }
    finally {
        setLoading(false);
    } };
    useEffect(() => { void load(); }, []);
    const visible = rows.filter(r => `${r.name} ${r.employeeId} ${r.training} ${r.notes || ""}`.toLowerCase().includes(query.toLowerCase()) && (filter === "all" || filter === "submitted" && r.submittedAt || filter === "outstanding" && ["Outstanding","Draft"].includes(participantStage(r)) || filter === "review-due" && ["Outstanding","Draft"].includes(reviewStage(r)) || filter === "overdue" && !r.submittedAt && ["Outstanding","Draft"].includes(participantStage(r)) && !!r.dateEnd && new Date(r.dateEnd).getTime()+7*86400000<Date.now() || filter === "missing-hod" && !r.hodEmail));
    return <section className="page-stack"><section className="card fleet-form"><h2>Evaluation submissions</h2><p>Attendance and summary submission are tracked separately. Drafts keep three-day reminders active; submission stops them and queues the completed summary for the HOD.</p><div className="toolbar-actions"><input aria-label="Search evaluations" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search employee, training or notes"/><select aria-label="Evaluation status" value={filter} onChange={e => setFilter(e.target.value)}><option value="all">All evaluations</option><option value="outstanding">Participant forms outstanding</option><option value="overdue">Past the one-week deadline</option><option value="review-due">Three-month reviews due</option><option value="submitted">Submitted</option><option value="missing-hod">Missing HOD email</option></select><button className="button" disabled={loading} onClick={() => void load()}>Refresh</button></div>{error && <p className="form-error" role="alert">{error}</p>}{loading && <p role="status">Loading summaries…</p>}{!loading && !visible.length && <p>No matching evaluations.</p>}</section>{visible.map(row => <article className="card fleet-form" key={row.id}><h3>{row.training}</h3><p><strong>{row.name}</strong> · {row.employeeId}</p><p>Attendance: {row.attendance.toLowerCase()} · Evaluation: <strong>{participantStage(row)}</strong></p><p>HOD: {row.hodEmail || "Missing — choose a HOD under Recipients & HODs"} · Delivery: {row.delivery?.status.toLowerCase() || (row.submittedAt?"Not queued":"Waiting for participant")}</p>{row.delivery?.lastError && <p role="status">{row.delivery.lastError}</p>}<p>Three-month review: {reviewStage(row)} · Due: {row.reviewDueAt ? new Date(row.reviewDueAt).toLocaleDateString("en-MY",{timeZone:"Asia/Kuala_Lumpur"}) : "Training end date needed"}</p><details><summary>Read evaluation, review and notes</summary>{[["Section A",row.evaluation],["Sections B–D",row.review]].map(([title,answers])=><div key={String(title)}><h4>{String(title)}</h4>{Object.entries((answers||{}) as Record<string,string>).map(([key,value])=><p className="saved-notes" key={key}><strong>{(title==="Section A"?row.evaluationLabels:row.reviewLabels)?.[key]||key}</strong>: {value||"Not entered"}</p>)}</div>)}{[["What was learned", row.learning], ["Application", row.application], ["Feedback", row.feedback], ["Notes", row.notes]].map(([label, value]) => <div key={label}><h4>{label}</h4><p className="saved-notes">{value || "Not entered"}</p></div>)}{row.attachments.map((file, index) => <p key={index}><a href={file.data} download={file.name}>Download {file.name}</a></p>)}</details><form onSubmit={async e=>{e.preventDefault();const comments=String(new FormData(e.currentTarget).get("hrComments")||"");try{await workflowRequest(`/training-summaries/${row.id}/comments`,{hrComments:comments},"PUT");await load();}catch(e){setError(e instanceof Error?e.message:"Could not save comments.");}}}><label className="field">HR comments<textarea name="hrComments" defaultValue={row.hrComments||""} maxLength={20000}/></label><button className="button button-secondary">Save HR comments</button></form>{["Outstanding","Draft"].includes(participantStage(row)) && <p><a href={row.url} target="_blank" rel="noreferrer">Open participant evaluation form</a></p>}</article>)}</section>;
}
