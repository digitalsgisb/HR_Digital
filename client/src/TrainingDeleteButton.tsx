import { useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import type { CalendarSession } from "./portal-data";

export function TrainingDeleteButton({ session, onDelete }: { session: CalendarSession; onDelete: (id: string) => Promise<void> }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { if (open) dialog.current?.showModal(); }, [open]);
  return <><button type="button" className="button button-secondary training-delete" aria-label={`Delete training ${session.title}`} onClick={() => { setError(""); setOpen(true); }}><Trash2 size={15} />Delete training</button>{open && <dialog ref={dialog} className="training-delete-dialog" aria-labelledby={`delete-${session.id}`} onCancel={event => { if (busy) event.preventDefault(); else setOpen(false); }} onClose={() => setOpen(false)}><h2 id={`delete-${session.id}`}>Delete this training?</h2><p><strong>{session.title}</strong><br />{session.date} · {session.time}</p><p>This removes the training and its attendance from the active calendar and reports. Pending emails will be cancelled. Saved records are retained for recovery; emails already handed to the mail server cannot be recalled.</p>{error && <p className="form-error" role="alert">{error}</p>}<div className="toolbar-actions"><button type="button" className="button button-secondary" disabled={busy} onClick={() => { dialog.current?.close(); setOpen(false); }}>Keep training</button><button type="button" className="button button-primary" disabled={busy} onClick={async () => { setBusy(true); setError(""); try { await onDelete(session.id); setOpen(false); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not delete training."); } finally { setBusy(false); } }}>{busy ? "Deleting…" : "Delete training"}</button></div></dialog>}</>;
}
