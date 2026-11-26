import { FleetCarPicker } from "./FleetCarPicker";
import { FleetActionSheet, useActionSheet, type SheetCopy } from "./FleetActionSheet";
import { useEffect, useLayoutEffect, useState, type FormEvent } from "react";
import { CalendarPlus, CarFront, Check, CircleCheck, Info, Link2, UserRound } from "lucide-react";
import type { TripLinkDelivery, Vehicle, VehicleAvailability, VehicleReservation, VehicleTrip } from "@hr-training/shared";
import { api } from "./api";
import { apiBase } from "./api-base";
import { BookingWindowPicker, bookingWindowRequest, defaultBookingWindow } from "./BookingWindowPicker";
import { LOCATION_CONSENT_TEXT, currentLocation } from "./trip-location";
import { StartTripForm, CompleteTripForm } from "./TripForms";
import { clearTripDrafts, rememberEmployeeId, rememberTripToken, rememberedEmployeeId, rememberedTripToken, showTripInAddressBar, tripLink } from "./fleet-storage";
export async function workflowRequest<T>(path: string, body?: unknown, method = "POST"): Promise<T> { const response = await fetch(`${apiBase}${path}`, body === undefined ? undefined : { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const result = await response.json(); if (!response.ok)
    throw Error(result.message || "Could not save. Please retry."); return result; }

const scrollContent = (behavior: ScrollBehavior = "instant") => window.scrollTo({ top: 0, behavior });
/** Fields that bring up the phone keyboard (not ticks, radios or the camera button). */
const opensKeyboard = (target: EventTarget | null) => target instanceof HTMLElement && (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || (target instanceof HTMLInputElement && !["checkbox", "radio", "file", "button", "submit", "range"].includes(target.type)));
const successMessage = /reserved|booked|checked in|confirmed|recorded|returned|cancelled|released/i;
const initialTripToken = () => new URLSearchParams(window.location.search).get("trip") || rememberedTripToken();
/** Set when the page was opened from a car's own QR sticker (/fleet/?car=<id>). */
const scannedCarId = new URLSearchParams(window.location.search).get("car");
type ScannedCar = { id: string; plate: string; model: string; photo: string | null; status: Vehicle["status"]; serviceDue: boolean;
    current: { tripId: string; status: VehicleTrip["status"]; driverName: string; until: string | null } | null;
    next: { driverName: string; from: string; until: string | null } | null };
const shortTime = (date: string | null) => date ? new Date(date).toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "not set";

function ScannedCarCard({ car, otherTrip, onOpenOtherTrip, onBook }: { car: ScannedCar; otherTrip: VehicleTrip | null; onOpenOtherTrip: () => void; onBook: () => void }) {
    const free = !car.current && car.status !== "OUT_OF_SERVICE" && !car.serviceDue;
    return <section className="card fleet-form fleet-scanned-car" aria-label={`Car ${car.plate}`}>
        <div className="fleet-scanned-car-head">{car.photo ? <img src={car.photo} alt=""/> : null}<div><small>THIS CAR</small><h2>{car.plate}</h2><span>{car.model}</span></div></div>
        {car.current ? <p className="fleet-scanned-status is-busy"><strong>{car.current.status === "AWAITING_DEPARTURE" ? "Reserved" : "In use"} by {car.current.driverName}</strong> until {shortTime(car.current.until)}. If this is your trip, enter your employee ID below.</p>
            : !free ? <p className="fleet-scanned-status is-service"><strong>{car.status === "OUT_OF_SERVICE" ? "Out of service" : "Service due"}.</strong> This car cannot be used. Please contact HR.</p>
            : <p className="fleet-scanned-status is-free"><strong>Available now.</strong> Keys are collected from the HR table.</p>}
        {car.next && <p>Next booking: {shortTime(car.next.from)} – {shortTime(car.next.until)} · {car.next.driverName}</p>}
        {free && <button type="button" className="button button-primary" onClick={onBook}>Book this car</button>}
        {otherTrip && <button type="button" className="button button-secondary" onClick={onOpenOtherTrip}>Open my trip on {otherTrip.vehicle?.plate ?? "another car"}</button>}
    </section>;
}

function TripLinkCard({ token, delivery }: { token: string; delivery: TripLinkDelivery | null }) {
    const link = tripLink(token);
    const [copied, setCopied] = useState(false);
    const copy = async () => { try { await navigator.clipboard.writeText(link); setCopied(true); window.setTimeout(() => setCopied(false), 2500); } catch { window.prompt("Copy your trip link:", link); } };
    const share = async () => { try { await navigator.share({ title: "My company car trip", url: link }); } catch { /* cancelled */ } };
    return <section className="card fleet-trip-link" aria-labelledby="trip-link-title">
        <div className="fleet-trip-link-head"><span aria-hidden="true"><Link2 size={20}/></span><div><h2 id="trip-link-title">Your trip link</h2><p>Open it to check in, depart and return this car.</p></div></div>
        {delivery === "employee" && <p className="fleet-trip-link-delivery">A copy is in your email.</p>}
        {delivery === "hod" && <p className="fleet-trip-link-delivery">There is no email on file for you, so we sent the link to your HOD to forward to you.</p>}
        {delivery === "none" && <p className="fleet-trip-link-only">There is no email on file, so this screen is the only copy. Copy or share the link now.</p>}
        <input className="fleet-trip-link-url" readOnly value={link} onFocus={event => event.currentTarget.select()} aria-label="Your trip link"/>
        <div className="fleet-trip-link-actions">
            <button type="button" className="button button-primary" onClick={() => void copy()}>{copied ? "Copied" : "Copy link"}</button>
            {"share" in navigator && <button type="button" className="button button-secondary" onClick={() => void share()}>Share</button>}
        </div>
        <p className="fleet-trip-link-note">Lost the link? Scan the HR QR and enter your employee ID to get back to your trip.</p>
    </section>;
}

export function FleetAccess() {
    useLayoutEffect(() => {
        document.documentElement.classList.add("fleet-access-mode");
        document.body.classList.add("fleet-access-mode");
        scrollContent();
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
    const [scannedCar, setScannedCar] = useState<ScannedCar | null>(null);
    const [otherTrip, setOtherTrip] = useState<{ trip: VehicleTrip; driver: { employeeId: string; name: string } } | null>(null);
    const [error, setError] = useState("");
    const [message, setMessage] = useState("");
    const [busy, setBusy] = useState(false);
    const [tab, setTab] = useState<"book" | "trip" | "me">("book");
    // Hide the tab bar only while the keyboard is on screen, so it does not float above it.
    // iPhone keeps the field focused after the keyboard is closed, so focus alone is not enough:
    // the visible area shrinking well below the window height is what says the keyboard is up.
    const [typing, setTyping] = useState(false);
    useEffect(() => {
        const viewport = window.visualViewport;
        const update = () => {
            const focused = opensKeyboard(document.activeElement);
            const keyboardUp = viewport ? window.innerHeight - viewport.height > 120 : focused;
            setTyping(focused && keyboardUp);
        };
        const later = () => window.setTimeout(update, 50);
        document.addEventListener("focusin", later);
        document.addEventListener("focusout", later);
        viewport?.addEventListener("resize", update);
        return () => { document.removeEventListener("focusin", later); document.removeEventListener("focusout", later); viewport?.removeEventListener("resize", update); };
    }, []);
    // Land on the open trip when there is one, otherwise on booking.
    useEffect(() => { if (identified) setTab(trip ? "trip" : "book"); }, [identified, trip?.id]);
    const showTab = (next: typeof tab) => { setTab(next); setMessage(""); setError(""); scrollContent(); };
    useEffect(() => {
        scrollContent(window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth");
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
        fetch(`${apiBase}/vehicle-trips/resume/${encodeURIComponent(token)}`, { cache: "no-store" }).then(async response => {
            const result = await response.json().catch(() => ({}));
            if (!active) return;
            if (response.ok) {
                const resumed = result as { trip: VehicleTrip; driver: { employeeId: string; name: string } };
                if (scannedCarId && resumed.trip.vehicleId !== scannedCarId) { setOtherTrip(resumed); return; }
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
        if (!scannedCarId) return;
        fetch(`${apiBase}/cars/${encodeURIComponent(scannedCarId)}`, { cache: "no-store" }).then(async response => {
            const result = await response.json().catch(() => ({}));
            if (response.ok) setScannedCar(result as ScannedCar); else setError(result.message || "This car QR is not recognised. Please contact HR.");
        }).catch(() => setError("Could not load this car. Check your connection."));
    }, []);
    const openOtherTrip = () => {
        if (!otherTrip) return;
        setEmployee(otherTrip.driver); setEmployeeId(otherTrip.driver.employeeId); rememberEmployeeId(otherTrip.driver.employeeId);
        setIdentityLoading(false); setIdentified(true); openTrip(otherTrip.trip); setOtherTrip(null);
    };
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
    const actionSheet = useActionSheet();
    const act = async (fn: () => Promise<void>, copy?: SheetCopy) => { setBusy(true); setError(""); try {
        await (copy ? actionSheet.run(copy, fn) : fn());
    }
    catch (e) {
        setError(e instanceof Error ? e.message : "Please retry.");
    }
    finally {
        setBusy(false);
    } };
    const actWith = (copy: SheetCopy, fn: () => Promise<void>) => act(fn, copy);
    const lookup = async (event: FormEvent) => { event.preventDefault(); if (!employee || identityLoading) return; await actWith({ pending: "Finding your trips", done: `Signed in as ${employee.name}` }, async () => { const trips = await workflowRequest<VehicleTrip[]>("/vehicle-trips/lookup", identity); rememberEmployeeId(employee.employeeId); openTrip(trips.find(found => found.vehicleId === scannedCarId) || trips[0] || null); setMessage(""); setIdentified(true); await load();
        if (!trips.length && scannedCar?.current) setMessage(`This car is ${scannedCar.current.status === "AWAITING_DEPARTURE" ? "reserved" : "in use"} by ${scannedCar.current.driverName} until ${shortTime(scannedCar.current.until)}. You have no open trip. Contact HR if this is wrong.`);
        else if (mode === "return" && !trips.length) setMessage("No open car trip was found for you."); }); };
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
    const pickedCar = availableCars.find(free => free.id === carId);
    const stepDone = [!("error" in windowRequest), Boolean(pickedCar), destination.trim().length >= 2 && purpose.trim().length >= 2];
    const stepBadge = (index: number) => <span aria-hidden="true">{stepDone[index] ? <Check size={15} strokeWidth={3}/> : index + 1}</span>;
    const bookedFrom = trip?.bookedFrom ? new Date(trip.bookedFrom) : null;
    const checkInOpens = bookedFrom ? new Date(bookedFrom.getTime() - 30 * 60000) : null;
    const myt = (date: string | Date) => new Date(date).toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
    return <main className={`vehicle-usage-page${identified && !resuming ? " has-tabbar" : ""}`}><div className="fleet-header-shell"><header className="vehicle-usage-brand"><img src={`${import.meta.env.BASE_URL}sugihara-mark.png`} alt="Sugihara Grand Industries"/><div className="fleet-product-brand"><strong>HR Digital</strong><span>Company car access</span></div><span className="fleet-header-company">Sugihara Grand Industries</span></header></div><div className="fleet-scroll"><div className="vehicle-usage-container">{!identified && <section className="card vehicle-usage-heading"><h1>Company cars</h1><p>Book a car, collect the key at the HR table, then use your trip link (or the QR in the car) to depart and return.</p></section>}{error && <p className="form-error" role="alert">{error}</p>}{message && <p key={message} className={`card fleet-notice ${successMessage.test(message) ? "is-success" : "is-info"}`} role="status">{successMessage.test(message) ? <CircleCheck size={22} aria-hidden="true"/> : <Info size={22} aria-hidden="true"/>}<span>{message}</span></p>}
 {!identified && !resuming && scannedCar && <ScannedCarCard car={scannedCar} otherTrip={otherTrip?.trip ?? null} onOpenOtherTrip={openOtherTrip} onBook={() => { setMode("take"); setCarId(scannedCar.id); setMessage("Enter your employee ID, then choose when you need the car."); }}/>}
 {!identified && !resuming && !scannedCar && otherTrip && <section className="card fleet-form"><button type="button" className="button button-primary" onClick={openOtherTrip}>Open my trip on {otherTrip.trip.vehicle?.plate ?? "my car"}</button></section>}
 {resuming ? <section className="card fleet-form" role="status"><p>Opening your trip…</p></section> : !identified ? <form className="card fleet-form" onSubmit={lookup}><div className="toolbar-actions"><button type="button" className="button" aria-pressed={mode === "take"} onClick={() => setMode("take")}>Book a car</button><button type="button" className="button" aria-pressed={mode === "return"} onClick={() => setMode("return")}>Return / resume a car</button></div><label className="field">Employee ID<input required maxLength={100} autoComplete="off" spellCheck={false} value={employeeId} onChange={e => { setEmployeeId(e.target.value); setEmployee(null); setIdentityError(""); setIdentityLoading(Boolean(e.target.value.trim())); }}/></label><label className="field">Employee name<input readOnly value={name} placeholder="Your name appears automatically" /></label><p role="status" aria-live="polite">{identityLoading ? "Finding your employee details…" : identityError || (employee ? "Employee found. Continue if this is your name." : "Enter your employee ID to find your name.")}</p>{identityError && <button type="button" className="button button-secondary" onClick={() => { setIdentityError(""); setIdentityLoading(true); setIdentityAttempt(attempt => attempt + 1); }}>Retry lookup</button>}<button className="button button-primary" disabled={busy || identityLoading || !employee}>Continue</button></form> : <>
 {tab === "me" && <><section className="card fleet-form fleet-identity-card"><div><small>EMPLOYEE</small><p><strong>{name}</strong></p><span>{employee?.employeeId || employeeId}</span></div><button className="button button-secondary" onClick={() => { setIdentified(false); setTrip(null); setLinkDelivery(null); setMessage(""); setEmployeeId(""); setEmployee(null); setIdentityError(""); setIdentityLoading(false); rememberEmployeeId(null); rememberTripToken(null); showTripInAddressBar(null); }}>Change employee</button></section><section className="card fleet-form fleet-howto"><h2>How it works</h2><ol><li><strong>Book</strong> a car for now or for later.</li><li><strong>Collect the key</strong> at the HR table. Check in first if you booked ahead.</li><li><strong>Depart</strong>: key in the odometer and do the quick safety check.</li><li><strong>Return</strong>: key in the odometer again and hand the key back.</li></ol><p>Your trip link and the QR sticker in the car both bring you back to your trip.</p></section></>}
 {tab === "trip" && trip?.resumeToken && <TripLinkCard token={trip.resumeToken} delivery={linkDelivery}/>}
 {tab === "trip" && trip && car && trip.status === "BOOKED" ? <section className="card fleet-trip-card"><div className="fleet-form"><h2>{car.plate} · {car.model}</h2><p><strong>Booked</strong> · {trip.destination}</p><dl className="fleet-booking-times"><div><dt>From</dt><dd>{bookedFrom ? myt(bookedFrom) : "—"}</dd></div><div><dt>Until</dt><dd>{trip.expectedReturnAt ? myt(trip.expectedReturnAt) : "—"}</dd></div></dl><p>On the day, come to the HR table and check in to collect the key. Check-in opens at <strong>{checkInOpens ? myt(checkInOpens) : "—"}</strong>. If you have not checked in within 30 minutes of the start, the booking is released for others.</p><p>Booking reference: <strong>{trip.id.slice(-8).toUpperCase()}</strong></p><button className="button button-primary" disabled={busy || !checkInOpens || Date.now() < checkInOpens.getTime()} onClick={() => void actWith({ pending: "Checking you in", done: "Checked in", detail: "Show this screen at the HR table to collect the key.", plate: car.plate }, async () => { const saved = await workflowRequest<VehicleTrip>(`/vehicle-trips/${trip.id}/check-in`, identity); openTrip(saved); setMessage("Checked in. Show the confirmation below to collect your key."); await load(); })}>{checkInOpens && Date.now() < checkInOpens.getTime() ? `Check-in opens ${myt(checkInOpens)}` : "Check in and collect key"}</button><button className="button button-secondary" disabled={busy} onClick={() => void actWith({ pending: "Cancelling booking", done: "Booking cancelled", detail: "The car is free for others again.", plate: car.plate }, async () => { const result = await workflowRequest<{ message: string }>(`/vehicle-trips/${trip.id}/cancel-reservation`, identity); closeTrip(trip.id); setMessage(result.message); await load(); })}>Cancel booking</button></div></section> : tab === "trip" && trip && car ? <section className="card fleet-trip-card"><div className="fleet-form"><h2>{car.plate} · {car.model}</h2><p><strong>{trip.status === "AWAITING_DEPARTURE" ? "Awaiting departure" : "In use"}</strong> · {trip.destination}</p>{trip.expectedReturnAt && <p>Expected return: {new Date(trip.expectedReturnAt).toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur" })}</p>}</div>{trip.status === "AWAITING_DEPARTURE" ? <><div className="fleet-form"><p>Show this confirmation to the key custodian. Collect the key, turn on the dashboard, then key in the total ODO reading before driving.</p><p>Reservation reference: <strong>{trip.id.slice(-8).toUpperCase()}</strong></p><button className="button button-secondary" disabled={busy} onClick={() => void actWith({ pending: "Cancelling reservation", done: "Reservation cancelled", detail: "Hand the key back to HR if you collected it.", plate: car.plate }, async () => { const result = await workflowRequest<{
            message: string;
        }>(`/vehicle-trips/${trip.id}/cancel-reservation`, identity); closeTrip(trip.id); setMessage(result.message); await load(); })}>Cancel reservation</button></div><label className="fleet-location-consent"><input type="checkbox" checked={locationConsent} onChange={event => setLocationConsent(event.target.checked)}/><span>{LOCATION_CONSENT_TEXT}</span></label><StartTripForm key={trip.id} draftKey={`depart:${trip.id}`} reservation={trip} vehicles={[car]} selectedVehicleId={car.id} onVehicleChange={() => { }} onSubmit={input => actionSheet.run({ pending: "Confirming departure", done: "Departure confirmed", detail: "Drive safely. Tap “I've arrived” when you get there.", plate: car.plate }, async () => { const location = locationConsent ? await currentLocation() : null; const saved = await workflowRequest<VehicleTrip>(`/vehicle-trips/${trip.id}/depart`, { ...input, ...identity, locationConsent, location }); openTrip(saved); setMessage(`Departure confirmed. Drive safely. Tap "I've arrived" when you reach ${saved.destination}, and open your trip link when returning.${locationConsent && !location ? " Your location could not be read this time." : ""}`); await load(); })}/></> : <>{trip.arrivedAt ? <p className="fleet-arrived" role="status">Arrived at {trip.destination} · {myt(trip.arrivedAt)}</p> : <div className="fleet-form fleet-arrive"><p>Reached <strong>{trip.destination}</strong>? Let HR know you have arrived.</p><button className="button button-secondary" disabled={busy} onClick={() => void actWith({ pending: "Recording your arrival", done: "Arrival recorded", detail: `HR can see you reached ${trip.destination}.`, plate: car.plate }, async () => { const location = trip.locationConsent ? await currentLocation() : null; const saved = await workflowRequest<VehicleTrip>(`/vehicle-trips/${trip.id}/arrive`, { ...identity, location }); openTrip(saved); setMessage("Arrival recorded. Open your trip link when you are back to key in the return."); })}>I've arrived</button></div>}<CompleteTripForm key={trip.id} draftKey={`return:${trip.id}`} vehicle={car} trip={trip} onSubmit={input => actionSheet.run({ pending: "Recording your return", done: "Car returned", detail: "Hand the key back to HR.", plate: car.plate }, async () => { const location = trip.locationConsent ? await currentLocation() : null; await workflowRequest<VehicleTrip>(`/vehicle-trips/${trip.id}/return`, { ...input, ...identity, location }); closeTrip(trip.id); setMessage("Car returned. Please return the key to the custodian."); setMode("return"); await load(); })}/></>}</section> : tab === "trip" ? <section className="card fleet-form fleet-empty"><h2>No trip yet</h2><p>When you book a car, your trip shows here: check-in, departure and return.</p><button type="button" className="button button-primary" onClick={() => showTab("book")}>Book a car</button></section> : tab !== "book" ? null : trip ? <section className="card fleet-form fleet-empty"><h2>You already have a trip</h2><p>Finish or cancel your trip on <strong>{trip.vehicle?.plate ?? "your car"}</strong> before booking another car.</p><button type="button" className="button button-primary" onClick={() => showTab("trip")}>Open my trip</button></section> : <form className="card fleet-form fleet-booking" onSubmit={event => { event.preventDefault(); if ("error" in windowRequest) return; void actWith({ pending: when.mode === "now" ? "Reserving your car" : "Booking your car", done: when.mode === "now" ? "Car reserved" : "Car booked", detail: when.mode === "now" ? "Collect the key at the HR table." : "Check in at the HR table on the day.", plate: car?.plate }, async () => { const saved = await workflowRequest<VehicleReservation>("/vehicle-trips/reserve", { ...identity, vehicleId: carId, destination, purpose, startAt: windowRequest.startAt, expectedReturnAt: windowRequest.endAt }); const { linkDelivery: delivery, ...reserved } = saved; setLinkDelivery(delivery); openTrip(reserved); setMessage(reserved.status === "BOOKED" ? "Car booked. Save your trip link and use it on the day to check in." : "Car reserved. Save your trip link, then show the confirmation below to collect your key."); await load(); }); }}><h2>Book a car</h2><section className="fleet-book-section" aria-labelledby="book-when"><h3 className="fleet-book-step" id="book-when" data-done={stepDone[0]}>{stepBadge(0)}When do you need it?</h3><BookingWindowPicker value={when} onChange={setWhen}/></section><section className="fleet-book-section" aria-labelledby="book-car"><h3 className="fleet-book-step" id="book-car" data-done={stepDone[1]}>{stepBadge(1)}Pick a car</h3>{availabilityError ? <p className="form-error">{availabilityError}</p> : availability === null ? <p role="status">{"error" in windowRequest ? "Choose a valid time to see free cars." : "Checking which cars are free…"}</p> : availableCars.length ? <FleetCarPicker vehicles={availableCars} value={carId} onChange={setCarId} labelledBy="book-car"/> : <p role="status">No car is free for this time. Try another time.</p>}{busyCars.length > 0 && <details className="fleet-busy-cars"><summary>{busyCars.length} not available for this time</summary><ul>{busyCars.map(busyCar => <li key={busyCar.id}><strong>{busyCar.plate}</strong>: {busyCar.reason}</li>)}</ul></details>}</section>{pickedCar && <section className="fleet-book-section" aria-labelledby="book-trip"><h3 className="fleet-book-step" id="book-trip" data-done={stepDone[2]}>{stepBadge(2)}Where are you going?</h3><label className="field">Destination<input required minLength={2} autoComplete="off" placeholder="e.g. Sendayan" value={destination} onChange={e => setDestination(e.target.value)}/></label><label className="field">Purpose<input required minLength={2} autoComplete="off" placeholder="e.g. Supplier meeting" value={purpose} onChange={e => setPurpose(e.target.value)}/></label></section>}{pickedCar && !("error" in windowRequest) && <section className="fleet-book-summary" aria-label="Your booking"><h3>Your booking</h3><dl><div><dt>Car</dt><dd><span className="fleet-plate">{pickedCar.plate}</span> {pickedCar.model}</dd></div><div><dt>Pick up</dt><dd>{windowRequest.startAt ? myt(windowRequest.startAt) : "Now, at the HR table"}</dd></div><div><dt>Return by</dt><dd>{myt(windowRequest.endAt)}</dd></div><div><dt>Going to</dt><dd>{destination.trim() || "Not filled in yet"}</dd></div></dl></section>}<button className="button button-primary" disabled={busy || "error" in windowRequest || !availableCars.some(vehicle => vehicle.id === carId)}>{!pickedCar ? "Pick a car to continue" : when.mode === "now" ? `Reserve ${pickedCar.plate}` : `Book ${pickedCar.plate}`}</button></form>}
 </>}</div></div>{identified && !resuming && <nav className="fleet-tabbar" aria-label="Company car sections" data-hidden={typing}>
        {([["book", "Book", CalendarPlus], ["trip", "My trip", CarFront], ["me", "Me", UserRound]] as const).map(([key, label, Icon]) => <button key={key} type="button" aria-current={tab === key ? "page" : undefined} onClick={() => showTab(key)}>
            <span className="fleet-tab-icon"><Icon size={22} aria-hidden="true"/>{key === "trip" && trip && <i className="fleet-tab-dot" aria-label="Open trip"/>}</span>{label}
        </button>)}
    </nav>}<FleetActionSheet sheet={actionSheet.sheet} onClose={actionSheet.close}/></main>;
}
