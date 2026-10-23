import { useOrganizationFilter, organizationLabel } from "./OrganizationFilters";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { ChevronDown, ChevronLeft, ChevronRight, MailCheck, UserRound, UsersRound } from "lucide-react";
import type { Employee } from "./types";

const pageSize = 12;
type AnimateChange = (update: () => void) => void;

function DepartmentEmployees({ name, members, open, transitionName, onOpen, animateChange }: {
  name: string; members: Employee[]; open: boolean; transitionName: string;
  onOpen: (employee: Employee) => void; animateChange: AnimateChange;
}) {
  const [requestedPage, setPage] = useState(0);
  const gridRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState({ width: 0, height: 0 });
  const pageCount = Math.ceil(members.length / pageSize);
  const page = Math.min(requestedPage, Math.max(0, pageCount - 1));
  const start = page * pageSize;

  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid || !open) return;
    const measure = () => {
      const { width, height } = grid.getBoundingClientRect();
      setLayout((previous) => {
        const nextHeight = Math.abs(previous.width - width) > 1 ? height : Math.max(previous.height, height);
        return previous.width === width && previous.height === nextHeight ? previous : { width, height: nextHeight };
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(grid);
    return () => observer.disconnect();
  }, [open, page, members.length]);

  return <div className="department-expansion" inert={!open} aria-hidden={!open}>
    <div className="department-expansion-inner"><div className="department-body">
      <div className="department-page-viewport" style={{ minHeight: pageCount > 1 ? layout.height : undefined }}>
        <div className="employee-card-grid department-page-grid" key={page} ref={gridRef} style={{ viewTransitionName: open ? transitionName : "none" }}>
          {members.slice(start, start + pageSize).map((person) => <button className="employee-card" key={person.id} onClick={() => onOpen(person)}>
            <span className="employee-card-avatar"><UserRound size={22} /></span>
            <span className="employee-card-identity"><strong>{person.name || "Name not recorded"}</strong><small>{person.employeeId}</small></span>
            <span className={`employment-status ${person.status.toLowerCase().replaceAll("_", "-")}`}>{person.status.toLowerCase().replaceAll("_", " ")}</span>
            <span className="employee-card-role">{[person.role || "Role not recorded", organizationLabel(person)].filter(Boolean).join(" · ")}{person.base ? ` · ${person.base}` : ""}</span>
            <span className={`employee-card-email ${person.email ? "" : "missing"}`}><MailCheck size={15} />{person.email || "No email address"}</span>
            <span className="employee-card-action">View profile →</span>
          </button>)}
        </div>
      </div>
      {pageCount > 1 && <nav className="department-pagination" aria-label={`${name} employee pages`}>
        <span aria-live="polite">{start + 1}–{Math.min(start + pageSize, members.length)} of {members.length} employees · Page {page + 1} of {pageCount}</span>
        <div><button className="button button-secondary" disabled={page === 0} aria-label={`Previous employee page in ${name}`} onClick={() => animateChange(() => setPage(page - 1))}><ChevronLeft size={16} />Previous</button>
          <button className="button button-secondary" disabled={page === pageCount - 1} aria-label={`Next employee page in ${name}`} onClick={() => animateChange(() => setPage(page + 1))}>Next<ChevronRight size={16} /></button></div>
      </nav>}
    </div></div>
  </div>;
}

