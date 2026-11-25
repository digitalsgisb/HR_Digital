import { FleetCarPicker } from "./FleetCarPicker";
import { useEffect, useLayoutEffect, useState, type FormEvent } from "react";
import type { TripLinkDelivery, Vehicle, VehicleAvailability, VehicleReservation, VehicleTrip } from "@hr-training/shared";
import { api } from "./api";
import { BookingWindowPicker, bookingWindowRequest, defaultBookingWindow } from "./BookingWindowPicker";
import { LOCATION_CONSENT_TEXT, currentLocation } from "./trip-location";
import { StartTripForm, CompleteTripForm } from "./App";
import { clearTripDrafts, rememberEmployeeId, rememberTripToken, rememberedEmployeeId, rememberedTripToken, showTripInAddressBar, tripLink } from "./fleet-storage";
export async function workflowRequest<T>(path: string, body?: unknown, method = "POST"): Promise<T> { const response = await fetch(`/api${path}`, body === undefined ? undefined : { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const result = await response.json(); if (!response.ok)
    throw Error(result.message || "Could not save. Please retry."); return result; }

const initialTripToken = () => new URLSearchParams(window.location.search).get("trip") || rememberedTripToken();

function TripLinkCard({ token, delivery }: { token: string; delivery: TripLinkDelivery | null }) {
    const link = tripLink(token);
    const [copied, setCopied] = useState(false);
    const copy = async () => { try { await navigator.clipboard.writeText(link); setCopied(true); window.setTimeout(() => setCopied(false), 2500); } catch { window.prompt("Copy your trip link:", link); } };
    const share = async () => { try { await navigator.share({ title: "My company car trip", url: link }); } catch { /* cancelled */ } };
    return <section className="card fleet-trip-link" aria-labelledby="trip-link-title">
        <p className="fleet-trip-link-alert">IF YOU LOSE THIS LINK, you will need to scan the HR QR and enter your employee ID again.</p>
        <h2 id="trip-link-title">Save your trip link</h2>
        <p>Open this link to come back to your trip at any time: after collecting the key, and when returning the car.</p>
        {delivery === "employee" && <p><strong>We have emailed this link to you.</strong></p>}
        {delivery === "hod" && <p><strong>You have no email on file, so we emailed this link to your HOD to forward to you.</strong></p>}
        {delivery === "none" && <p className="fleet-trip-link-only"><strong>This screen is the only copy.</strong> No email is on file for you or your HOD. Copy or share the link now.</p>}
        <input className="fleet-trip-link-url" readOnly value={link} onFocus={event => event.currentTarget.select()} aria-label="Your trip link"/>
        <div className="toolbar-actions">
            <button type="button" className="button button-primary" onClick={() => void copy()}>{copied ? "Copied" : "Copy link"}</button>
            {"share" in navigator && <button type="button" className="button button-secondary" onClick={() => void share()}>Share to myself</button>}
        </div>
    </section>;
}

export function FleetAccess() {
    useLayoutEffect(() => {
        document.documentElement.classList.add("fleet-access-mode");
        document.body.classList.add("fleet-access-mode");
        window.scrollTo(0, 0);
        return () => {
            document.documentElement.classList.remove("fleet-access-mode");
            document.body.classList.remove("fleet-access-mode");
        };
    }, []);
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [employeeId, setEmployeeId] = useState(rememberedEmployeeId);
    const [employee, setEmployee] = useState<{employeeId: string; name: string} | null>(null);
    const [identityLoading, setIdentityLoading] = useState(() => Boolean(rememberedEmployeeId()));
    const [identityError, setIdentityError] = useState("");
    const [identityAttempt, setIdentityAttempt] = useState(0);
    const [identified, setIdentified] = useState(false);
    const [resuming, setResuming] = useState(() => Boolean(initialTripToken()));
    const [trip, setTrip] = useState<VehicleTrip | null>(null);
    const [linkDelivery, setLinkDelivery] = useState<TripLinkDelivery | null>(null);
    const [carId, setCarId] = useState("");
    const [mode, setMode] = useState<"take" | "return">("take");
    const [destination, setDestination] = useState("");
    const [purpose, setPurpose] = useState("");
    const [when, setWhen] = useState(() => defaultBookingWindow());
    const [availability, setAvailability] = useState<VehicleAvailability[] | null>(null);
    const [availabilityError, setAvailabilityError] = useState("");
    const [locationConsent, setLocationConsent] = useState(false);
    const [error, setError] = useState("");
    const [message, setMessage] = useState("");
    const [busy, setBusy] = useState(false);
    useEffect(() => {
        window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
    }, [identified, trip?.status]);
    const name = employee?.name || "";
    const identity = { driverEmployeeId: employee?.employeeId || employeeId, driverName: name };
    const openTrip = (next: VehicleTrip | null) => {
        setTrip(next);
        if (next?.resumeToken) { rememberTripToken(next.resumeToken); showTripInAddressBar(next.resumeToken); }
    };
    const closeTrip = (tripId: string) => {
        clearTripDrafts(tripId);
        rememberTripToken(null);
        showTripInAddressBar(null);
        setTrip(null);
        setLinkDelivery(null);
    };
    // A personal trip link (or the trip saved on this phone) goes straight back to the trip.
    useEffect(() => {
        const token = initialTripToken();
        if (!token) return;
        let active = true;
        fetch(`/api/vehicle-trips/resume/${encodeURIComponent(token)}`, { cache: "no-store" }).then(async response => {
            const result = await response.json().catch(() => ({}));
            if (!active) return;
            if (response.ok) {
                const resumed = result as { trip: VehicleTrip; driver: { employeeId: string; name: string } };
                setEmployee(resumed.driver);
                setEmployeeId(resumed.driver.employeeId);
                rememberEmployeeId(resumed.driver.employeeId);
                setIdentityLoading(false);
                setIdentified(true);
                openTrip(resumed.trip);
            }
            else {
                if (response.status === 404 || response.status === 410) { rememberTripToken(null); showTripInAddressBar(null); }
                setMessage(result.message || "Could not open your trip. Enter your employee ID below.");
            }
        }).catch(() => { if (active) setMessage("Could not open your trip. Check your connection, or enter your employee ID below."); })
            .finally(() => { if (active) setResuming(false); });
        return () => { active = false; };
    }, []);
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
    const lookup = async (event: FormEvent) => { event.preventDefault(); if (!employee || identityLoading) return; await act(async () => { const trips = await workflowRequest<VehicleTrip[]>("/vehicle-trips/lookup", identity); rememberEmployeeId(employee.employeeId); openTrip(trips[0] || null); setMessage(""); setIdentified(true); await load(); if (mode === "return" && !trips.length)
        setMessage("No open car trip was found for you."); }); };
    const car = trip?.vehicle || vehicles.find(v => v.id === carId);
    const windowRequest = bookingWindowRequest(when);
    const windowKey = "error" in windowRequest ? "" : `${windowRequest.startAt}|${windowRequest.endAt}`;
    const choosing = identified && !trip && mode === "take";
    // Cars free for the chosen window (bookings and cars still out are excluded by the server).
    useEffect(() => {
        if (!choosing || !windowKey || "error" in windowRequest) { setAvailability(null); return; }
        const controller = new AbortController();
        const timer = window.setTimeout(() => {
            api.getVehicleAvailability(windowRequest, undefined, controller.signal).then(cars => { setAvailability(cars); setAvailabilityError(""); })
                .catch(e => { if (!controller.signal.aborted) setAvailabilityError(e instanceof Error ? e.message : "Could not check which cars are free."); });
        }, 250);
        return () => { window.clearTimeout(timer); controller.abort(); };
    }, [choosing, windowKey, vehicles]);
    const availableCars = (availability ?? []).filter(v => v.available);
    const busyCars = (availability ?? []).filter(v => !v.available);
    const bookedFrom = trip?.bookedFrom ? new Date(trip.bookedFrom) : null;
    const checkInOpens = bookedFrom ? new Date(bookedFrom.getTime() - 30 * 60000) : null;
    const myt = (date: string | Date) => new Date(date).toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
    return <main className="vehicle-usage-page"><div className="fleet-header-shell"><header className="vehicle-usage-brand"><img src="/sugihara-mark.png" alt="Sugihara Grand Industries"/><div className="fleet-product-brand"><strong>HR Digital</strong><span>Company car access</span></div><span className="fleet-header-company">Sugihara Grand Industries</span></header></div><div className="vehicle-usage-container"><section className="card vehicle-usage-heading"><h1>Company cars</h1><p>Collect a key, confirm departure, then return the car using your trip link or this same QR.</p></section>{error && <p className="form-error" role="alert">{error}</p>}{message && <p className="card" role="status">{message}</p>}
 {resuming ? <section className="card fleet-form" role="status"><p>Opening your trip…</p></section> : !identified ? <form className="card fleet-form" onSubmit={lookup}><div className="toolbar-actions"><button type="button" className="button" aria-pressed={mode === "take"} onClick={() => setMode("take")}>Book a car</button><button type="button" className="button" aria-pressed={mode === "return"} onClick={() => setMode("return")}>Return / resume a car</button></div><label className="field">Employee ID<input required maxLength={100} autoComplete="off" spellCheck={false} value={employeeId} onChange={e => { setEmployeeId(e.target.value); setEmployee(null); setIdentityError(""); setIdentityLoading(Boolean(e.target.value.trim())); }}/></label><label className="field">Employee name<input readOnly value={name} placeholder="Your name appears automatically" /></label><p role="status" aria-live="polite">{identityLoading ? "Finding your employee details…" : identityError || (employee ? "Employee found. Continue if this is your name." : "Enter your employee ID to find your name.")}</p>{identityError && <button type="button" className="button button-secondary" onClick={() => { setIdentityError(""); setIdentityLoading(true); setIdentityAttempt(attempt => attempt + 1); }}>Retry lookup</button>}<button className="button button-primary" disabled={busy || identityLoading || !employee}>Continue</button></form> : <>
 <section className="card fleet-form fleet-identity-card"><div><small>EMPLOYEE</small><p><strong>{name}</strong></p><span>{employee?.employeeId || employeeId}</span></div><button className="button button-secondary" onClick={() => { setIdentified(false); setTrip(null); setLinkDelivery(null); setMessage(""); setEmployeeId(""); setEmployee(null); setIdentityError(""); setIdentityLoading(false); rememberEmployeeId(null); rememberTripToken(null); showTripInAddressBar(null); }}>Change employee</button></section>
 {trip?.resumeToken && <TripLinkCard token={trip.resumeToken} delivery={linkDelivery}/>}
 {trip && car && trip.status === "BOOKED" ? <section className="card"><div className="fleet-form"><h2>{car.plate} · {car.model}</h2><p><strong>Booked</strong> · {trip.destination}</p><dl className="fleet-booking-times"><div><dt>From</dt><dd>{bookedFrom ? myt(bookedFrom) : "—"}</dd></div><div><dt>Until</dt><dd>{trip.expectedReturnAt ? myt(trip.expectedReturnAt) : "—"}</dd></div></dl><p>On the day, come to the HR table and check in to collect the key. Check-in opens at <strong>{checkInOpens ? myt(checkInOpens) : "—"}</strong>. If you have not checked in within 30 minutes of the start, the booking is released for others.</p><p>Booking reference: <strong>{trip.id.slice(-8).toUpperCase()}</strong></p><button className="button button-primary" disabled={busy || !checkInOpens || Date.now() < checkInOpens.getTime()} onClick={() => void act(async () => { const saved = await workflowRequest<VehicleTrip>(`/vehicle-trips/${trip.id}/check-in`, identity); openTrip(saved); setMessage("Checked in. Show the confirmation below to collect your key."); await load(); })}>{checkInOpens && Date.now() < checkInOpens.getTime() ? `Check-in opens ${myt(checkInOpens)}` : "Check in and collect key"}</button><button className="button button-secondary" disabled={busy} onClick={() => void act(async () => { const result = await workflowRequest<{ message: string }>(`/vehicle-trips/${trip.id}/cancel-reservation`, identity); closeTrip(trip.id); setMessage(result.message); await load(); })}>Cancel booking</button></div></section> : trip && car ? <section className="card"><div className="fleet-form"><h2>{car.plate} · {car.model}</h2><p><strong>{trip.status === "AWAITING_DEPARTURE" ? "Awaiting departure" : "In use"}</strong> · {trip.destination}</p>{trip.expectedReturnAt && <p>Expected return: {new Date(trip.expectedReturnAt).toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur" })}</p>}</div>{trip.status === "AWAITING_DEPARTURE" ? <><div className="fleet-form"><p>Show this confirmation to the key custodian. Collect the key, turn on the dashboard, then photograph the total ODO reading before driving.</p><p>Reservation reference: <strong>{trip.id.slice(-8).toUpperCase()}</strong></p><button className="button button-secondary" disabled={busy} onClick={() => void act(async () => { const result = await workflowRequest<{
            message: string;
        }>(`/vehicle-trips/${trip.id}/cancel-reservation`, identity); closeTrip(trip.id); setMessage(result.message); await load(); })}>Cancel reservation</button></div><label className="fleet-location-consent"><input type="checkbox" checked={locationConsent} onChange={event => setLocationConsent(event.target.checked)}/><span>{LOCATION_CONSENT_TEXT}</span></label><StartTripForm key={trip.id} draftKey={`depart:${trip.id}`} reservation={trip} vehicles={[car]} selectedVehicleId={car.id} onVehicleChange={() => { }} onSubmit={async (input) => { const location = locationConsent ? await currentLocation() : null; const saved = await workflowRequest<VehicleTrip>(`/vehicle-trips/${trip.id}/depart`, { ...input, ...identity, locationConsent, location }); openTrip(saved); setMessage(`Departure confirmed. Drive safely. Tap "I've arrived" when you reach ${saved.destination}, and open your trip link when returning.${locationConsent && !location ? " Your location could not be read this time." : ""}`); await load(); }}/></> : <>{trip.arrivedAt ? <p className="fleet-arrived" role="status">Arrived at {trip.destination} · {myt(trip.arrivedAt)}</p> : <div className="fleet-form fleet-arrive"><p>Reached <strong>{trip.destination}</strong>? Let HR know you have arrived.</p><button className="button button-secondary" disabled={busy} onClick={() => void act(async () => { const location = trip.locationConsent ? await currentLocation() : null; const saved = await workflowRequest<VehicleTrip>(`/vehicle-trips/${trip.id}/arrive`, { ...identity, location }); openTrip(saved); setMessage("Arrival recorded. Open your trip link when you are back to key in the return."); })}>I've arrived</button></div>}<CompleteTripForm key={trip.id} draftKey={`return:${trip.id}`} vehicle={car} trip={trip} onSubmit={async (input) => { const location = trip.locationConsent ? await currentLocation() : null; await api.completeVehicleTrip(trip.id, { ...input, location }); closeTrip(trip.id); setMessage("Car returned. Please return the key to the custodian."); setMode("return"); await load(); }}/></>}</section> : mode === "take" ? <form className="card fleet-form" onSubmit={event => { event.preventDefault(); if ("error" in windowRequest) return; void act(async () => { const saved = await workflowRequest<VehicleReservation>("/vehicle-trips/reserve", { ...identity, vehicleId: carId, destination, purpose, startAt: windowRequest.startAt, expectedReturnAt: windowRequest.endAt }); const { linkDelivery: delivery, ...reserved } = saved; setLinkDelivery(delivery); openTrip(reserved); setMessage(reserved.status === "BOOKED" ? "Car booked. Save your trip link and use it on the day to check in." : "Car reserved. Save your trip link, then show the confirmation below to collect your key."); await load(); }); }}><h2>Book a car</h2><BookingWindowPicker value={when} onChange={setWhen}/><h3>Choose your car</h3>{availabilityError ? <p className="form-error">{availabilityError}</p> : availability === null ? <p role="status">{"error" in windowRequest ? "Choose a valid time to see free cars." : "Checking which cars are free…"}</p> : availableCars.length ? <FleetCarPicker vehicles={availableCars} value={carId} onChange={setCarId}/> : <p role="status">No car is free for this time. Try another time.</p>}{busyCars.length > 0 && <details className="fleet-busy-cars"><summary>{busyCars.length} not available for this time</summary><ul>{busyCars.map(busyCar => <li key={busyCar.id}><strong>{busyCar.plate}</strong> · {busyCar.reason}</li>)}</ul></details>}{car && availableCars.some(free => free.id === car.id) && <p className="fleet-mileage-hint">Last recorded odometer: {car.mileage.toLocaleString()} km</p>}<label className="field">Destination<input required minLength={2} value={destination} onChange={e => setDestination(e.target.value)}/></label><label className="field">Purpose<input required minLength={2} value={purpose} onChange={e => setPurpose(e.target.value)}/></label><button className="button button-primary" disabled={busy || "error" in windowRequest || !availableCars.some(vehicle => vehicle.id === carId)}>{when.mode === "now" ? "Reserve car and collect key" : "Book car"}</button></form> : <section className="card fleet-form"><p>No open trip. If you need a car, start a new reservation.</p><button className="button" onClick={() => { setMode("take"); setMessage(""); }}>Book a car</button></section>}
 </>}</div></main>;
}
