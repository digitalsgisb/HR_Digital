// Per-phone conveniences for the company-car flow. Storage can be unavailable
// (private mode, cleared site data), so every access is best-effort.
const EMPLOYEE_KEY = "hr-fleet-employee-id";
const TRIP_KEY = "hr-fleet-trip-token";
const DRAFT_PREFIX = "hr-fleet-draft:";

function read(key: string) { try { return window.localStorage.getItem(key); } catch { return null; } }
function write(key: string, value: string | null) {
  try { if (value === null) window.localStorage.removeItem(key); else window.localStorage.setItem(key, value); } catch { /* best effort */ }
}

export const rememberedEmployeeId = () => read(EMPLOYEE_KEY) ?? "";
export const rememberEmployeeId = (id: string | null) => write(EMPLOYEE_KEY, id);
export const rememberedTripToken = () => read(TRIP_KEY);
export const rememberTripToken = (token: string | null) => write(TRIP_KEY, token);

export function readDraft<T>(key: string): Partial<T> | null {
  const raw = read(DRAFT_PREFIX + key);
  if (!raw) return null;
  try { const value = JSON.parse(raw); return value && typeof value === "object" ? value : null; } catch { return null; }
}
export const writeDraft = (key: string, value: unknown) => write(DRAFT_PREFIX + key, JSON.stringify(value));
export const clearDraft = (key: string) => write(DRAFT_PREFIX + key, null);
export function clearTripDrafts(tripId: string) {
  write(DRAFT_PREFIX + `depart:${tripId}`, null);
  write(DRAFT_PREFIX + `return:${tripId}`, null);
}

export const tripLink = (token: string) => {
  const url = new URL("/", window.location.origin);
  url.searchParams.set("fleet", "1");
  url.searchParams.set("trip", token);
  return url.toString();
};

// Keep the trip in the address bar so a refresh or bookmark reopens it.
export function showTripInAddressBar(token: string | null) {
  const url = new URL(window.location.href);
  url.searchParams.delete("vehicle");
  url.searchParams.set("fleet", "1");
  if (token) url.searchParams.set("trip", token); else url.searchParams.delete("trip");
  window.history.replaceState({}, "", url.toString());
}
