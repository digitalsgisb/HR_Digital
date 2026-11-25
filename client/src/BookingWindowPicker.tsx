import { useMemo } from "react";

// Booking times are Malaysia time on 30-minute steps; bookings go up to 14 days ahead and last at most 3 days.
const MYT = 8 * 3600000;
const SLOT = 30 * 60000;
const DAY = 86400000;
export const MAX_AHEAD_DAYS = 14;
export const MAX_LENGTH_DAYS = 3;

export type BookingWindowValue = { mode: "now" | "later"; startDay: string; startTime: string; endDay: string; endTime: string };

const mytDay = (time: number) => new Date(time + MYT).toISOString().slice(0, 10);
const mytTime = (time: number) => new Date(time + MYT).toISOString().slice(11, 16);
export const slotIso = (day: string, time: string) => new Date(`${day}T${time}:00+08:00`).toISOString();
const nextSlot = (time: number) => Math.ceil((time + 1) / SLOT) * SLOT;
const dayLabel = (day: string, today: string) => {
  const label = new Intl.DateTimeFormat("en-MY", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" }).format(new Date(`${day}T00:00:00Z`));
  const offset = Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY);
  return offset === 0 ? `Today · ${label}` : offset === 1 ? `Tomorrow · ${label}` : label;
};
const addDays = (day: string, days: number) => new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
const allTimes = Array.from({ length: 48 }, (_, index) => `${String(Math.floor(index / 2)).padStart(2, "0")}:${index % 2 ? "30" : "00"}`);
export const formatSlot = (time: string) => { const [hour, minute] = time.split(":").map(Number); return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${hour < 12 ? "am" : "pm"}`; };

/** A sensible starting value: now, returning in two hours (or a later slot starting at the next half hour). */
export function defaultBookingWindow(mode: "now" | "later" = "now", now = Date.now()): BookingWindowValue {
  const start = nextSlot(now);
  const end = start + 2 * 3600000;
  return { mode, startDay: mytDay(start), startTime: mytTime(start), endDay: mytDay(end), endTime: mytTime(end) };
}

/** The request fields for a window, or an error to show. */
export function bookingWindowRequest(value: BookingWindowValue, now = Date.now()): { startAt: string | null; endAt: string } | { error: string } {
  const endAt = slotIso(value.endDay, value.endTime);
  const end = Date.parse(endAt);
  if (value.mode === "now") {
    if (end <= now) return { error: "Choose a return time in the future." };
    if (end - now > MAX_LENGTH_DAYS * DAY) return { error: "A booking can be at most 3 days long." };
    return { startAt: null, endAt };
  }
  const startAt = slotIso(value.startDay, value.startTime);
  const start = Date.parse(startAt);
  if (start <= now) return { error: "Choose a start time in the future, or choose Now." };
  if (start - now > MAX_AHEAD_DAYS * DAY) return { error: "Bookings can be made up to 14 days ahead." };
  if (end <= start) return { error: "Return time must be after the start time." };
  if (end - start > MAX_LENGTH_DAYS * DAY) return { error: "A booking can be at most 3 days long." };
  return { startAt, endAt };
}

export function BookingWindowPicker({ value, onChange, allowNow = true }: { value: BookingWindowValue; onChange: (value: BookingWindowValue) => void; allowNow?: boolean }) {
  const now = Date.now();
  const today = mytDay(now);
  const startDays = useMemo(() => Array.from({ length: MAX_AHEAD_DAYS + 1 }, (_, index) => addDays(today, index)), [today]);
  const startTimes = allTimes.filter(time => Date.parse(slotIso(value.startDay, time)) > now);
  const from = value.mode === "now" ? today : value.startDay;
  const endDays = Array.from({ length: MAX_LENGTH_DAYS + 1 }, (_, index) => addDays(from, index));
  const earliestEnd = value.mode === "now" ? now : Date.parse(slotIso(value.startDay, value.startTime));
  const endTimes = allTimes.filter(time => Date.parse(slotIso(value.endDay, time)) > earliestEnd);
  const set = (patch: Partial<BookingWindowValue>) => onChange({ ...value, ...patch });
  const result = bookingWindowRequest(value, now);
  return <fieldset className="booking-window">
    <legend>When do you need the car?</legend>
    {allowNow && <div className="toolbar-actions booking-window-mode">
      <button type="button" className="button" aria-pressed={value.mode === "now"} onClick={() => set({ mode: "now" })}>Now</button>
      <button type="button" className="button" aria-pressed={value.mode === "later"} onClick={() => set({ mode: "later" })}>Later</button>
    </div>}
    {value.mode === "later" && <div className="booking-window-row">
      <label className="field">Start day<select value={value.startDay} onChange={event => set({ startDay: event.target.value })}>{startDays.map(day => <option key={day} value={day}>{dayLabel(day, today)}</option>)}</select></label>
      <label className="field">Start time<select value={value.startTime} onChange={event => set({ startTime: event.target.value })}>{!startTimes.includes(value.startTime) && <option value={value.startTime}>{formatSlot(value.startTime)} (passed)</option>}{startTimes.map(time => <option key={time} value={time}>{formatSlot(time)}</option>)}</select></label>
    </div>}
    <div className="booking-window-row">
      <label className="field">Return day<select value={value.endDay} onChange={event => set({ endDay: event.target.value })}>{!endDays.includes(value.endDay) && <option value={value.endDay}>{dayLabel(value.endDay, today)}</option>}{endDays.map(day => <option key={day} value={day}>{dayLabel(day, today)}</option>)}</select></label>
      <label className="field">Return time<select value={value.endTime} onChange={event => set({ endTime: event.target.value })}>{!endTimes.includes(value.endTime) && <option value={value.endTime}>{formatSlot(value.endTime)}</option>}{endTimes.map(time => <option key={time} value={time}>{formatSlot(time)}</option>)}</select></label>
    </div>
    <p className={"error" in result ? "form-error" : "booking-window-hint"} role="status">{"error" in result ? result.error : value.mode === "now" ? "Collect the key at the HR table straight after booking." : "Check in at the HR table from 30 minutes before the start. Bookings not checked in within 30 minutes of the start are released."}</p>
  </fieldset>;
}
