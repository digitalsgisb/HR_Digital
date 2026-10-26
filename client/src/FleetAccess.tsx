import { FleetCarPicker } from "./FleetCarPicker";
import { useEffect, useState, type FormEvent } from "react";
import type { Vehicle, VehicleTrip } from "@hr-training/shared";
import { api } from "./api";
import { StartTripForm, CompleteTripForm } from "./App";
export async function workflowRequest<T>(path: string, body?: unknown): Promise<T> { const response = await fetch(`/api${path}`, body === undefined ? undefined : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const result = await response.json(); if (!response.ok)
    throw Error(result.message || "Could not save. Please retry."); return result; }
export function FleetAccess() {
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [employeeId, setEmployeeId] = useState("");
    const [employee, setEmployee] = useState<{employeeId: string; name: string} | null>(null);
    const [identityLoading, setIdentityLoading] = useState(false);
    const [identityError, setIdentityError] = useState("");
    const [identityAttempt, setIdentityAttempt] = useState(0);
    const [identified, setIdentified] = useState(false);
    const [trip, setTrip] = useState<VehicleTrip | null>(null);
    const [carId, setCarId] = useState("");
    const [mode, setMode] = useState<"take" | "return">("take");
    const [destination, setDestination] = useState("");
    const [purpose, setPurpose] = useState("");
    const [returnAt, setReturnAt] = useState("");
    const [error, setError] = useState("");
    const [message, setMessage] = useState("");
    const [busy, setBusy] = useState(false);
    const name = employee?.name || "";
    const identity = { driverEmployeeId: employee?.employeeId || employeeId, driverName: name };
    useEffect(() => {
        if (identified || !employeeId.trim()) return;
        const controller = new AbortController();
        setIdentityLoading(true);
        const timer = window.setTimeout(() => {
            api.identifyFleetDriver(employeeId.trim(), controller.signal).then(result => {
                if (!controller.signal.aborted) setEmployee(result);
            }).catch(error => {
                if (!controller.signal.aborted) setIdentityError(error instanceof Error ? error.message : "Could not find your employee details. Please retry.");
            }).finally(() => {
                if (!controller.signal.aborted) setIdentityLoading(false);
            });
        }, 500);
        return () => { window.clearTimeout(timer); controller.abort(); };
    }, [employeeId, identified, identityAttempt]);
    const load = async () => setVehicles(await api.getVehicles());
    useEffect(() => { void load().catch(e => setError(e.message)); }, []);
    const act = async (fn: () => Promise<void>) => { setBusy(true); setError(""); try {
        await fn();
    }
    catch (e) {
        setError(e instanceof Error ? e.message : "Please retry.");
    }
    finally {
        setBusy(false);
    } };
    const lookup = async (event: FormEvent) => { event.preventDefault(); if (!employee || identityLoading) return; await act(async () => { const trips = await workflowRequest<VehicleTrip[]>("/vehicle-trips/lookup", identity); setTrip(trips[0] || null); setIdentified(true); await load(); if (mode === "return" && !trips.length)
        setMessage("No open car trip was found for you."); }); };
    const car = trip?.vehicle || vehicles.find(v => v.id === carId);
    const availableCars = vehicles.filter(v => v.status === "AVAILABLE" && v.mileage < v.serviceAt && (!v.serviceDueDate || new Date(v.serviceDueDate) > new Date()));
    return <main className="vehicle-usage-page"><div className="vehicle-usage-container"><header className="vehicle-usage-brand"><img src="/sugihara-mark.png" alt="Sugihara Grand Industries"/><div className="fleet-product-brand"><strong>HR Digital</strong><span>Company car access</span></div><span className="fleet-header-company">Sugihara Grand Industries</span></header><section className="card vehicle-usage-heading"><h1>Company cars</h1><p>Collect a key, confirm departure, then return the car using this same QR.</p></section>{error && <p className="form-error" role="alert">{error}</p>}{message && <p className="card" role="status">{message}</p>}
 {!identified ? <form className="card fleet-form" onSubmit={lookup}><div className="toolbar-actions"><button type="button" className="button" aria-pressed={mode === "take"} onClick={() => setMode("take")}>Take a car</button><button type="button" className="button" aria-pressed={mode === "return"} onClick={() => setMode("return")}>Return / resume a car</button></div><label className="field">Employee ID<input required maxLength={100} autoComplete="off" spellCheck={false} value={employeeId} onChange={e => { setEmployeeId(e.target.value); setEmployee(null); setIdentityError(""); setIdentityLoading(Boolean(e.target.value.trim())); }}/></label><label className="field">Employee name<input readOnly value={name} placeholder="Your name appears automatically" /></label><p role="status" aria-live="polite">{identityLoading ? "Finding your employee details…" : identityError || (employee ? "Employee found. Continue if this is your name." : "Enter your employee ID to find your name.")}</p>{identityError && <button type="button" className="button button-secondary" onClick={() => { setIdentityError(""); setIdentityLoading(true); setIdentityAttempt(attempt => attempt + 1); }}>Retry lookup</button>}<button className="button button-primary" disabled={busy || identityLoading || !employee}>Continue</button></form> : <>
 <section className="card fleet-form fleet-identity-card"><div><small>EMPLOYEE</small><p><strong>{name}</strong></p><span>{employee?.employeeId || employeeId}</span></div><button className="button button-secondary" onClick={() => { setIdentified(false); setTrip(null); setMessage(""); setEmployeeId(""); setEmployee(null); setIdentityError(""); setIdentityLoading(false); }}>Change employee</button></section>
 {trip && car ? <section className="card"><div className="fleet-form"><h2>{car.plate} · {car.model}</h2><p><strong>{trip.status === "AWAITING_DEPARTURE" ? "Awaiting departure" : "In use"}</strong> · {trip.destination}</p>{trip.expectedReturnAt && <p>Expected return: {new Date(trip.expectedReturnAt).toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur" })}</p>}</div>{trip.status === "AWAITING_DEPARTURE" ? <><div className="fleet-form"><p>Show this confirmation to the key custodian. Collect the key, turn on the dashboard, then photograph the total ODO reading before driving.</p><p>Reservation reference: <strong>{trip.id.slice(-8).toUpperCase()}</strong></p><button className="button button-secondary" disabled={busy} onClick={() => void act(async () => { const result = await workflowRequest<{
            message: string;
        }>(`/vehicle-trips/${trip.id}/cancel-reservation`, identity); setTrip(null); setMessage(result.message); await load(); })}>Cancel reservation</button></div><StartTripForm key={trip.id} reservation={trip} vehicles={[car]} selectedVehicleId={car.id} onVehicleChange={() => { }} onSubmit={async (input) => { const saved = await workflowRequest<VehicleTrip>(`/vehicle-trips/${trip.id}/depart`, { ...input, ...identity }); setTrip(saved); setMessage("Departure confirmed. Drive safely. Scan this QR again when returning."); await load(); }}/></> : <CompleteTripForm key={trip.id} vehicle={car} trip={trip} onSubmit={async (input) => { await api.completeVehicleTrip(trip.id, input); setTrip(null); setMessage("Car returned. Please return the key to the custodian."); setMode("return"); await load(); }}/>}</section> : mode === "take" ? <form className="card fleet-form" onSubmit={event => { event.preventDefault(); void act(async () => { const saved = await workflowRequest<VehicleTrip>("/vehicle-trips/reserve", { ...identity, vehicleId: carId, destination, purpose, expectedReturnAt: new Date(returnAt + ":00+08:00").toISOString() }); setTrip(saved); setMessage("Car reserved. Show the confirmation below to collect your key."); await load(); }); }}><h2>Choose your car</h2><FleetCarPicker vehicles={availableCars} value={carId} onChange={setCarId}/>{car && <p className="fleet-mileage-hint">Last recorded odometer: {car.mileage.toLocaleString()} km</p>}<label className="field">Destination<input required minLength={2} value={destination} onChange={e => setDestination(e.target.value)}/></label><label className="field">Purpose<input required minLength={2} value={purpose} onChange={e => setPurpose(e.target.value)}/></label><label className="field">Expected return (Malaysia time)<input required type="datetime-local" value={returnAt} onChange={e => setReturnAt(e.target.value)}/></label><button className="button button-primary" disabled={busy || !availableCars.some(vehicle => vehicle.id === carId)}>Reserve car and collect key</button></form> : <section className="card fleet-form"><p>No open trip. If you need a car, start a new reservation.</p><button className="button" onClick={() => { setMode("take"); setMessage(""); }}>Take a car</button></section>}
 </>}</div></main>;
}
