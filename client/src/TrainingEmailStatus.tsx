import { useEffect, useState } from "react";
import { api } from "./api";

type QueueStatus = { enabled: boolean; ready: boolean; counts: Record<string, number>; failures: Array<{ id: string; recipient: string; lastError: string | null; session: {course: {name: string}} }> };
export function TrainingEmailStatus() {
  const [status, setStatus] = useState<QueueStatus>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = async () => { try { setStatus(await api.trainingEmailStatus()); setError(""); } catch { setError("Could not load scheduled emails. Check database connectivity and apply the latest update."); } };
  useEffect(() => { void load(); const timer = window.setInterval(() => { void load(); }, 30000); return () => window.clearInterval(timer); }, []);
  return <section className="card email-test-controls"><h3>Training email delivery</h3><p>New plans: invitation after saving, reminder on the training day, and summary request two hours after the session, then reminders every three days until submitted. Messages use the Sugihara template and each participant’s saved email.</p>{status && <><p role="status">{!status.enabled ? "Automatic delivery is paused on the server." : status.ready ? "Automatic SMTP delivery is active. Due emails are checked every minute." : "Automatic delivery is waiting for SMTP configuration. Queued emails will wait until it is ready."}</p><p><strong>{status.counts.PENDING || 0}</strong> queued · <strong>{status.counts.SENDING || 0}</strong> sending · <strong>{status.counts.SENT || 0}</strong> accepted by SMTP · <strong>{status.counts.FAILED || 0}</strong> failed</p>{status.failures.map(failure => <p key={failure.id}>{failure.session.course.name} · {failure.recipient}<br />{failure.lastError}</p>)}</>}{error && <p role="alert">{error}</p>}<div className="toolbar-actions"><button className="button button-secondary" disabled={busy} onClick={() => void load()}>Refresh delivery status</button>{!!status?.counts.FAILED && <button className="button button-secondary" disabled={busy || !status.ready} onClick={async () => { setBusy(true); try { await api.retryTrainingEmails(); await load(); } catch (e) { setError(e instanceof Error ? e.message : "Could not retry emails."); } finally { setBusy(false); } }}>{busy ? "Queuing…" : "Retry failed emails"}</button>}</div></section>;
}
