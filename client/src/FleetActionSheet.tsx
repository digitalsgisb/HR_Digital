import { useCallback, useEffect, useRef, useState } from "react";
import { Check, CircleAlert } from "lucide-react";

/**
 * Bottom sheet that answers every tap on the company-car page straight away:
 * "Reserving FA 5968" while the server works, then a tick with the outcome,
 * or the reason it failed. It also blocks double-taps while a request runs.
 */
type SheetState = { phase: "pending" | "done" | "error"; title: string; detail?: string; plate?: string };
export type SheetCopy = { pending: string; done: string; detail?: string; plate?: string };

const DONE_MS = 2600;
const buzz = (pattern: number | number[]) => { try { navigator.vibrate?.(pattern); } catch { /* not supported */ } };

export function useActionSheet() {
  const [sheet, setSheet] = useState<SheetState | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const close = useCallback(() => { window.clearTimeout(timer.current); setSheet(null); }, []);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  /** Shows the sheet, runs the request, then shows the result. Errors are re-thrown for the caller. */
  const run = useCallback(async <T,>(copy: SheetCopy, task: () => Promise<T>): Promise<T> => {
    window.clearTimeout(timer.current);
    setSheet({ phase: "pending", title: copy.pending, plate: copy.plate });
    try {
      const result = await task();
      buzz(30);
      setSheet({ phase: "done", title: copy.done, detail: copy.detail, plate: copy.plate });
      timer.current = window.setTimeout(() => setSheet(null), DONE_MS);
      return result;
    } catch (cause) {
      buzz([40, 60, 40]);
      setSheet({ phase: "error", title: "Not saved", detail: cause instanceof Error ? cause.message : "Check your connection and try again.", plate: copy.plate });
      throw cause;
    }
  }, []);
  return { sheet, run, close };
}

export function FleetActionSheet({ sheet, onClose }: { sheet: SheetState | null; onClose: () => void }) {
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (sheet?.phase === "error") closeButton.current?.focus(); }, [sheet?.phase]);
  if (!sheet) return null;
  const pending = sheet.phase === "pending";
  return <div className="fleet-sheet-layer" data-phase={sheet.phase} onClick={pending ? undefined : onClose}>
    <div className="fleet-sheet" role={sheet.phase === "error" ? "alert" : "status"} aria-live="polite" aria-busy={pending} onClick={event => event.stopPropagation()}>
      <div className="fleet-sheet-mark" aria-hidden="true">
        {pending ? <span className="fleet-sheet-spinner" /> : sheet.phase === "done" ? <Check size={26} strokeWidth={3} /> : <CircleAlert size={26} />}
      </div>
      <div className="fleet-sheet-copy">
        {sheet.plate && <span className="fleet-sheet-plate">{sheet.plate}</span>}
        <strong>{sheet.title}</strong>
        {sheet.detail && <p>{sheet.detail}</p>}
      </div>
      {pending ? <span className="fleet-sheet-progress" aria-hidden="true"><i /></span>
        : sheet.phase === "error" ? <button ref={closeButton} type="button" className="fleet-sheet-close" onClick={onClose}>Close</button>
        : <span className="fleet-sheet-timer" aria-hidden="true"><i /></span>}
    </div>
  </div>;
}
