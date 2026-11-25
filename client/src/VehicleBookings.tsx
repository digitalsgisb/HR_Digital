import { useCallback, useEffect, useState, type FormEvent } from "react";
import { CalendarClock, Plus } from "lucide-react";
import type { VehicleAvailability, VehicleTrip } from "@hr-training/shared";
import { api } from "./api";
import { BookingWindowPicker, bookingWindowRequest, defaultBookingWindow, type BookingWindowValue } from "./BookingWindowPicker";
import { VehicleDriverPicker, type TripDriver } from "./VehicleDriverPicker";

const myt = (date: string | null | undefined) => date ? new Date(date).toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "—";
const toPickerValue = (trip: VehicleTrip): BookingWindowValue => {
  const parts = (iso: string) => { const local = new Date(Date.parse(iso) + 8 * 3600000).toISOString(); return [local.slice(0, 10), local.slice(11, 16)]; };
  const [startDay, startTime] = parts(trip.bookedFrom || trip.startedAt);
  const [endDay, endTime] = parts(trip.expectedReturnAt || trip.startedAt);
  return { mode: "later", startDay, startTime, endDay, endTime };
};

/** Lists free cars for a window; `excludeTripId` lets a booking keep its own slot while being changed. */
function useAvailability(window: BookingWindowValue, enabled: boolean, excludeTripId?: string) {
  const [cars, setCars] = useState<VehicleAvailability[] | null>(null);
  const request = bookingWindowRequest(window);
  const key = "error" in request ? "" : `${request.startAt}|${request.endAt}`;
  useEffect(() => {
    if (!enabled || !key || "error" in request) { setCars(null); return; }
    const controller = new AbortController();
    api.getVehicleAvailability(request, excludeTripId, controller.signal).then(setCars).catch(() => { if (!controller.signal.aborted) setCars([]); });
    return () => controller.abort();
  }, [enabled, key, excludeTripId]);
  return { cars, request };
}

function BookingForm({ booking, onDone, onCancel }: { booking?: VehicleTrip; onDone: (notice: string) => Promise<void>; onCancel: () => void }) {
  const [when, setWhen] = useState<BookingWindowValue>(() => booking ? toPickerValue(booking) : defaultBookingWindow("later"));
  const [driver, setDriver] = useState<TripDriver | null>(null);
  const [vehicleId, setVehicleId] = useState(booking?.vehicleId ?? "");
  const [destination, setDestination] = useState(booking?.destination ?? "");
  const [purpose, setPurpose] = useState(booking?.purpose ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { cars, request } = useAvailability(when, true, booking?.id);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if ("error" in request) { setError(request.error); return; }
    if (!booking && (!driver || driver.reference.startsWith("GUEST"))) { setError("Choose an employee. Guests cannot hold bookings."); return; }
    try {
      setBusy(true);
      if (booking) {
        if (!request.startAt) throw new Error("Choose a start time.");
        await api.updateVehicleBooking(booking.id, { vehicleId, startAt: request.startAt, endAt: request.endAt, destination, purpose });
        await onDone(`Booking changed. ${booking.driverName} will be emailed.`);
      } else {
        const saved = await api.createVehicleBooking({ employeeId: driver!.reference, vehicleId, startAt: request.startAt, endAt: request.endAt, destination, purpose });
        await onDone(`Booking created for ${saved.driverName}. ${saved.linkDelivery === "employee" ? "Their trip link has been emailed to them." : saved.linkDelivery === "hod" ? "Their trip link has been emailed to their HOD." : "No email is on file; give them the trip link from the booking."}`);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save the booking.");
    } finally { setBusy(false); }
  };
  return <form className="card fleet-form booking-form" onSubmit={submit}>
    <h3>{booking ? `Change booking · ${booking.driverName}` : "New booking"}</h3>
    {!booking && <VehicleDriverPicker onChange={setDriver} />}
    <BookingWindowPicker value={when} onChange={setWhen} allowNow={!booking} />
    <label className="field">Car<select required value={vehicleId} onChange={event => setVehicleId(event.target.value)}>
      <option value="">{cars === null ? "Choose a valid time first" : "Choose a car"}</option>
      {(cars ?? []).map(car => <option key={car.id} value={car.id} disabled={!car.available}>{car.plate} · {car.model}{car.available ? "" : ` — ${car.reason}`}</option>)}
    </select></label>
    <label className="field">Destination<input required minLength={2} value={destination} onChange={event => setDestination(event.target.value)} /></label>
    <label className="field">Purpose<input required minLength={2} value={purpose} onChange={event => setPurpose(event.target.value)} /></label>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="toolbar-actions"><button className="button button-primary" disabled={busy || !cars?.some(car => car.id === vehicleId && car.available)}>{busy ? "Saving…" : booking ? "Save changes" : "Create booking"}</button><button type="button" className="button button-secondary" onClick={onCancel}>Close</button></div>
  </form>;
}

/** HR view of upcoming advance bookings, with create, change and cancel. */
export function VehicleBookings({ onChanged }: { onChanged?: () => unknown }) {
  const [bookings, setBookings] = useState<VehicleTrip[] | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<VehicleTrip | "new" | null>(null);
  const [busyId, setBusyId] = useState("");
  const load = useCallback(async () => { try { setBookings(await api.getVehicleBookings()); setError(""); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load bookings."); } }, []);
  useEffect(() => { void load(); }, [load]);
  const done = async (message: string) => { setEditing(null); setNotice(message); await load(); await onChanged?.(); };
  const cancel = async (booking: VehicleTrip) => {
    if (!window.confirm(`Cancel ${booking.driverName}'s booking of ${booking.vehicle?.plate ?? "this car"} on ${myt(booking.bookedFrom)}? They will be emailed.`)) return;
    setBusyId(booking.id);
    try { await api.cancelVehicleBooking(booking.id); await done(`Booking cancelled. ${booking.driverName} will be emailed.`); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not cancel the booking."); }
    finally { setBusyId(""); }
  };
  return <section className="vehicle-bookings" aria-label="Upcoming car bookings">
    <div className="current-usage-heading"><div><h2>Upcoming bookings</h2></div><span>{bookings?.length ?? 0} booked</span><button className="button button-primary" onClick={() => { setNotice(""); setEditing("new"); }}><Plus size={16} /> New booking</button></div>
    {notice && <p className="card" role="status">{notice}</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    {editing && <BookingForm key={editing === "new" ? "new" : editing.id} booking={editing === "new" ? undefined : editing} onDone={done} onCancel={() => setEditing(null)} />}
    {bookings === null ? <p className="card current-usage-empty">Loading bookings…</p> : !bookings.length ? <p className="card current-usage-empty">No upcoming bookings.</p> :
      <div className="vehicle-booking-list">{bookings.map(booking => <article className="card vehicle-booking-row" key={booking.id}>
        <span className="vehicle-booking-icon"><CalendarClock size={20} /></span>
        <div><strong>{booking.vehicle?.plate ?? "Car"} · {booking.vehicle?.model ?? ""}</strong><small>{myt(booking.bookedFrom)} – {myt(booking.expectedReturnAt)}</small></div>
        <div><strong>{booking.driverName}</strong><small>{booking.driverEmployeeId} · {booking.destination}</small></div>
        <div className="toolbar-actions"><button className="button button-secondary" disabled={!!busyId} onClick={() => { setNotice(""); setEditing(booking); }}>Change</button><button className="button button-secondary" disabled={!!busyId} onClick={() => void cancel(booking)}>{busyId === booking.id ? "Cancelling…" : "Cancel"}</button></div>
      </article>)}</div>}
  </section>;
}