export function EmployeeDirectory({ employees, query, onOpen, initialEmailFilter = "all", initialStatus = "all" }: {
  employees: Employee[]; query: string; onOpen: (employee: Employee) => void;
  initialEmailFilter?: string; initialStatus?: string;
}) {
  const [department, setDepartment] = useState("");
  const [emailFilter, setEmailFilter] = useState(initialEmailFilter);
  const [statusFilter, setStatusFilter] = useState(initialStatus);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const transitionRef = useRef<ViewTransition | null>(null);
  useEffect(() => () => {
    transitionRef.current?.skipTransition();
    delete document.documentElement.dataset.departmentTransition;
  }, []);
  const animateChange: AnimateChange = (update) => {
    transitionRef.current?.skipTransition();
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || typeof document.startViewTransition !== "function") {
      update(); return;
    }
    document.documentElement.dataset.departmentTransition = "true";
    const transition = document.startViewTransition(() => flushSync(update));
    transitionRef.current = transition;
    // A rapid second click can skip the previous transition; never queue animations.
    void transition.ready.catch(() => {});
    void transition.finished.finally(() => {
      if (transitionRef.current === transition) {
        transitionRef.current = null;
        delete document.documentElement.dataset.departmentTransition;
      }
    }).catch(() => {});
  };
  const organization = useOrganizationFilter(employees.filter(person => !department || person.department.name === department));
  const departments = [...new Set(employees.map((person) => person.department.name))].sort((a, b) => a.localeCompare(b));
  const visible = employees.filter((person) => organization.matches(person) && (!department || person.department.name === department) &&
    (statusFilter === "all" || person.status === statusFilter) &&
    (emailFilter === "all" || (emailFilter === "with" ? !!person.email : !person.email)) &&
    `${person.name ?? ""} ${person.employeeId} ${person.department.name} ${person.role ?? ""} ${person.email ?? ""} ${person.base ?? ""} ${person.status} ${organizationLabel(person)}`.toLowerCase().includes(query.toLowerCase()));
  const shownDepartments = departments.filter((name) => visible.some((person) => person.department.name === name));
  const filtering = organization.active || !!query.trim() || !!department || emailFilter !== "all" || statusFilter !== "all";
  return <section className="employee-directory" aria-label="Employees by department">
    <div className="directory-filters">
      <label>Department<select aria-label="Department" value={department} onChange={(event) => { setDepartment(event.target.value); organization.reset(); }}><option value="">All departments</option>{departments.map((name) => <option key={name}>{name}</option>)}</select></label>
      {organization.controls}<label>Email<select aria-label="Email availability" value={emailFilter} onChange={(event) => setEmailFilter(event.target.value)}><option value="all">All employees</option><option value="with">With email</option><option value="without">Without email</option></select></label>
      <label>Employment<select aria-label="Employment status filter" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All statuses</option><option value="ACTIVE">Active</option><option value="ON_LEAVE">On leave</option><option value="INACTIVE">Inactive</option><option value="RESIGNED">Resigned</option><option value="TERMINATED">Terminated</option></select></label>
      <span>{visible.length} employees · {shownDepartments.length} departments</span>
    </div>
    {visible.length === 0 && <div className="card directory-empty">No employees match these filters.</div>}
    <div className="department-groups">{shownDepartments.map((name, index) => {
      const members = visible.filter((person) => person.department.name === name).sort((a, b) => (a.name || a.employeeId).localeCompare(b.name || b.employeeId));
      const withEmail = members.filter((person) => person.email).length;
      const open = expanded[name] ?? filtering;
      return <section className={`department-group ${open ? "is-open" : ""}`} key={name} style={{ viewTransitionName: `department-${index}` }}>
        <button className="department-heading" aria-expanded={open} aria-controls={`department-content-${index}`} onClick={() => animateChange(() => setExpanded((current) => ({ ...current, [name]: !open })))}>
          <span className="department-icon"><UsersRound size={22} /></span><span><strong>{name}</strong><small>{members.length} employees · {withEmail} with email · {members.length - withEmail} without email</small></span><ChevronDown size={18} />
        </button>
        <div id={`department-content-${index}`}><DepartmentEmployees key={JSON.stringify([name, query, department, emailFilter, statusFilter, members.map(person => person.id)])} name={name} members={members} open={open} transitionName={`department-employees-${index}`} onOpen={onOpen} animateChange={animateChange} /></div>
      </section>;
    })}</div>
  </section>;
}
