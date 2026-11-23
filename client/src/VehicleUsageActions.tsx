import { useEffect, useId, useRef, useState } from "react";
import { CarFront, MapPin, Trash2, X } from "lucide-react";
import type { Vehicle, VehicleTrip } from "@hr-training/shared";
import { api } from "./api";
import { errorText, optimistic, useHiddenIds } from "./optimistic";

export const isOpenVehicleUsage = (trip: VehicleTrip) => !trip.archivedAt && ["AWAITING_DEPARTURE", "IN_PROGRESS"].includes(trip.status);
const when = (date: string) => new Date(date).toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function RemoveVehicleUsage({ trip, disabled = false, onRemoved, onHide }: {
  trip: VehicleTrip; disabled?: boolean; onRemoved: () => Promise<void>;
  /** Hides the record right away and returns a function that restores it. */
  onHide?: (id: string) => () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [open, setOpen] = useState(false);
    const [error, setError] = useState("");
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const active = isOpenVehicleUsage(trip);
  useEffect(() => { if (open && !dialog.current?.open) dialog.current?.showModal(); }, [open]);
  return <>
    <button type="button" className="button button-danger-outline" disabled={disabled} onClick={() => {
      setReason(""); setConfirmed(false); setError(""); setOpen(true);
    }}><Trash2 size={15} />Remove usage</button>
    {open && <dialog className="usage-remove-dialog" ref={dialog} aria-labelledby={titleId} onCancel={() => {}} onClose={() => setOpen(false)}>
      <header><h2 id={titleId}>Remove this usage?</h2><button type="button" aria-label="Close removal" onClick={() => dialog.current?.close()}><X size={20} /></button></header>
      <form onSubmit={async event => {
        event.preventDefault(); setError("");
        dialog.current?.close(); setOpen(false);
        const result = await optimistic(() => onHide?.(trip.id), () => api.removeVehicleTrip(trip.id, reason, confirmed), { ids: [trip.id] });
        if (result.ok) { await onRemoved().catch(() => {}); return; }
        setError(errorText(result.error, "Could not remove this usage. Please retry.")); setOpen(true);
      }}>
        <p><strong>{trip.driverName}</strong> · {trip.vehicle?.plate || "Company car"}<br />{trip.destination} · {trip.purpose}</p>
        <p>{active ? "This closes the current usage and releases the car, subject to its service and safety status. Only continue once the car is no longer in use." : "This removes the record from usage history and totals."}</p>
        <p>The record and its photos are retained for recovery. The car's saved mileage will stay unchanged.</p>
        <label className="field"><span>Reason for removal</span><textarea required minLength={2} maxLength={1000} value={reason} onChange={event => setReason(event.target.value)} placeholder="For example: duplicate entry or cancelled journey" /></label>
        {active && <label className="usage-remove-confirm"><input type="checkbox" required checked={confirmed} onChange={event => setConfirmed(event.target.checked)} /><span>The car is no longer in use and the key has been returned, if collected.</span></label>}
        {error && <p className="form-error" role="alert">{error}</p>}
        <footer><button type="button" className="button button-secondary" onClick={() => dialog.current?.close()}>Keep usage</button><button className="button button-danger" disabled={reason.trim().length < 2 || (active && !confirmed)}>Remove usage</button></footer>
      </form>
    </dialog>}
  </>;
}

export function CurrentUsageCards({ trips, vehicles, disabled = false, onRemoved, onReturn, onHistory }: {
  trips: VehicleTrip[]; vehicles: Vehicle[]; disabled?: boolean; onRemoved: () => Promise<void>;
  onReturn?: (trip: VehicleTrip) => void; onHistory?: (id: string) => void;
}) {
  const [hidden, hide] = useHiddenIds();
  const records = new Map(trips.map(trip => [trip.id, trip]));
  vehicles.forEach(vehicle => { if (vehicle.activeTrip) records.set(vehicle.activeTrip.id, { ...vehicle.activeTrip, vehicle }); });
  const active = [...records.values()].filter(isOpenVehicleUsage).sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
  const shown = active.filter(trip => !hidden.has(trip.id)).length;
  return <section className="current-usage-section" aria-label="Current car usage">
    <div className="current-usage-heading"><div><h2>Current usage</h2></div><span>{shown} open {shown === 1 ? "trip" : "trips"}</span></div>
    {!shown && <p className="card current-usage-empty">{disabled ? "Loading current usage…" : "No cars are currently reserved or in use."}</p>}
    <div className="current-usage-grid">{active.map(trip => {
      const vehicle = trip.vehicle || vehicles.find(car => car.id === trip.vehicleId);
      const awaiting = trip.status === "AWAITING_DEPARTURE";
      const overdue = trip.expectedReturnAt && new Date(trip.expectedReturnAt) < new Date();
      return <article className={`card current-usage-card ${hidden.has(trip.id) ? "is-removed" : ""}`} key={trip.id}>
        <div className="current-usage-car">{vehicle?.photo ? <img src={vehicle.photo} alt={`${vehicle.plate} ${vehicle.model}`} /> : <span><CarFront size={36} /></span>}<div><strong>{vehicle?.plate || "Company car"}</strong><small>{vehicle?.model || ""}</small></div><span className="status-badge">{awaiting ? "Awaiting departure" : "In use"}</span></div>
        <div className="current-usage-driver"><strong>{trip.driverName}</strong><span>{trip.driverEmployeeId}</span></div>
        <p className="current-usage-destination"><MapPin size={16} />{trip.destination}</p><p>{trip.purpose}</p>
        <dl><div><dt>{awaiting ? "Reserved" : "Departed"}</dt><dd>{when(trip.departedAt || trip.startedAt)}</dd></div><div><dt>Expected return</dt><dd className={overdue ? "usage-overdue" : ""}>{trip.expectedReturnAt ? when(trip.expectedReturnAt) : "Not recorded"}{overdue ? " · Overdue" : ""}</dd></div><div><dt>{awaiting ? "Last recorded mileage" : "Starting mileage"}</dt><dd>{trip.odometerStart.toLocaleString()} km</dd></div></dl>
        <footer>{onHistory && <button className="button button-secondary" disabled={disabled} onClick={() => onHistory(trip.vehicleId)}>View history</button>}{onReturn && !awaiting && <button className="button button-primary" disabled={disabled} onClick={() => onReturn(trip)}>Return car</button>}<RemoveVehicleUsage trip={{ ...trip, vehicle }} disabled={disabled} onRemoved={onRemoved} onHide={hide} /></footer>
      </article>;
    })}</div>
  </section>;
}
