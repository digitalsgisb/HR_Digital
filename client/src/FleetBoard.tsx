import { useCallback, useEffect, useRef, useState } from "react";
import { CarFront, Expand, MapPin, Minimize, RefreshCw, Wrench } from "lucide-react";
import type { FleetBoard as FleetBoardData, FleetBoardCar, FleetBoardTrip } from "@hr-training/shared";
import { api } from "./api";
import { estimatePosition, formatDuration, phaseLabel } from "./fleet-board-position";

const REFRESH_MS = 30000;
const TICK_MS = 15000;
const time = (iso: string | null | undefined) => iso ? new Date(iso).toLocaleTimeString("en-MY", { timeZone: "Asia/Kuala_Lumpur", hour: "numeric", minute: "2-digit" }) : "—";
const dayTime = (iso: string | null | undefined) => iso ? new Date(iso).toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "—";
const sameDay = (a: string, now: number) => new Date(a).toLocaleDateString("en-MY", { timeZone: "Asia/Kuala_Lumpur" }) === new Date(now).toLocaleDateString("en-MY", { timeZone: "Asia/Kuala_Lumpur" });
const pingLabel = { DEPART: "Departed", ARRIVE: "Arrived", RETURN: "Returned" } as const;

type CarState = "in-use" | "overdue" | "collecting" | "booked" | "available" | "service";
function carState(car: FleetBoardCar, now: number): CarState {
  if (car.current) {
    if (car.current.status === "AWAITING_DEPARTURE") return "collecting";
    return estimatePosition(car.current, now).phase === "overdue" ? "overdue" : "in-use";
  }
  if (car.status === "SERVICE_DUE" || car.status === "OUT_OF_SERVICE") return "service";
  if (car.next && sameDay(car.next.bookedFrom ?? car.next.startedAt, now)) return "booked";
  return "available";
}
const stateLabel: Record<CarState, string> = { "in-use": "In use", overdue: "Overdue", collecting: "Collecting key", booked: "Booked today", available: "Available", service: "Service" };

function LastPin({ trip }: { trip: FleetBoardTrip }) {
  if (!trip.lastPing) return <small className="board-pin-none">{trip.locationConsent ? "No location shared yet" : "Location not shared"}</small>;
  const { latitude, longitude, kind, recordedAt } = trip.lastPing;
  return <a className="board-pin" href={`https://www.google.com/maps?q=${latitude},${longitude}`} target="_blank" rel="noreferrer"><MapPin size={14} />{pingLabel[kind]} · {time(recordedAt)}</a>;
}

function Track({ car, now, state }: { car: FleetBoardCar; now: number; state: CarState }) {
  const trip = car.current;
  const position = trip ? estimatePosition(trip, now) : null;
  const progress = position?.progress ?? 0;
  const parked = !trip || trip.status !== "IN_PROGRESS";
  return <div className={`board-track board-${state}`}>
    <div className="board-line" aria-hidden="true"><span className="board-line-fill" style={{ width: `${progress * 100}%` }} /></div>
    <span className="board-node board-node-start" aria-hidden="true" />
    <span className="board-node board-node-mid" aria-hidden="true" />
    <span className="board-node board-node-end" aria-hidden="true" />
    <span className={`board-car-icon ${parked ? "is-parked" : ""}`} style={{ left: `${progress * 100}%` }} aria-hidden="true">{state === "service" ? <Wrench size={18} /> : <CarFront size={20} />}</span>
    <div className="board-track-labels">
      <span>HR{trip?.departedAt ? ` · left ${time(trip.departedAt)}` : ""}</span>
      <span className="board-destination">{trip ? trip.destination : state === "booked" && car.next ? car.next.destination : ""}</span>
      <span>HR{trip?.expectedReturnAt ? ` · due ${time(trip.expectedReturnAt)}` : ""}</span>
    </div>
  </div>;
}

