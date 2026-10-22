import { useEffect, useState } from "react";
import { api, type VehicleDriver } from "./api";

export type TripDriver = { name: string; reference: string };

export function VehicleDriverPicker({ onChange }: { onChange: (driver: TripDriver | null) => void }) {
  const [drivers, setDrivers] = useState<VehicleDriver[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [kind, setKind] = useState("employee");
  const [department, setDepartment] = useState("");
  const [position, setPosition] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [guestName, setGuestName] = useState("");
  const [company, setCompany] = useState("");
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError("");
    api.getVehicleDrivers().then((rows) => { if (!cancelled) setDrivers(rows); })
      .catch(() => { if (!cancelled) setError("Employee names could not be loaded. Check the connection and retry."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [attempt]);
  const positionOf = (driver: VehicleDriver) => driver.role?.trim() || "Position not recorded";
  const departments = [...new Map(drivers.map((driver) => [driver.department.id, driver.department])).values()].sort((a, b) => a.name.localeCompare(b.name));
  const inDepartment = drivers.filter((driver) => driver.department.id === department);
  const positions = [...new Set(inDepartment.map(positionOf))].sort((a, b) => a.localeCompare(b));
  const names = inDepartment.filter((driver) => positionOf(driver) === position).sort((a, b) => (a.name || a.employeeId).localeCompare(b.name || b.employeeId));
  return <fieldset className="vehicle-driver-picker">
    <legend>Who is driving?</legend>
    <div className="form-grid">
      <label className="field"><span>Driver type</span><select value={kind} onChange={(event) => {
        const next = event.target.value; setKind(next); setEmployeeId("");
        onChange(next === "guest" && guestName.trim().length >= 2 ? { name: guestName.trim(), reference: company.trim() ? `GUEST · ${company.trim()}` : "GUEST" } : null);
      }}><option value="employee">Employee</option><option value="guest">Guest / external driver</option></select></label>
      {kind === "employee" ? <>
        <label className="field"><span>1. Department</span><select value={department} required disabled={loading || Boolean(error)} onChange={(event) => { setDepartment(event.target.value); setPosition(""); setEmployeeId(""); onChange(null); }}>
          <option value="">{loading ? "Loading departments…" : "Choose department"}</option>
          {departments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select></label>
        <label className="field"><span>2. Position</span><select value={position} required disabled={!department || loading || Boolean(error)} onChange={(event) => { setPosition(event.target.value); setEmployeeId(""); onChange(null); }}>
          <option value="">Choose position</option>{positions.map((item) => <option key={item} value={item}>{item}</option>)}
        </select></label>
        <label className="field"><span>3. Driver name</span><select value={employeeId} required disabled={!position || loading || Boolean(error)} onChange={(event) => {
          setEmployeeId(event.target.value); const driver = names.find((item) => item.id === event.target.value);
          onChange(driver ? { name: driver.name || driver.employeeId, reference: driver.employeeId } : null);
        }}><option value="">Choose driver</option>{names.map((driver) => <option key={driver.id} value={driver.id}>{driver.name || driver.employeeId} · {driver.employeeId}</option>)}</select></label>
        {error && <div className="form-error span-all" role="alert">{error}<button type="button" onClick={() => setAttempt((value) => value + 1)}>Retry</button></div>}
        {!loading && !error && !drivers.length && <p className="field-help span-all" role="status">No active employees found. Add employees to the directory or choose guest for an external driver.</p>}
      </> : <>
        <label className="field"><span>Guest full name</span><input value={guestName} minLength={2} required autoComplete="name" placeholder="Enter your full name" onChange={(event) => {
          setGuestName(event.target.value); onChange(event.target.value.trim().length >= 2 ? { name: event.target.value.trim(), reference: company.trim() ? `GUEST · ${company.trim()}` : "GUEST" } : null);
        }} /></label>
        <label className="field"><span>Company (optional)</span><input value={company} autoComplete="organization" onChange={(event) => { setCompany(event.target.value); onChange(guestName.trim().length >= 2 ? { name: guestName.trim(), reference: event.target.value.trim() ? `GUEST · ${event.target.value.trim()}` : "GUEST" } : null); }} /></label>
      </>}
    </div>
  </fieldset>;
}
