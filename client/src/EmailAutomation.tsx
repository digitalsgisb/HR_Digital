import { TrainingEmailStatus } from "./TrainingEmailStatus";
import { EmailTemplateEditor } from "./EmailTemplateEditor";
import { useEffect, useState } from "react";
import type { EmailTestStatus, EmailTestPreview, EmailTestMessage } from "@hr-training/shared";
import { api } from "./api";
import { emailAutomations } from "./portal-data";

export function EmailAutomation({ showNotice }: { showNotice: (message: string) => void }) {
  const [selected, setSelected] = useState("email-1");
  const [status, setStatus] = useState<EmailTestStatus>();
  const [preview, setPreview] = useState<EmailTestPreview>();
  const [inbox, setInbox] = useState<EmailTestMessage[]>([]);
  const [recipient, setRecipient] = useState("");
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  async function load() {
    setLoading(true); setError("");
    try { const [state, messages] = await Promise.all([api.emailTestStatus(), api.emailTestInbox()]); setStatus(state); setInbox(messages); setRecipient(current => current || state.allowedRecipients[0] || ""); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not load email settings."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  useEffect(() => { let cancelled = false; setPreview(undefined); api.emailTestPreview(selected).then(value => { if (!cancelled) setPreview(value); }).catch(e => { if (!cancelled) setError(e.message); }); return () => { cancelled = true; }; }, [selected]);
  async function run(action: "verify" | "send") {
    setBusy(true); setError(""); setFeedback("");
    try {
      if (action === "verify") setFeedback((await api.emailTestVerify()).message);
      else {
        const result = await api.emailTestSend(selected, recipient);
        const message = result.status === "captured" ? "Captured in the local test inbox. No external email was sent." : `SMTP accepted the test for ${result.recipient}. Check your inbox and spam folder.`;
        setFeedback(message); showNotice(message); setInbox(await api.emailTestInbox());
      }
    } catch (e) { setError(e instanceof Error ? e.message : "Email test failed."); }
    finally { setBusy(false); }
  }
  return <section className="page-stack developer-email"><div className="module-intro"><div><span className="module-kicker">Training communications</span><h2>Email automation</h2><p>Edit messages, choose who receives copies and check scheduled email delivery.</p></div></div>
    <EmailTemplateEditor showNotice={showNotice}/>
    <details className="hr-mail-admin"><summary>Delivery settings (system administrator)</summary><TrainingEmailStatus />
    <details className="email-advanced-tools"><summary>Connection checks and developer sample tests</summary><section className="card email-test-controls"><h3>{status?.mode === "smtp" ? "SMTP delivery" : "Local test inbox"}</h3><p>{status?.mode === "smtp" ? "Tests can only go to the addresses permitted in the server settings." : "Test messages stay on this server. Configure SMTP to send to your real inbox."}</p><p><strong>From:</strong> {status?.from || "Loading…"}</p>
      {status?.issues.map(issue => <p key={issue} role="alert">{issue}</p>)}
      <form onSubmit={event => { event.preventDefault(); void run("send"); }}><label>Test recipient<input type="email" required value={recipient} onChange={e => setRecipient(e.target.value)} placeholder="you@company.com" list="test-recipients" autoComplete="email" /></label><datalist id="test-recipients">{status?.allowedRecipients.map(address => <option key={address} value={address} />)}</datalist><button type="button" className="button button-secondary" disabled={busy || !status?.ready || loading} onClick={() => void run("verify")}>{busy ? "Working…" : "Check connection"}</button><button className="button button-primary" disabled={busy || !status?.ready || !preview || loading}>{busy ? "Working…" : status?.mode === "smtp" ? "Send test email" : "Capture test email"}</button></form>
      {error && <div role="alert"><p>{error}</p><button className="button button-secondary" onClick={() => void load()}>Reload settings</button></div>}{feedback && <p role="status">{feedback}</p>}
    </section>
    <div className="email-layout"><section className="card automation-list"><h3>Developer sample templates</h3>{emailAutomations.map(template => <button key={template.id} className={selected === template.id ? "selected" : ""} aria-pressed={selected === template.id} onClick={() => { setSelected(template.id); setFeedback(""); }}><div><strong>{template.title}</strong><p>Manual developer test</p></div></button>)}<p>Developer tests do not change the training email schedule.</p></section><section className="card email-preview-card"><div className="preview-toolbar"><div><p>Email preview</p><h3>{preview?.subject || "Loading preview…"}</h3></div></div>{preview && <iframe title="Test email preview" sandbox="" srcDoc={preview.html} className="email-test-frame" />}</section></div>
    <section className="card email-test-controls"><h3>Recent test messages</h3><p>Last 20 tests from this server process. This list resets when the server restarts.</p>{inbox.length === 0 ? <p>No tests yet.</p> : <ul className="email-test-history">{inbox.map(message => <li key={message.id}><strong>{message.subject}</strong><span>{message.recipient} · {new Date(message.createdAt).toLocaleString()} · {message.mode === "preview" ? "Captured locally" : "Accepted by SMTP"}</span><details><summary>View message</summary><pre>{message.text}</pre></details></li>)}</ul>}</section>
  </details></details></section>;
}
