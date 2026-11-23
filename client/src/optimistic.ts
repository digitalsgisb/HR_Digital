import { useCallback, useState, useSyncExternalStore } from "react";

/**
 * Optimistic updates.
 *
 * `optimistic(apply, request)` changes local state first, then sends the request.
 * If the request fails, the rollback returned by `apply` runs and the result says so.
 * Every call is tracked in a small store, so the top bar can show "Saving" / "Saved"
 * and any record can render itself as pending while its request is in flight.
 */
export type SyncState = {
  inFlight: number;
  last: "ok" | "error" | null;
  settledAt: number;
  pending: ReadonlySet<string>;
};

let snapshot: SyncState = { inFlight: 0, last: null, settledAt: 0, pending: new Set() };
const listeners = new Set<() => void>();
const publish = (next: Partial<SyncState>) => {
  snapshot = { ...snapshot, ...next };
  listeners.forEach((listener) => listener());
};
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
const getSnapshot = () => snapshot;

export const useSyncState = () => useSyncExternalStore(subscribe, getSnapshot);
export const useIsPending = (id: string | undefined) =>
  useSyncExternalStore(subscribe, () => (id ? snapshot.pending.has(id) : false));

const withIds = (ids: string[], add: boolean) => {
  const next = new Set(snapshot.pending);
  ids.forEach((id) => (add ? next.add(id) : next.delete(id)));
  return next;
};

export type OptimisticResult<T> = { ok: true; value: T } | { ok: false; error: unknown };

export async function optimistic<T>(
  apply: () => (() => void) | void,
  request: () => Promise<T>,
  options: { ids?: string[] } = {},
): Promise<OptimisticResult<T>> {
  const ids = options.ids ?? [];
  const rollback = apply();
  publish({ inFlight: snapshot.inFlight + 1, pending: withIds(ids, true) });
  try {
    const value = await request();
    publish({ inFlight: snapshot.inFlight - 1, last: "ok", settledAt: Date.now(), pending: withIds(ids, false) });
    return { ok: true, value };
  } catch (error) {
    rollback?.();
    publish({ inFlight: snapshot.inFlight - 1, last: "error", settledAt: Date.now(), pending: withIds(ids, false) });
    return { ok: false, error };
  }
}

export const errorText = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

let temporaryId = 0;
export const pendingId = () => `pending:${Date.now()}:${++temporaryId}`;

/** Hide records immediately while keeping them mounted, so a rollback restores them in place. */
export function useHiddenIds() {
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set());
  const hide = useCallback((id: string) => {
    setHidden((current) => new Set(current).add(id));
    return () => setHidden((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
  }, []);
  return [hidden, hide] as const;
}