function BoardRow({ car, now }: { car: FleetBoardCar; now: number }) {
  const state = carState(car, now);
  const trip = car.current;
  const position = trip ? estimatePosition(trip, now) : null;
  const next = car.next;
  return <article className={`card board-row board-${state}`}>
    <div className="board-car">
      {car.photo ? <img src={car.photo} alt="" /> : <span className="board-car-placeholder"><CarFront size={26} /></span>}
      <div><strong>{car.plate}</strong><small>{car.model}</small><span className={`board-badge board-badge-${state}`}>{stateLabel[state]}</span></div>
    </div>
    <Track car={car} now={now} state={state} />
    <div className="board-detail">
      {trip ? <>
        <strong>{trip.driverName}</strong>
        <small>{trip.driverEmployeeId} · {trip.purpose}</small>
        <span className={position?.phase === "overdue" ? "board-overdue-text" : ""}>{position?.phase === "overdue" ? `Overdue by ${formatDuration(position.overdueMs)}` : phaseLabel[position?.phase ?? "collecting"]}</span>
        {trip.status === "IN_PROGRESS" && <LastPin trip={trip} />}
      </> : state === "service" ? <><strong>{car.status === "OUT_OF_SERVICE" ? "Out of service" : "Service due"}</strong><small>Not available for booking</small></> : <>
        <strong>{state === "booked" ? `Booked ${time(next?.bookedFrom)} – ${time(next?.expectedReturnAt)}` : "Available"}</strong>
        {next ? <small>{state === "booked" ? next.driverName : `Next: ${dayTime(next.bookedFrom)} · ${next.driverName}`}</small> : <small>No upcoming bookings</small>}
      </>}
    </div>
  </article>;
}

/** HR live board: every car, where it probably is now, and what is booked next. */
export function FleetBoard() {
  const [board, setBoard] = useState<FleetBoardData | null>(null);
  const [error, setError] = useState("");
  const [skew, setSkew] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const root = useRef<HTMLElement>(null);
  const latest = useRef(0);
  const load = useCallback(async (signal?: AbortSignal) => {
    // Only the newest request may update the board, so a slow older failure cannot hide fresh data.
    const request = ++latest.current;
    try {
      const data = await api.getFleetBoard(signal);
      if (request !== latest.current) return;
      setBoard(data); setError(""); setSkew(Date.parse(data.now) - Date.now()); setUpdatedAt(Date.now()); setNow(Date.now());
    } catch (cause) { if (!signal?.aborted && request === latest.current) setError(cause instanceof Error ? cause.message : "Could not load the board."); }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    const refresh = window.setInterval(() => { if (!document.hidden) void load(); }, REFRESH_MS);
    const tick = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => { controller.abort(); window.clearInterval(refresh); window.clearInterval(tick); };
  }, [load]);
  useEffect(() => { const sync = () => setFullscreen(document.fullscreenElement === root.current); document.addEventListener("fullscreenchange", sync); return () => document.removeEventListener("fullscreenchange", sync); }, []);
  const toggleFullscreen = () => { if (document.fullscreenElement) void document.exitFullscreen(); else void root.current?.requestFullscreen?.().catch(() => undefined); };
  const serverNow = now + skew;
  const states = (board?.cars ?? []).map(car => carState(car, serverNow));
  const count = (...wanted: CarState[]) => states.filter(state => wanted.includes(state)).length;
  const order: CarState[] = ["overdue", "in-use", "collecting", "booked", "available", "service"];
  const cars = [...(board?.cars ?? [])].sort((a, b) => order.indexOf(carState(a, serverNow)) - order.indexOf(carState(b, serverNow)) || a.plate.localeCompare(b.plate));
  return <section ref={root} className={`page-stack fleet-board ${fullscreen ? "is-fullscreen" : ""}`} aria-label="Live car board">
    <header className="board-header">
      <div><h1>Live board</h1><p>Updated {updatedAt ? new Date(updatedAt).toLocaleTimeString("en-MY", { hour: "numeric", minute: "2-digit", second: "2-digit" }) : "—"} · refreshes every 30 seconds</p></div>
      <div className="board-counts">
        <span className="board-count board-badge-in-use">{count("in-use", "collecting")} in use</span>
        <span className="board-count board-badge-overdue">{count("overdue")} overdue</span>
        <span className="board-count board-badge-booked">{count("booked")} booked today</span>
        <span className="board-count board-badge-available">{count("available")} available</span>
        <span className="board-count board-badge-service">{count("service")} service</span>
      </div>
      <div className="toolbar-actions"><button className="button button-secondary" onClick={() => void load()}><RefreshCw size={16} /> Refresh</button><button className="button button-secondary" onClick={toggleFullscreen}>{fullscreen ? <><Minimize size={16} /> Exit full screen</> : <><Expand size={16} /> Full screen</>}</button></div>
    </header>
    <p className="board-legend">Car positions are <strong>estimated</strong> from departure and expected return times; this is not live tracking. A pin shows where the driver's phone was when they tapped Depart, I've arrived or Return, if they agreed to share it.</p>
    {error && <p className="form-error" role="alert">{error}</p>}
    {!board ? <p className="card current-usage-empty">Loading the board…</p> : !cars.length ? <p className="card current-usage-empty">No cars in the fleet yet.</p> :
      <div className="board-rows">{cars.map(car => <BoardRow key={car.id} car={car} now={serverNow} />)}</div>}
  </section>;
}
