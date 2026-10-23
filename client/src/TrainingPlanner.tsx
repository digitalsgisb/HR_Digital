import { useOrganizationFilter, organizationLabel } from "./OrganizationFilters";
import { useEffect, useState, type FormEvent } from "react";
import { CalendarCheck2, CircleAlert, Search } from "lucide-react";
import { api } from "./api";
import { malaysiaDate } from "./calendar-utils";
import { toCalendarSession } from "./training-data";
import type { Employee } from "./types";
import type { CalendarSession } from "./portal-data";

export function TrainingPlanner({ onCreate, initialDate }: { onCreate: (session: CalendarSession, message: string) => void; initialDate?: string }) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [title, setTitle] = useState(""); const [date, setDate] = useState(initialDate || malaysiaDate());
  const [time, setTime] = useState("09:00"); const [endTime, setEndTime] = useState("12:00");
  const [trainer, setTrainer] = useState(""); const [venue, setVenue] = useState("");
  const [category, setCategory] = useState("Safety"); const [capacity, setCapacity] = useState(20);
  const [deliveryMethod, setDeliveryMethod] = useState("Internal training / OJT");
  const [notifyParticipants, setNotifyParticipants] = useState(true);
  const [selected, setSelected] = useState<string[]>([]); const [query, setQuery] = useState("");
  const [department, setDepartment] = useState(""); const [busy, setBusy] = useState(false);
  const [error, setError] = useState(""); const [loading, setLoading] = useState(true);
  useEffect(() => { let active = true; api.getEmployees().then((people) => { if (active) setEmployees(people.filter((person) => person.status === "ACTIVE")); }).catch(() => { if (active) setError("The employee list could not be loaded. Check the server connection and reopen this page."); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, []);
  const organization = useOrganizationFilter(employees.filter(person => !department || person.department.name === department));
  const departments = [...new Set(employees.map((person) => person.department.name))].sort();
  const visible = employees.filter((person) => organization.matches(person) && (!department || person.department.name === department) && `${person.name || ""} ${person.employeeId} ${person.department.name} ${organizationLabel(person)}`.toLowerCase().includes(query.toLowerCase()));
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError("");
    if (endTime <= time) { setError("End time must be after start time."); return; }
    if (!selected.length) { setError("Choose at least one participant."); return; }
    if (capacity < selected.length) { setError("Increase capacity or select fewer participants."); return; }
    setBusy(true);
    try {
      const session = await api.createTrainingPlan({ title, category, dateStart: new Date(`${date}T${time}:00+08:00`).toISOString(), dateEnd: new Date(`${date}T${endTime}:00+08:00`).toISOString(), trainerName: trainer, venue, capacity, deliveryMethod, participantEmployeeIds: selected, notifyParticipants });
      const delivery = session.emailDelivery;
      const summary = !notifyParticipants ? "Participant emails are turned off." : delivery?.historical ? "Historical training saved without scheduling emails." : delivery?.queued ? `${delivery.recipients} participant${delivery.recipients === 1 ? " has" : "s have"} emails queued.${delivery.enabled ? "" : " Delivery is waiting for SMTP configuration."}` : "No participant email addresses are available.";
      onCreate(toCalendarSession(session), `${session.course.name} saved. ${summary}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The training plan could not be saved."); }
    finally { setBusy(false); }
  };
  return <form className="planner-layout" onSubmit={submit}><div className="planner-main"><section className="card form-card"><h2>Training details</h2><div className="form-grid">
    <label className="field span-2"><span>Training title</span><input value={title} onChange={(event) => setTitle(event.target.value)} required /></label>
    <label className="field"><span>Category</span><select value={category} onChange={(event) => setCategory(event.target.value)}>{["Compliance", "Safety", "System", "Development"].map((value) => <option key={value}>{value}</option>)}</select></label>
    <label className="field"><span>Delivery method</span><select value={deliveryMethod} onChange={(event) => setDeliveryMethod(event.target.value)}>{["Internal training / OJT", "Instructor-led", "Online", "On-the-job", "External provider"].map((value) => <option key={value}>{value}</option>)}</select></label>
    <label className="field"><span>Date</span><input type="date" value={date} onChange={(event) => setDate(event.target.value)} required /></label>
    <label className="field"><span>Start time</span><input type="time" value={time} onChange={(event) => setTime(event.target.value)} required /></label>
    <label className="field"><span>End time</span><input type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} required /></label>
    <label className="field"><span>Capacity</span><input type="number" min="1" max="5000" value={capacity} onChange={(event) => setCapacity(Number(event.target.value))} required /></label>
    <label className="field"><span>Trainer</span><input value={trainer} onChange={(event) => setTrainer(event.target.value)} required /></label>
    <label className="field"><span>Venue / meeting link</span><input value={venue} onChange={(event) => setVenue(event.target.value)} required /></label>
  </div></section><section className="card form-card"><h2>Select participants</h2><div className="participant-tools"><label className="compact-search"><Search size={16} /><input aria-label="Search participants" placeholder="Search employee or department" value={query} onChange={(event) => setQuery(event.target.value)} /></label><select aria-label="Participant department" value={department} onChange={(event) => { setDepartment(event.target.value); organization.reset(); }}><option value="">All departments</option>{departments.map((name) => <option key={name}>{name}</option>)}</select>{organization.controls}<button type="button" className="button button-secondary" disabled={!visible.length} onClick={() => setSelected(current => [...new Set([...current, ...visible.map(person => person.id)])])}>Select all filtered</button></div><div className="participant-picker">
    {visible.map((person) => <label key={person.id} className={selected.includes(person.id) ? "selected" : ""}><input type="checkbox" checked={selected.includes(person.id)} onChange={() => setSelected((current) => current.includes(person.id) ? current.filter((id) => id !== person.id) : [...current, person.id])} /><span className="avatar">{(person.name || person.employeeId).slice(0, 2)}</span><span><strong>{person.name || person.employeeId}</strong><small>{person.employeeId} · {person.department.name} · {organizationLabel(person)}</small></span><em>{person.email ? "Has email" : "No email"}</em></label>)}
  </div>{!visible.length && <p className="training-empty">{loading ? "Loading employees…" : "No active employees match. Import employees or change the filters."}</p>}</section></div><aside className="planner-side"><section className="card plan-summary"><h2>Review plan</h2><div className="summary-hero"><CalendarCheck2 size={24} /><strong>{title || "New training"}</strong><span>{date || "Choose a date"}</span></div><dl><div><dt>Time</dt><dd>{time}–{endTime}</dd></div><div><dt>Trainer</dt><dd>{trainer || "Not assigned"}</dd></div><div><dt>Venue</dt><dd>{venue || "Not assigned"}</dd></div><div><dt>Participants</dt><dd>{selected.length} / {capacity}</dd></div></dl>{ /internal|ojt|on.the.job/i.test(deliveryMethod) && <p className="training-empty"><strong>QR attendance is included.</strong> After saving, open Attendance / QR in the calendar to display or download the code. Trainees check in with employee ID and full name.</p>}<label className="training-email-option"><input type="checkbox" checked={notifyParticipants} onChange={event => setNotifyParticipants(event.target.checked)} /><span>Send participant emails automatically</span></label><p className="training-empty">Invitation after saving · reminder at 8:00 AM Malaysia time (30 minutes before sessions starting earlier) · summary request two hours after training; reminders every three days until submitted. If the reminder time has passed, only the invitation is sent now. Historical plans do not send emails.</p><p className="training-empty">{employees.filter(person => selected.includes(person.id) && !!person.email).length} with email · {employees.filter(person => selected.includes(person.id) && !person.email).length} without email. Participants without email remain included.</p>{error && <p className="form-error" role="alert"><CircleAlert size={16} />{error}</p>}<button className="button button-primary full" disabled={busy || loading} type="submit"><CalendarCheck2 size={17} />{busy ? "Saving…" : "Create training plan"}</button></section></aside></form>;
}
