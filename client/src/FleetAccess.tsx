import { useEffect, useState, type FormEvent } from "react";
import type { Vehicle, VehicleTrip } from "@hr-training/shared";
import { api } from "./api";
import { StartTripForm, CompleteTripForm } from "./App";
export async function workflowRequest<T>(path: string, body?: unknown): Promise<T> { const response = await fetch(`/api${path}`, body === undefined ? undefined : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const result = await response.json(); if (!response.ok)
    throw Error(result.message || "Could not save. Please retry."); return result; }
export function FleetAccess() {
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [employeeId, setEmployeeId] = useState("");
    const [name, setName] = useState("");
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
    const identity = { driverEmployeeId: employeeId, driverName: name };
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
    const lookup = async (event: FormEvent) => { event.preventDefault(); await act(async () => { const trips = await workflowRequest<VehicleTrip[]>("/vehicle-trips/lookup", identity); setTrip(trips[0] || null); setIdentified(true); await load(); if (mode === "return" && !trips.length)
        setMessage("No open car trip was found for you."); }); };
    const car = trip?.vehicle || vehicles.find(v => v.id === carId);
    return <main className="vehicle-usage-page"><div className="vehicle-usage-container"><header className="vehicle-usage-brand"><img src="/sgi-logo.png" alt="Sugihara Grand Industries"/><span>Company car access</span></header><section className="card vehicle-usage-heading"><h1>Company cars</h1><p>Collect a key, confirm departure, then return the car using this same QR.</p></section>{error && <p className="form-error" role="alert">{error}</p>}{message && <p className="card" role="status">{message}</p>}
 {!identified ? <form className="card fleet-form" onSubmit={lookup}><div className="toolbar-actions"><button type="button" className="button" aria-pressed={mode === "take"} onClick={() => setMode("take")}>Take a car</button><button type="button" className="button" aria-pressed={mode === "return"} onClick={() => setMode("return")}>Return / resume a car</button></div><label className="field">Employee ID<input required value={employeeId} onChange={e => setEmployeeId(e.target.value)}/></label><label className="field">Full name as recorded by HR<input required value={name} onChange={e => setName(e.target.value)}/></label><button className="button button-primary" disabled={busy}>Continue</button></form> : <>
 <section className="card fleet-form"><p>Employee: <strong>{name}</strong> · {employeeId}</p><button className="button button-secondary" onClick={() => { setIdentified(false); setTrip(null); setMessage(""); }}>Change employee</button></section>
 {trip && car ? <section className="card"><div className="fleet-form"><h2>{car.plate} · {car.model}</h2><p><strong>{trip.status === "AWAITING_DEPARTURE" ? "Awaiting departure" : "In use"}</strong> · {trip.destination}</p>{trip.expectedReturnAt && <p>Expected return: {new Date(trip.expectedReturnAt).toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur" })}</p>}</div>{trip.status === "AWAITING_DEPARTURE" ? <><div className="fleet-form"><p>Show this confirmation to the key custodian. Collect the key, turn on the dashboard, then photograph the total ODO reading before driving.</p><p>Reservation reference: <strong>{trip.id.slice(-8).toUpperCase()}</strong></p><button className="button button-secondary" disabled={busy} onClick={() => void act(async () => { const result = await workflowRequest<{
            message: string;
        }>(`/vehicle-trips/${trip.id}/cancel-reservation`, identity); setTrip(null); setMessage(result.message); await load(); })}>Cancel reservation</button></div><StartTripForm key={trip.id} reservation={trip} vehicles={[car]} selectedVehicleId={car.id} onVehicleChange={() => { }} onSubmit={async (input) => { const saved = await workflowRequest<VehicleTrip>(`/vehicle-trips/${trip.id}/depart`, { ...input, ...identity }); setTrip(saved); setMessage("Departure confirmed. Drive safely. Scan this QR again when returning."); await load(); }}/></> : <CompleteTripForm key={trip.id} vehicle={car} trip={trip} onSubmit={async (input) => { await api.completeVehicleTrip(trip.id, input); setTrip(null); setMessage("Car returned. Please return the key to the custodian."); setMode("return"); await load(); }}/>}</section> : mode === "take" ? <form className="card fleet-form" onSubmit={event => { event.preventDefault(); void act(async () => { const saved = await workflowRequest<VehicleTrip>("/vehicle-trips/reserve", { ...identity, vehicleId: carId, destination, purpose, expectedReturnAt: new Date(returnAt + ":00+08:00").toISOString() }); setTrip(saved); setMessage("Car reserved. Show the confirmation below to collect your key."); await load(); }); }}><h2>Choose your car</h2><label className="field">Available car<select required value={carId} onChange={e => setCarId(e.target.value)}><option value="">Select car</option>{vehicles.filter(v => v.status === "AVAILABLE" && v.mileage < v.serviceAt && (!v.serviceDueDate || new Date(v.serviceDueDate) > new Date())).map(v => <option key={v.id} value={v.id}>{v.plate} · {v.model}</option>)}</select></label>{car && <>{car.photo && <img src={car.photo} alt={car.plate} style={{ maxWidth: "100%", maxHeight: 220, objectFit: "contain" }}/>}<p>Last recorded odometer: {car.mileage.toLocaleString()} km</p></>}<label className="field">Destination<input required minLength={2} value={destination} onChange={e => setDestination(e.target.value)}/></label><label className="field">Purpose<input required minLength={2} value={purpose} onChange={e => setPurpose(e.target.value)}/></label><label className="field">Expected return (Malaysia time)<input required type="datetime-local" value={returnAt} onChange={e => setReturnAt(e.target.value)}/></label><button className="button button-primary" disabled={busy}>Reserve car and collect key</button></form> : <section className="card fleet-form"><p>No open trip. If you need a car, start a new reservation.</p><button className="button" onClick={() => { setMode("take"); setMessage(""); }}>Take a car</button></section>}
 </>}</div></main>;
}
