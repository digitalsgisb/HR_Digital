import { TrainingDeleteButton } from "./TrainingDeleteButton";
import { useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, FileSpreadsheet, MapPin, Plus, UserRound } from "lucide-react";
import type { CalendarSession } from "./portal-data";
import { calendarDays, malaysiaDate, monthTitle, shiftMonth } from "./calendar-utils";

const longDate = (value: string) => new Intl.DateTimeFormat("en-MY", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));

export function TrainingCalendar({ sessions, selectedDate, setSelectedDate, navigate, onDelete }: {
  onDelete: (id: string) => Promise<void>;
  sessions: CalendarSession[]; selectedDate: string; setSelectedDate: (value: string) => void; navigate: (view: "training-planner") => void;
}) {
  const [month, setMonth] = useState(selectedDate.slice(0, 7));
  const [mode, setMode] = useState<"month" | "agenda">("month");
  const today = malaysiaDate();
  const year = Number(month.slice(0, 4));
  const currentYear = Number(today.slice(0, 4));
  const firstYear = Math.min(currentYear - 50, year);
  const lastYear = Math.max(currentYear + 20, year);
  const years = Array.from({ length: lastYear - firstYear + 1 }, (_, index) => firstYear + index);
  const monthSessions = sessions.filter((session) => session.date.startsWith(month)).sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
  const selectedSessions = sessions.filter((session) => session.date === selectedDate);
  const changeMonth = (value: string) => { if (!/^\d{4}-\d{2}$/.test(value)) return; setMonth(value); setSelectedDate(`${value}-01`); };
  const selectDate = (value: string) => { setSelectedDate(value); setMonth(value.slice(0, 7)); };
  const exportMonth = () => {
    const cell = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;
    const lines = [["Date", "Training", "Start", "End", "Trainer", "Venue", "Participants"], ...monthSessions.map((session) => [session.date, session.title, session.time, session.endTime, session.trainer, session.venue, session.attendees.length])];
    const url = URL.createObjectURL(new Blob(["\uFEFF" + lines.map((row) => row.map(cell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = `training-${month}.csv`; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <section className="page-stack"><div className="page-toolbar"><div className="segmented"><button className={mode === "month" ? "active" : ""} onClick={() => setMode("month")}>Month</button><button className={mode === "agenda" ? "active" : ""} onClick={() => setMode("agenda")}>Agenda</button></div><div className="toolbar-actions"><button className="button button-secondary" onClick={exportMonth}><FileSpreadsheet size={16} />Export</button><button className="button button-primary" onClick={() => navigate("training-planner")}><Plus size={16} />Plan training</button></div></div>
    <div className="calendar-layout"><section className="card calendar-card"><div className="calendar-toolbar"><div><button aria-label="Previous month" onClick={() => changeMonth(shiftMonth(month, -1))}><ChevronLeft size={18} /></button><button aria-label="Next month" onClick={() => changeMonth(shiftMonth(month, 1))}><ChevronRight size={18} /></button><button onClick={() => selectDate(today)}>Today</button></div><div className="calendar-month-picker"><select aria-label="Choose month" value={month.slice(5, 7)} onChange={(event) => changeMonth(`${year}-${event.target.value}`)}>{Array.from({length:12}, (_, index) => <option key={index} value={String(index + 1).padStart(2, "0")}>{new Intl.DateTimeFormat("en", {month:"long",timeZone:"UTC"}).format(new Date(Date.UTC(2026,index,1)))}</option>)}</select><select aria-label="Choose year" value={year} onChange={(event) => changeMonth(`${event.target.value}-${month.slice(5, 7)}`)}>{years.map((value) => <option key={value} value={value}>{value}</option>)}</select></div><span>{monthSessions.length} sessions · {monthSessions.reduce((sum, session) => sum + session.attendees.length, 0)} participants</span></div>
      <h2 className="visually-hidden">{monthTitle(month)}</h2>
      {mode === "month" ? <><div className="calendar-weekdays">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => <span key={day}>{day}</span>)}</div><div className="calendar-grid">{calendarDays(month).map((item) => <button key={item.date} aria-label={longDate(item.date)} aria-pressed={selectedDate === item.date} className={`calendar-day ${item.muted ? "muted" : ""} ${selectedDate === item.date ? "selected" : ""} ${today === item.date ? "today" : ""}`} onClick={() => selectDate(item.date)}><span>{item.day}</span><div>{sessions.filter((session) => session.date === item.date).map((session) => <em key={session.id} className={session.category.toLowerCase()}>{session.time} {session.title}</em>)}</div></button>)}</div></> : <div className="calendar-agenda">{monthSessions.length ? monthSessions.map((session) => <button key={session.id} onClick={() => selectDate(session.date)}><strong>{longDate(session.date)}</strong><span>{session.time} · {session.title}</span><small>{session.attendees.length} participants · {session.venue || "Venue not recorded"}</small></button>) : <p>No training scheduled in {monthTitle(month)}.</p>}</div>}
      {mode === "month" && monthSessions.length === 0 && <p className="calendar-empty-month">No training scheduled in {monthTitle(month)}.</p>}
    </section><aside className="card day-panel"><div className="day-panel-date"><span>{Number(selectedDate.slice(-2))}</span><div><strong>{longDate(selectedDate).split(",")[0]}</strong><small>{longDate(selectedDate).split(",").slice(1).join(",")}</small></div></div>
      {selectedSessions.length ? selectedSessions.map((session) => <div className="day-session" key={session.id}><span className={`status-badge ${session.status.toLowerCase().replaceAll(" ", "-")}`}>{session.status}</span><h3>{session.title}</h3><p>{session.code} · {session.category}</p><TrainingDeleteButton session={session} onDelete={onDelete} /><dl><div><dt><Clock3 size={15} />Time</dt><dd>{session.time}–{session.endTime || "—"}</dd></div><div><dt><MapPin size={15} />Venue</dt><dd>{session.venue || "Not recorded"}</dd></div><div><dt><UserRound size={15} />Trainer</dt><dd>{session.trainer || "Not assigned"}</dd></div></dl><div className="attendee-heading"><strong>Participants</strong><span>{session.attendees.length}{session.capacity ? `/${session.capacity}` : ""}</span></div><div className="attendee-list">{session.attendees.map((person) => <div key={person.id}><span className="avatar">{person.name.split(" ").map((part) => part[0]).slice(0, 2).join("")}</span><span><strong>{person.name}</strong><small>{person.department}</small></span><i>{person.status}</i></div>)}</div></div>) : <div className="empty-day"><CalendarDays size={28} /><strong>No training planned</strong><p>Choose another date or plan training for this day.</p><button onClick={() => navigate("training-planner")}>Plan training</button></div>}
    </aside></div>
  </section>;
}
