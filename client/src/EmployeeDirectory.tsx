import { useState } from "react";
import { ChevronDown, MailCheck, UserRound, UsersRound } from "lucide-react";
import type { Employee } from "./types";

export function EmployeeDirectory({ employees, query, onOpen }: {
  employees: Employee[]; query: string; onOpen: (employee: Employee) => void;
}) {
  const [department, setDepartment] = useState("");
  const [emailFilter, setEmailFilter] = useState("all");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [limits, setLimits] = useState<Record<string, number>>({});
  const departments = [...new Set(employees.map((person) => person.department.name))].sort((a, b) => a.localeCompare(b));
  const visible = employees.filter((person) => (!department || person.department.name === department) &&
    (emailFilter === "all" || (emailFilter === "with" ? !!person.email : !person.email)) &&
    `${person.name ?? ""} ${person.employeeId} ${person.department.name} ${person.role ?? ""} ${person.email ?? ""} ${person.base ?? ""} ${person.status}`.toLowerCase().includes(query.toLowerCase()));
  const shownDepartments = departments.filter((name) => visible.some((person) => person.department.name === name));
  const filtering = !!query.trim() || !!department || emailFilter !== "all";
  return <section className="employee-directory" aria-label="Employees by department">
    <div className="directory-filters">
      <label>Department<select aria-label="Department" value={department} onChange={(event) => setDepartment(event.target.value)}><option value="">All departments</option>{departments.map((name) => <option key={name}>{name}</option>)}</select></label>
      <label>Email<select aria-label="Email availability" value={emailFilter} onChange={(event) => setEmailFilter(event.target.value)}><option value="all">All employees</option><option value="with">With email</option><option value="without">Without email</option></select></label>
      <span>{visible.length} employees · {shownDepartments.length} departments</span>
    </div>
    {visible.length === 0 && <div className="card directory-empty">No employees match these filters.</div>}
    <div className="department-groups">{shownDepartments.map((name) => {
      const members = visible.filter((person) => person.department.name === name).sort((a, b) => (a.name || a.employeeId).localeCompare(b.name || b.employeeId));
      const withEmail = members.filter((person) => person.email).length;
      const open = expanded[name] ?? filtering;
      const limit = limits[name] ?? 12;
      return <section className={`department-group ${open ? "is-open" : ""}`} key={name}>
        <button className="department-heading" aria-expanded={open} onClick={() => setExpanded((current) => ({ ...current, [name]: !open }))}>
          <span className="department-icon"><UsersRound size={22} /></span><span><strong>{name}</strong><small>{members.length} employees · {withEmail} with email · {members.length - withEmail} without email</small></span><ChevronDown size={18} />
        </button>
        {open && <div className="department-body"><div className="employee-card-grid">{members.slice(0, limit).map((person) => <button className="employee-card" key={person.id} onClick={() => onOpen(person)}>
          <span className="employee-card-avatar"><UserRound size={22} /></span>
          <span className="employee-card-identity"><strong>{person.name || "Name not recorded"}</strong><small>{person.employeeId}</small></span>
          <span className={`employment-status ${person.status.toLowerCase().replaceAll("_", "-")}`}>{person.status.toLowerCase().replaceAll("_", " ")}</span>
          <span className="employee-card-role">{person.role || "Role not recorded"}{person.base ? ` · ${person.base}` : ""}</span>
          <span className={`employee-card-email ${person.email ? "" : "missing"}`}><MailCheck size={15} />{person.email || "No email address"}</span>
          <span className="employee-card-action">View profile →</span>
        </button>)}</div>
          {members.length > limit && <button className="button button-secondary department-more" onClick={() => setLimits((current) => ({ ...current, [name]: limit + 12 }))}>Show {Math.min(12, members.length - limit)} more ({members.length - limit} remaining)</button>}
        </div>}
      </section>;
    })}</div>
  </section>;
}
