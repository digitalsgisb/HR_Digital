import { FormEvent, useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Activity, ArrowRight, Bell, BookOpenCheck, CalendarCheck2, CalendarDays, CarFront, Check,
  CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, CircleAlert, ClipboardCheck, Clock3, Download, FileSpreadsheet,
  FileText, Fuel, Gauge, GraduationCap, LayoutDashboard, Library, LockKeyhole, MailCheck, MapPin, Menu,
  MessageSquareText, Pencil, Plus, QrCode, Route, Search, Send, ServerCog, Settings2, ShieldCheck, Trash2, Upload,
  UserCog, UserRound, UsersRound, Wrench, X
} from "lucide-react";
import QRCode from "qrcode";
import { createPortal } from "react-dom";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type {
  DashboardSummary, EmployeeImportPreview, Vehicle, VehicleCondition, VehicleTrip
} from "@hr-training/shared";
import { api, type EmployeeInput, type VehicleInput } from "./api";
import { OdometerPhotoField } from "./OdometerPhotoField";
import { VehiclePhotoField } from "./VehiclePhotoField";
import type { Employee } from "./types";
import {
  departmentReadiness, emailAutomations, employeeTrainingRows, notesLibrary,
  trainingSessions as initialTrainingSessions, vehicleTrips as fallbackVehicleTrips,
  vehicles as fallbackVehicles, type CalendarSession
} from "./portal-data";

type View = "overview" | "employees" | "training-overview" | "training-calendar" |
  "training-planner" | "training-records" | "email-automation" | "notes-library" | "fleet" | "fleet-registry" | "administration";

const viewMeta: Record<View, { title: string; eyebrow: string }> = {
  overview: { title: "Dashboard", eyebrow: "Human Resource Digital" },
  employees: { title: "Employee database", eyebrow: "People" },
  "training-overview": { title: "Training overview", eyebrow: "Learning & development" },
  "training-calendar": { title: "Training calendar", eyebrow: "Learning & development" },
  "training-planner": { title: "Plan training", eyebrow: "Learning & development" },
  "training-records": { title: "Employee training records", eyebrow: "Learning & development" },
  "email-automation": { title: "Email automation", eyebrow: "Learning & development" },
  "notes-library": { title: "Training notes library", eyebrow: "Learning & development" },
  fleet: { title: "Company car usage", eyebrow: "Mobility" },
  "fleet-registry": { title: "Vehicle registry", eyebrow: "Mobility" },
  administration: { title: "Administration", eyebrow: "System controls" }
};

const trainingNav: Array<{ id: View; label: string; icon: LucideIcon }> = [
  { id: "training-overview", label: "Training overview", icon: Activity },
  { id: "training-calendar", label: "Training calendar", icon: CalendarDays },
  { id: "training-planner", label: "Plan training", icon: CalendarCheck2 },
  { id: "training-records", label: "Training records", icon: GraduationCap },
  { id: "email-automation", label: "Email automation", icon: MailCheck },
  { id: "notes-library", label: "Notes library", icon: Library }
];

const fleetNav: Array<{ id: View; label: string; icon: LucideIcon }> = [
  { id: "fleet", label: "Usage tracker", icon: Route },
  { id: "fleet-registry", label: "Vehicle registry", icon: CarFront }
];

const formatLongDate = (value: string) =>
  new Intl.DateTimeFormat("en-MY", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
    .format(new Date(`${value}T08:00:00`));
const formatNumber = (value: number) => new Intl.NumberFormat("en-MY").format(value);

type AdminSettings = {
  organisation: string; site: string; timezone: string;
  emailEnabled: boolean; auditEnabled: boolean; uploadsEnabled: boolean;
};

const defaultAdminSettings: AdminSettings = {
  organisation: "Sugihara Grand Industries Sdn Bhd",
  site: "Port Klang",
  timezone: "Asia/Kuala_Lumpur",
  emailEnabled: true,
  auditEnabled: true,
  uploadsEnabled: true
};

type BrowserNotificationPermission = NotificationPermission | "unsupported";

const notificationFeed = [
  { title: "Training starts today", detail: "GMP Refresher 2026 begins at 9:00 AM.", time: "Now" },
  { title: "Effectiveness forms due", detail: "12 post-training reviews have reached their 3-month checkpoint.", time: "2h" },
  { title: "Vehicle service approaching", detail: "VFY 6620 is due for service in 560 km.", time: "Today" }
];

function getNotificationPermission(): BrowserNotificationPermission {
  return "Notification" in window ? window.Notification.permission : "unsupported";
}

async function showSystemNotification(title: string, body: string) {
  try {
    const options: NotificationOptions = {
      body,
      icon: "/sgi-logo.png",
      badge: "/favicon.svg",
      tag: "hr-digital-notification",
      data: { url: "/" }
    };

    const registration = "serviceWorker" in navigator
      ? await navigator.serviceWorker.getRegistration()
      : undefined;

    if (registration) await registration.showNotification(title, options);
    else new window.Notification(title, options);
    return true;
  } catch (error) {
    console.error("Unable to display system notification", error);
    return false;
  }
}

function loadAdminSettings(): AdminSettings {
  try {
    const saved = window.localStorage.getItem("hr-digital-admin-settings");
    return saved ? { ...defaultAdminSettings, ...JSON.parse(saved) } : defaultAdminSettings;
  } catch {
    return defaultAdminSettings;
  }
}

function App() {
  const initialVehicleId = new URLSearchParams(window.location.search).get("vehicle") ?? undefined;
  const [activeView, setActiveView] = useState<View>(initialVehicleId ? "fleet" : "overview");
  const [trainingOpen, setTrainingOpen] = useState(false);
  const [fleetOpen, setFleetOpen] = useState(Boolean(initialVehicleId));
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [dashboard, setDashboard] = useState<DashboardSummary | null>(null);
  const [calendarSessions, setCalendarSessions] = useState<CalendarSession[]>(initialTrainingSessions);
  const [selectedDate, setSelectedDate] = useState("2026-09-21");
  const [notice, setNotice] = useState("");

  useEffect(() => { api.getDashboard().then(setDashboard); }, []);
  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(""), 3600);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const navigate = (view: View) => {
    setActiveView(view);
    setMobileNavOpen(false);
    if (view.startsWith("training") || view === "email-automation" || view === "notes-library") setTrainingOpen(true);
    if (view === "fleet" || view === "fleet-registry") setFleetOpen(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="app-shell">
      <Sidebar activeView={activeView} trainingOpen={trainingOpen} fleetOpen={fleetOpen} mobileOpen={mobileNavOpen}
        onTrainingToggle={() => setTrainingOpen((open) => !open)} onFleetToggle={() => setFleetOpen((open) => !open)} onNavigate={navigate} onClose={() => setMobileNavOpen(false)} />
      <main className="workspace">
        <Topbar meta={viewMeta[activeView]} onMenu={() => setMobileNavOpen(true)}
          onSettings={() => navigate("administration")} showNotice={setNotice} />
        <div className="page-stage" key={activeView}>
          {activeView === "overview" && <Overview dashboard={dashboard} sessions={calendarSessions} navigate={navigate} />}
          {activeView === "employees" && <EmployeesDatabase showNotice={setNotice} />}
          {activeView === "training-overview" && <TrainingOverview dashboard={dashboard} sessions={calendarSessions} navigate={navigate} />}
          {activeView === "training-calendar" && <TrainingCalendar sessions={calendarSessions} selectedDate={selectedDate} setSelectedDate={setSelectedDate} navigate={navigate} />}
          {activeView === "training-planner" && <TrainingPlanner onCreate={(session) => {
            setCalendarSessions((current) => [...current, session]); setSelectedDate(session.date);
            setNotice(`${session.title} was added to the training calendar.`); navigate("training-calendar");
          }} />}
          {activeView === "training-records" && <TrainingRecords />}
          {activeView === "email-automation" && <EmailAutomation showNotice={setNotice} />}
          {activeView === "notes-library" && <NotesLibrary showNotice={setNotice} />}
          {activeView === "fleet" && <FleetTracker showNotice={setNotice} initialVehicleId={initialVehicleId} onOpenRegistry={() => navigate("fleet-registry")} />}
          {activeView === "fleet-registry" && <VehicleRegistryPage showNotice={setNotice} />}
          {activeView === "administration" && <Administration showNotice={setNotice} />}
        </div>
      </main>
      {notice && <div className="toast" role="status"><CheckCircle2 size={18} /><span>{notice}</span><button onClick={() => setNotice("")} aria-label="Dismiss notification"><X size={16} /></button></div>}
    </div>
  );
}

function Sidebar({ activeView, trainingOpen, fleetOpen, mobileOpen, onTrainingToggle, onFleetToggle, onNavigate, onClose }: {
  activeView: View; trainingOpen: boolean; fleetOpen: boolean; mobileOpen: boolean; onTrainingToggle: () => void; onFleetToggle: () => void;
  onNavigate: (view: View) => void; onClose: () => void;
}) {
  const inTraining = trainingNav.some((item) => item.id === activeView);
  const inFleet = fleetNav.some((item) => item.id === activeView);
  return <>
    {mobileOpen && <button className="nav-backdrop" onClick={onClose} aria-label="Close navigation" />}
    <aside className={`sidebar ${mobileOpen ? "mobile-open" : ""}`}>
      <div className="brand-lockup">
        <img className="company-brand" src="/sgi-logo.png" alt="Sugihara Grand Industries Sdn Bhd" />
        <button className="sidebar-close" onClick={onClose} aria-label="Close navigation"><X size={20} /></button>
      </div>
      <div className="product-name"><strong>Human Resource Digital</strong><span>HR operations workspace</span></div>
      <div className="environment-pill">Internal operations platform</div>
      <nav className="primary-nav" aria-label="Primary navigation">
        <NavButton icon={LayoutDashboard} label="Dashboard" active={activeView === "overview"} onClick={() => onNavigate("overview")} />
        <p className="nav-section-label">People</p>
        <NavButton icon={UsersRound} label="Employee database" active={activeView === "employees"} onClick={() => onNavigate("employees")} />
        <p className="nav-section-label">Services</p>
        <button className={`nav-item nav-parent ${inTraining ? "active-parent" : ""}`} onClick={onTrainingToggle}>
          <span className="nav-icon"><BookOpenCheck size={18} /></span><span>Training</span><ChevronDown className={trainingOpen ? "rotate" : ""} size={16} />
        </button>
        <div className={`nav-children ${trainingOpen ? "open" : ""}`}>
          {trainingNav.map((item) => <button key={item.id} className={`nav-child ${activeView === item.id ? "active" : ""}`} onClick={() => onNavigate(item.id)}>
            <item.icon size={15} /><span>{item.label}</span></button>)}
        </div>
        <button className={`nav-item nav-parent ${inFleet ? "active-parent" : ""}`} onClick={onFleetToggle}>
          <span className="nav-icon"><CarFront size={18} /></span><span>Company car</span><ChevronDown className={fleetOpen ? "rotate" : ""} size={16} />
        </button>
        <div className={`nav-children fleet-children ${fleetOpen ? "open" : ""}`}>
          {fleetNav.map((item) => <button key={item.id} className={`nav-child ${activeView === item.id ? "active" : ""}`} onClick={() => onNavigate(item.id)}>
            <item.icon size={15} /><span>{item.label}</span></button>)}
        </div>
        <p className="nav-section-label">Administration</p>
        <NavButton icon={Settings2} label="Settings" active={activeView === "administration"} onClick={() => onNavigate("administration")} />
      </nav>
      <div className="sidebar-footer">
        <div className="server-status"><span>AI PC server</span><strong>Online</strong></div>
        <span className="copyright">© 2026 Digital Transformation Unit</span>
      </div>
    </aside>
  </>;
}

function NavButton({ icon: Icon, label, active, onClick }: { icon: LucideIcon; label: string; active: boolean; onClick: () => void }) {
  return <button className={`nav-item ${active ? "active" : ""}`} onClick={onClick}><span className="nav-icon"><Icon size={18} /></span><span>{label}</span></button>;
}

function Topbar({ meta, onMenu, onSettings, showNotice }: {
  meta: { title: string; eyebrow: string }; onMenu: () => void; onSettings: () => void;
  showNotice: (message: string) => void;
}) {
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [permission, setPermission] = useState<BrowserNotificationPermission>(getNotificationPermission);

  const enableNotifications = async () => {
    if (!("Notification" in window)) {
      setPermission("unsupported");
      showNotice("This browser does not support system notifications.");
      return;
    }

    const result = await window.Notification.requestPermission();
    setPermission(result);
    if (result === "granted") {
      const delivered = await showSystemNotification("HR Digital notifications enabled", "Training, employee and vehicle alerts can now appear on this device.");
      showNotice(delivered ? "Notifications are enabled for this browser and installed PWA." : "Permission was granted, but this browser could not display the test alert.");
    } else if (result === "denied") {
      showNotice("Notifications are blocked. Allow them from the browser site settings to enable alerts.");
    }
  };

  const sendTestNotification = async () => {
    if (permission !== "granted") return enableNotifications();
    const delivered = await showSystemNotification("Human Resource Digital", "Notifications are working on this device.");
    showNotice(delivered ? "Test notification sent successfully." : "The browser could not display the test notification.");
  };

  return <header className="topbar"><div className="topbar-title"><button className="mobile-menu" onClick={onMenu} aria-label="Open navigation"><Menu size={20} /></button><div><p>{meta.eyebrow}</p><h1>{meta.title}</h1></div></div><div className="topbar-actions"><span className="today-label">Mon, 21 Sep 2026</span><div className="topbar-notifications"><button className={`topbar-icon ${notificationsOpen ? "active" : ""}`} onClick={() => { setPermission(getNotificationPermission()); setNotificationsOpen((open) => !open); }} aria-label="Notifications" aria-expanded={notificationsOpen}><Bell size={18} /><i /></button>{notificationsOpen && <section className="notification-panel" role="dialog" aria-label="Notification centre"><header><div><strong>Notifications</strong><span>{permission === "granted" ? "Device alerts active" : "Device alerts need permission"}</span></div><button onClick={() => setNotificationsOpen(false)} aria-label="Close notifications"><X size={16} /></button></header><div className={`notification-permission ${permission}`}><Bell size={17} /><div><strong>{permission === "granted" ? "PC & PWA notifications are on" : permission === "denied" ? "Notifications are blocked" : permission === "unsupported" ? "Notifications unavailable" : "Enable alerts on this device"}</strong><span>{permission === "granted" ? "Alerts can appear even when HR Digital is installed as an app." : permission === "denied" ? "Open this site's browser settings and change Notifications to Allow." : permission === "unsupported" ? "Use a current version of Chrome, Edge or another compatible browser." : "Allow training, employee and vehicle reminders to appear on your PC."}</span></div>{permission === "granted" ? <button onClick={sendTestNotification}>Test</button> : permission === "default" ? <button onClick={enableNotifications}>Enable</button> : null}</div><div className="notification-feed">{notificationFeed.map((item, index) => <article key={item.title}><span className={index === 0 ? "unread" : ""}><Bell size={15} /></span><div><strong>{item.title}</strong><p>{item.detail}</p></div><time>{item.time}</time></article>)}</div></section>}</div><button className="topbar-icon" onClick={onSettings} aria-label="Settings"><Settings2 size={18} /></button><div className="user-chip"><span>SA</span><div><strong>System Admin</strong><small>HR operations</small></div></div></div></header>;
}

function Administration({ showNotice }: { showNotice: (message: string) => void }) {
  const [settings, setSettings] = useState<AdminSettings>(loadAdminSettings);
  const update = <K extends keyof AdminSettings>(key: K, value: AdminSettings[K]) =>
    setSettings((current) => ({ ...current, [key]: value }));

  const save = (event: FormEvent) => {
    event.preventDefault();
    window.localStorage.setItem("hr-digital-admin-settings", JSON.stringify(settings));
    showNotice("Administration settings saved successfully.");
  };

  return <form className="page-stack admin-page" onSubmit={save}>
    <div className="module-intro admin-intro"><div><span className="module-kicker"><LockKeyhole size={15} /> Restricted administration</span><h2>Control the platform from one secure workspace.</h2><p>System Admin access is active. Manage communication, security, file handling and server behaviour here.</p></div><span className="admin-access"><ShieldCheck size={17} /> Full access</span></div>
    <div className="admin-grid">
      <section className="card admin-panel"><SectionHeader kicker="Platform" title="System preferences" />
        <label className="field"><span>Organisation name</span><input value={settings.organisation} onChange={(event) => update("organisation", event.target.value)} /></label>
        <label className="field"><span>Default site</span><input value={settings.site} onChange={(event) => update("site", event.target.value)} /></label>
        <label className="field"><span>Timezone</span><select value={settings.timezone} onChange={(event) => update("timezone", event.target.value)}><option value="Asia/Kuala_Lumpur">Asia/Kuala Lumpur (MYT)</option><option value="UTC">UTC</option></select></label>
      </section>
      <section className="card admin-panel"><SectionHeader kicker="Services" title="Feature controls" />
        <SettingToggle icon={MailCheck} title="Automated training email" detail="Allow scheduled invites, reminders and follow-ups." checked={settings.emailEnabled} onChange={(value) => update("emailEnabled", value)} />
        <SettingToggle icon={FileText} title="Employee note uploads" detail="Allow employees to upload training evidence and notes." checked={settings.uploadsEnabled} onChange={(value) => update("uploadsEnabled", value)} />
        <SettingToggle icon={ShieldCheck} title="Administration audit log" detail="Record sensitive configuration and access changes." checked={settings.auditEnabled} onChange={(value) => update("auditEnabled", value)} />
      </section>
      <section className="card admin-panel"><SectionHeader kicker="Security" title="Access & sessions" />
        <div className="admin-status-row"><span><UserCog size={18} /></span><div><strong>System Admin</strong><small>Full platform administration</small></div><em>Active</em></div>
        <div className="admin-status-row"><span><LockKeyhole size={18} /></span><div><strong>Session policy</strong><small>Never expires · administrator-controlled termination</small></div><em>Enforced</em></div>
        <button type="button" className="button button-secondary" onClick={() => showNotice("All other administrator sessions have been terminated.")}>Terminate other sessions</button>
      </section>
      <section className="card admin-panel"><SectionHeader kicker="Infrastructure" title="AI PC server" />
        <div className="server-health"><span><ServerCog size={25} /></span><div><strong>Production server online</strong><small>Application, database and background services are healthy.</small></div><em>Healthy</em></div>
        <dl className="admin-facts"><div><dt>Environment</dt><dd>Linux · Docker Compose</dd></div><div><dt>Data region</dt><dd>On-premise</dd></div><div><dt>Update channel</dt><dd>Stable</dd></div></dl>
      </section>
    </div>
    <div className="admin-savebar"><div><strong>Configuration controls unlocked</strong><span>Changes are limited to System Admin accounts.</span></div><button className="button button-primary" type="submit"><Check size={16} /> Save settings</button></div>
  </form>;
}

function SettingToggle({ icon: Icon, title, detail, checked, onChange }: { icon: LucideIcon; title: string; detail: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className="setting-toggle"><span><Icon size={18} /></span><div><strong>{title}</strong><small>{detail}</small></div><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><i aria-hidden="true" /></label>;
}

function Overview({ dashboard, sessions, navigate }: { dashboard: DashboardSummary | null; sessions: CalendarSession[]; navigate: (view: View) => void }) {
  const stats = dashboard?.stats;
  const upcoming = sessions.filter((session) => session.date >= "2026-09-21").slice(0, 4);
  return <section className="page-stack">
    <article className="hero-card"><div className="hero-glow" /><div className="hero-copy"><p className="live-label"><span /> HR operations · Monday, 21 September</p><h2>Good day, <em>HR team.</em></h2><p>Training readiness, people records and company mobility—one clear operational picture.</p><div className="hero-actions"><button className="button button-light" onClick={() => navigate("training-planner")}><Plus size={17} /> Plan training</button><button className="button button-ghost" onClick={() => navigate("training-calendar")}><CalendarDays size={17} /> Open calendar</button></div></div><div className="hero-signals"><div><span className="signal-icon amber"><CircleAlert size={18} /></span><small>Needs attention</small><strong>7</strong><em>training actions</em></div><div><span className="signal-icon blue"><MailCheck size={18} /></span><small>Emails queued</small><strong>24</strong><em>next 7 days</em></div><div><span className="signal-icon green"><ShieldCheck size={18} /></span><small>Readiness</small><strong>89%</strong><em>company-wide</em></div></div></article>
    <div className="metric-grid"><MetricCard icon={UsersRound} label="Active employees" value={stats ? formatNumber(stats.activeEmployees) : "—"} detail="Across 12 departments" tone="burgundy" /><MetricCard icon={GraduationCap} label="Training hours" value={stats ? formatNumber(stats.totalTrainingHours) : "—"} detail="+8.4% from last month" tone="blue" trend /><MetricCard icon={CalendarCheck2} label="Sessions this month" value={stats?.sessions ?? "—"} detail="5 scheduled this week" tone="violet" /><MetricCard icon={CarFront} label="Fleet availability" value="75%" detail="3 of 4 vehicles ready" tone="green" /></div>
    <div className="content-grid overview-grid"><section className="card readiness-card"><SectionHeader kicker="Workforce assurance" title="Training readiness" action="View records" onAction={() => navigate("training-records")} /><div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><BarChart data={departmentReadiness} layout="vertical" margin={{ top: 4, right: 22, bottom: 0, left: 12 }}><CartesianGrid horizontal={false} stroke="#ece8e6" /><XAxis type="number" domain={[0, 100]} tickFormatter={(value) => `${value}%`} axisLine={false} tickLine={false} tick={{ fill: "#827876", fontSize: 11 }} /><YAxis type="category" dataKey="department" width={86} axisLine={false} tickLine={false} tick={{ fill: "#4d4645", fontSize: 11 }} /><Tooltip formatter={(value) => [`${value}%`, "Readiness"]} cursor={{ fill: "#f8f5f3" }} /><Bar dataKey="readiness" fill="#17181a" radius={[0, 6, 6, 0]} barSize={16} animationDuration={1400} /></BarChart></ResponsiveContainer></div><div className="chart-summary"><strong>89%</strong><span>Overall compliance</span><i /><b>+3.2%</b><span>vs. August</span></div></section><section className="card schedule-card"><SectionHeader kicker="Next on the calendar" title="Upcoming training" action="Full calendar" onAction={() => navigate("training-calendar")} /><div className="timeline-list">{upcoming.map((session) => <SessionTimeline key={session.id} session={session} />)}</div></section></div>
    <div className="content-grid bottom-grid"><section className="card action-centre"><SectionHeader kicker="Action centre" title="What needs attention" /><div className="action-list"><ActionRow icon={MailCheck} tone="amber" title="12 effectiveness forms due" copy="Completions from June have reached the 3-month review point." button="Review queue" onClick={() => navigate("email-automation")} /><ActionRow icon={CircleAlert} tone="red" title="7 training requirements expiring" copy="Four employees are due within 14 days; three are already overdue." button="View employees" onClick={() => navigate("training-records")} /><ActionRow icon={Upload} tone="blue" title="9 notes awaiting upload" copy="Follow-up requests are ready for sessions completed this week." button="Open library" onClick={() => navigate("notes-library")} /></div></section><section className="card fleet-glance"><SectionHeader kicker="Mobility" title="Company car snapshot" action="Open tracker" onAction={() => navigate("fleet")} /><div className="fleet-number"><span><CarFront size={22} /></span><div><strong>4</strong><small>registered vehicles</small></div><em>1 in use</em></div><div className="mileage-line"><div><span>Monthly mileage</span><strong>1,284 km</strong></div><div className="progress-track"><i style={{ width: "64%" }} /></div><small>64% of normal monthly range</small></div><div className="service-warning"><Wrench size={17} /><span><strong>VFY 6620</strong> is due for service in 560 km.</span><ChevronRight size={16} /></div></section></div>
  </section>;
}

function MetricCard({ icon: Icon, label, value, detail, tone, trend }: { icon: LucideIcon; label: string; value: string | number; detail: string; tone: string; trend?: boolean }) {
  return <article className="metric-card"><span className={`metric-icon ${tone}`}><Icon size={20} /></span><div><p>{label}</p><strong>{value}</strong><small className={trend ? "positive" : ""}>{trend && "↗ "}{detail}</small></div><ChevronRight size={17} /></article>;
}
function SectionHeader({ kicker, title, action, onAction }: { kicker: string; title: string; action?: string; onAction?: () => void }) {
  return <header className="section-header"><div><p>{kicker}</p><h2>{title}</h2></div>{action && <button onClick={onAction}>{action}<ArrowRight size={15} /></button>}</header>;
}
function SessionTimeline({ session }: { session: CalendarSession }) {
  return <article className="timeline-item"><div className="date-tile"><strong>{new Date(`${session.date}T08:00:00`).getDate()}</strong><span>SEP</span></div><div className="timeline-copy"><strong>{session.title}</strong><span>{session.time}–{session.endTime} · {session.venue}</span><div><i className={`category-dot ${session.category.toLowerCase()}`} />{session.attendees.length} participants</div></div><span className={`status-badge ${session.status.toLowerCase().replace(" ", "-")}`}>{session.status}</span></article>;
}
function ActionRow({ icon: Icon, tone, title, copy, button, onClick }: { icon: LucideIcon; tone: string; title: string; copy: string; button: string; onClick: () => void }) {
  return <article className="action-row"><span className={`action-icon ${tone}`}><Icon size={19} /></span><div><strong>{title}</strong><p>{copy}</p></div><button onClick={onClick}>{button}<ChevronRight size={15} /></button></article>;
}

const featureDescription: Partial<Record<View, string>> = {
  "training-calendar": "See every session and attendee by date.", "training-planner": "Schedule a course and assign employees.",
  "training-records": "Monitor individual requirements and history.", "email-automation": "Run reminders, forms and follow-ups.",
  "notes-library": "Find employee learning notes instantly."
};

function TrainingOverview({ dashboard, sessions, navigate }: { dashboard: DashboardSummary | null; sessions: CalendarSession[]; navigate: (view: View) => void }) {
  return <section className="page-stack"><div className="module-intro training-intro"><div><span className="module-kicker"><GraduationCap size={15} /> Learning & development</span><h2>Build a capable, compliant workforce.</h2><p>Plan training, monitor requirements and keep every learning record, note and follow-up in one place.</p></div><button className="button button-primary" onClick={() => navigate("training-planner")}><Plus size={17} /> Plan a training</button></div><div className="metric-grid"><MetricCard icon={ShieldCheck} label="Compliance rate" value="89%" detail="Target 95%" tone="green" /><MetricCard icon={CalendarDays} label="Upcoming sessions" value={sessions.filter((s) => s.status === "Scheduled").length} detail="Next 30 days" tone="blue" /><MetricCard icon={Clock3} label="Learning hours" value={dashboard?.stats.totalTrainingHours ?? "—"} detail="Year to date" tone="violet" /><MetricCard icon={CircleAlert} label="Overdue actions" value="7" detail="Needs HR review" tone="burgundy" /></div><section className="card feature-hub"><SectionHeader kicker="Training workspace" title="Everything your team needs" /><div className="feature-grid">{trainingNav.slice(1).map((item, index) => <button key={item.id} onClick={() => navigate(item.id)} style={{ "--delay": `${index * 65}ms` } as React.CSSProperties}><span><item.icon size={21} /></span><div><strong>{item.label}</strong><p>{featureDescription[item.id]}</p></div><ArrowRight size={17} /></button>)}</div></section><div className="content-grid split-even"><section className="card"><SectionHeader kicker="This month" title="Delivery progress" action="Calendar" onAction={() => navigate("training-calendar")} /><div className="delivery-ring-row"><div className="donut-ring"><strong>14</strong><span>of 18<br />sessions</span></div><div className="delivery-stats"><div><strong>78%</strong><span>delivered</span></div><div><strong>428</strong><span>attendance records</span></div><div><strong>96%</strong><span>attendance rate</span></div></div></div></section><section className="card"><SectionHeader kicker="Automation" title="Follow-up journey" action="Manage" onAction={() => navigate("email-automation")} /><div className="journey-mini"><span><Check size={14} /> Invite sent</span><i /><span><Check size={14} /> Day reminder</span><i /><span><Upload size={14} /> Notes request</span><i /><span><MessageSquareText size={14} /> 3-month form</span></div><div className="queue-summary"><MailCheck size={19} /><div><strong>24 messages queued</strong><span>All automations are running normally.</span></div><span className="status-badge active">Healthy</span></div></section></div></section>;
}

function TrainingCalendar({ sessions, selectedDate, setSelectedDate, navigate }: { sessions: CalendarSession[]; selectedDate: string; setSelectedDate: (date: string) => void; navigate: (view: View) => void }) {
  const days = Array.from({ length: 35 }, (_, index) => { const offset = index - 1; if (offset < 0) return { day: 31, date: "2026-08-31", muted: true }; if (offset >= 30) return { day: offset - 29, date: `2026-10-${String(offset - 29).padStart(2, "0")}`, muted: true }; return { day: offset + 1, date: `2026-09-${String(offset + 1).padStart(2, "0")}`, muted: false }; });
  const selectedSessions = sessions.filter((session) => session.date === selectedDate);
  return <section className="page-stack"><div className="page-toolbar"><div className="segmented"><button className="active">Month</button><button>Agenda</button></div><div className="toolbar-actions"><button className="button button-secondary"><FileSpreadsheet size={16} /> Export</button><button className="button button-primary" onClick={() => navigate("training-planner")}><Plus size={16} /> Plan training</button></div></div><div className="calendar-layout"><section className="card calendar-card"><div className="calendar-toolbar"><div><button aria-label="Previous month"><ChevronLeft size={18} /></button><button aria-label="Next month"><ChevronRight size={18} /></button><button>Today</button></div><h2>September 2026</h2><span>5 sessions · 69 participants</span></div><div className="calendar-weekdays">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => <span key={day}>{day}</span>)}</div><div className="calendar-grid">{days.map((item) => { const daySessions = sessions.filter((session) => session.date === item.date); return <button key={item.date} className={`calendar-day ${item.muted ? "muted" : ""} ${selectedDate === item.date ? "selected" : ""} ${item.date === "2026-09-21" ? "today" : ""}`} onClick={() => setSelectedDate(item.date)}><span>{item.day}</span><div>{daySessions.map((session) => <em key={session.id} className={session.category.toLowerCase()}>{session.time} {session.title}</em>)}</div></button>; })}</div><div className="calendar-legend"><span><i className="compliance" />Compliance</span><span><i className="safety" />Safety</span><span><i className="system" />System</span><span><i className="development" />Development</span></div></section><aside className="card day-panel"><div className="day-panel-date"><span>{new Date(`${selectedDate}T08:00:00`).getDate()}</span><div><strong>{formatLongDate(selectedDate).split(",")[0]}</strong><small>{formatLongDate(selectedDate).split(",").slice(1).join(",")}</small></div></div>{selectedSessions.length ? selectedSessions.map((session) => <div className="day-session" key={session.id}><span className={`status-badge ${session.status.toLowerCase().replace(" ", "-")}`}>{session.status}</span><h3>{session.title}</h3><p>{session.code} · {session.category}</p><dl><div><dt><Clock3 size={15} />Time</dt><dd>{session.time}–{session.endTime}</dd></div><div><dt><MapPin size={15} />Venue</dt><dd>{session.venue}</dd></div><div><dt><UserRound size={15} />Trainer</dt><dd>{session.trainer}</dd></div></dl><div className="attendee-heading"><strong>Participants</strong><span>{session.attendees.length}/{session.capacity}</span></div><div className="attendee-list">{session.attendees.map((person) => <div key={person.id}><Avatar initials={person.name.split(" ").map((n) => n[0]).slice(0, 2).join("")} /><span><strong>{person.name}</strong><small>{person.department}</small></span><i className={person.status.toLowerCase()}>{person.status}</i></div>)}</div></div>) : <div className="empty-day"><CalendarDays size={28} /><strong>No training planned</strong><p>Select a highlighted date or create a session for this day.</p><button onClick={() => navigate("training-planner")}>Plan training</button></div>}</aside></div></section>;
}

function TrainingPlanner({ onCreate }: { onCreate: (session: CalendarSession) => void }) {
  const [title, setTitle] = useState("Workplace Safety & Emergency Response"); const [date, setDate] = useState("2026-09-30");
  const [time, setTime] = useState("09:00"); const [endTime, setEndTime] = useState("12:00"); const [trainer, setTrainer] = useState("Ahmad Faizal");
  const [venue, setVenue] = useState("Safety Briefing Hall"); const [category, setCategory] = useState<CalendarSession["category"]>("Safety");
  const [selected, setSelected] = useState<string[]>(["EMP001", "EMP002", "EMP005"]);
  const toggleEmployee = (id: string) => setSelected((items) => items.includes(id) ? items.filter((item) => item !== id) : [...items, id]);
  const submit = (event: FormEvent) => { event.preventDefault(); const attendees = employeeTrainingRows.filter((person) => selected.includes(person.id)).map((person) => ({ id: person.id, name: person.name, department: person.department, role: person.role, status: "Confirmed" as const })); onCreate({ id: `ts-${Date.now()}`, date, time, endTime, title, code: "TRN-NEW", category, trainer, venue, capacity: 20, status: "Scheduled", attendees }); };
  return <form className="planner-layout" onSubmit={submit}><div className="planner-main"><section className="card form-card"><SectionHeader kicker="Step 1 of 3" title="Training details" /><div className="form-grid"><label className="field span-2"><span>Training title</span><input value={title} onChange={(e) => setTitle(e.target.value)} required /></label><label className="field"><span>Category</span><select value={category} onChange={(e) => setCategory(e.target.value as CalendarSession["category"])}><option>Compliance</option><option>Safety</option><option>System</option><option>Development</option></select></label><label className="field"><span>Delivery method</span><select><option>Instructor-led</option><option>Online</option><option>On-the-job</option><option>External provider</option></select></label><label className="field"><span>Date</span><input type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></label><label className="field"><span>Start time</span><input type="time" value={time} onChange={(e) => setTime(e.target.value)} required /></label><label className="field"><span>End time</span><input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} required /></label><label className="field"><span>Trainer</span><input value={trainer} onChange={(e) => setTrainer(e.target.value)} required /></label><label className="field span-2"><span>Venue / meeting link</span><input value={venue} onChange={(e) => setVenue(e.target.value)} required /></label></div></section><section className="card form-card"><SectionHeader kicker="Step 2 of 3" title="Select participants" /><div className="participant-tools"><label className="compact-search"><Search size={16} /><input placeholder="Search employee or department" /></label><select aria-label="Department filter"><option>All departments</option><option>Production</option><option>Quality Management</option><option>HR & Admin</option></select></div><div className="participant-picker">{employeeTrainingRows.map((person) => <label key={person.id} className={selected.includes(person.id) ? "selected" : ""}><input type="checkbox" checked={selected.includes(person.id)} onChange={() => toggleEmployee(person.id)} /><Avatar initials={person.initials} /><span><strong>{person.name}</strong><small>{person.id} · {person.department}</small></span><em>{person.risk}</em></label>)}</div></section></div><aside className="planner-side"><section className="card plan-summary"><SectionHeader kicker="Step 3 of 3" title="Review plan" /><div className="summary-hero"><CalendarCheck2 size={24} /><strong>{title}</strong><span>{date ? formatLongDate(date) : "Choose a date"}</span></div><dl><div><dt>Time</dt><dd>{time}–{endTime}</dd></div><div><dt>Trainer</dt><dd>{trainer || "Not assigned"}</dd></div><div><dt>Venue</dt><dd>{venue || "Not assigned"}</dd></div><div><dt>Participants</dt><dd>{selected.length} selected</dd></div></dl><div className="automation-included"><MailCheck size={18} /><div><strong>Email journey included</strong><span>Invites, day reminders, notes request and 3-month follow-up.</span></div></div><button className="button button-primary full" type="submit"><CalendarCheck2 size={17} /> Create training plan</button><button className="text-button" type="button">Save as draft</button></section></aside></form>;
}

const employeeStatusLabel = (status: Employee["status"]) => status.toLowerCase().replaceAll("_", " ").replace(/^./, (value) => value.toUpperCase());

function EmployeesDatabase({ showNotice }: { showNotice: (message: string) => void }) {
  const [query, setQuery] = useState("");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [preview, setPreview] = useState<EmployeeImportPreview | null>(null);
  const [importing, setImporting] = useState(false);
  const [profile, setProfile] = useState<Employee | null>(null);
  const [editor, setEditor] = useState<Employee | null | undefined>(undefined);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState("");

  const refresh = async () => setEmployees(await api.getEmployees());
  useEffect(() => { void refresh(); }, []);

  const trainingFor = (employee: Employee) => employeeTrainingRows.find((item) => item.id === employee.employeeId);
  const visible = employees.filter((person) => `${person.name ?? ""} ${person.employeeId} ${person.department.name} ${person.role ?? ""} ${person.status}`.toLowerCase().includes(query.toLowerCase()));
  const activeCount = employees.filter((person) => person.status === "ACTIVE").length;
  const previewFile = async (file?: File) => { if (!file) return; setImporting(true); try { const result = await api.previewEmployeeImport(file); setPreview(result); showNotice(`${result.meta.validRows} valid employee records are ready to import.`); } catch { showNotice("The spreadsheet could not be previewed. Check the required column names."); } finally { setImporting(false); } };
  const commit = async () => { if (!preview?.rows.length) return; setImporting(true); try { const result = await api.commitEmployeeImport(preview.rows); await refresh(); showNotice(`${result.imported} employee records were imported.`); setPreview(null); } catch { showNotice("The database is not connected yet, so the import could not be saved."); } finally { setImporting(false); } };

  const profileDialog = profile ? createPortal(<div className="fleet-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !removing) setProfile(null); }}><section className="fleet-dialog employee-profile-dialog" role="dialog" aria-modal="true" aria-label={`${profile.name ?? profile.employeeId} employee profile`}><header><div><span>{profile.employeeId}</span><strong>Employee profile</strong></div><button onClick={() => setProfile(null)} aria-label="Close"><X size={19} /></button></header><div className="employee-profile-body"><div className="profile-identity"><Avatar initials={(profile.name ?? profile.employeeId).split(" ").map((part) => part[0]).slice(0, 2).join("")} /><div><h2>{profile.name || "Name not recorded"}</h2><p>{profile.role || "Role not recorded"} · {profile.department.name}</p></div><span className={`employment-status ${profile.status.toLowerCase().replaceAll("_", "-")}`}>{employeeStatusLabel(profile.status)}</span></div><div className="profile-details"><div><span>Email</span><strong>{profile.email || "Not recorded"}</strong></div><div><span>Production line</span><strong>{profile.line || "Not assigned"}</strong></div><div><span>Employee ID</span><strong>{profile.employeeId}</strong></div><div><span>Department</span><strong>{profile.department.name}</strong></div></div>{(() => { const training = trainingFor(profile); return training ? <section className="profile-training"><div><span>Training completion</span><strong>{training.completed} / {training.required}</strong></div><div><span>Learning hours</span><strong>{training.hours} hours</strong></div><div><span>Next requirement</span><strong>{training.nextDue}</strong></div><div><span>Training attention</span><strong>{training.risk}</strong></div></section> : <section className="profile-training-empty"><GraduationCap size={22} /><span>No training summary is linked to this employee yet.</span></section>; })()} {error && <div className="form-error"><CircleAlert size={16} />{error}</div>}<footer className="profile-actions"><button className="button button-danger-outline" disabled={removing || profile.status === "INACTIVE"} onClick={async () => { try { setRemoving(true); setError(""); await api.removeEmployee(profile.id); await refresh(); showNotice(`${profile.name ?? profile.employeeId} was removed from the active directory. Training history was retained.`); setProfile(null); } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to remove this employee."); } finally { setRemoving(false); } }}><Trash2 size={16} />{removing ? "Removing…" : "Remove from active directory"}</button><button className="button button-primary" onClick={() => { setEditor(profile); setProfile(null); }}><Pencil size={16} /> Edit profile & status</button></footer></div></section></div>, document.body) : null;

  const editorDialog = editor !== undefined ? createPortal(<div className="fleet-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditor(undefined); }}><section className="fleet-dialog employee-profile-dialog" role="dialog" aria-modal="true" aria-label={editor ? "Edit employee" : "Add employee"}><header><div><span>{editor?.employeeId ?? "People directory"}</span><strong>{editor ? "Edit employee profile" : "Add a new employee"}</strong></div><button onClick={() => setEditor(undefined)} aria-label="Close"><X size={19} /></button></header><EmployeeForm employee={editor ?? undefined} onSubmit={async (input) => { const saved = editor ? await api.updateEmployee(editor.id, input) : await api.createEmployee(input); await refresh(); showNotice(editor ? `${saved.name ?? saved.employeeId}'s profile was updated.` : `${saved.name ?? saved.employeeId} was added to the people directory.`); setEditor(undefined); }} /></section></div>, document.body) : null;

  return <><section className="page-stack"><div className="page-toolbar"><label className="search-field"><Search size={17} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, employee ID, role or department" /></label><div className="toolbar-actions"><label className="button button-secondary upload-button"><Upload size={16} />{importing ? "Reading…" : "Import spreadsheet"}<input type="file" accept=".csv,.xlsx,.xls" onChange={(e) => previewFile(e.target.files?.[0])} /></label><button className="button button-primary" onClick={() => setEditor(null)}><Plus size={16} /> Add employee</button></div></div>{preview && <section className="import-banner"><FileSpreadsheet size={22} /><div><strong>Spreadsheet ready</strong><span>{preview.meta.validRows} valid rows · {preview.errors.length} issues found</span></div><button onClick={commit} disabled={importing}>Import valid rows</button><button onClick={() => setPreview(null)} aria-label="Dismiss import"><X size={17} /></button></section>}<div className="metric-grid compact-metrics"><MetricCard icon={UsersRound} label="Active employees" value={String(activeCount)} detail={`${employees.length} total records`} tone="burgundy" /><MetricCard icon={ShieldCheck} label="Fully compliant" value={String(employeeTrainingRows.filter((item) => item.risk === "Complete" || item.risk === "On track").length)} detail="Current training sample" tone="green" /><MetricCard icon={CircleAlert} label="Training attention" value={String(employeeTrainingRows.filter((item) => item.risk === "Attention" || item.risk === "Due now").length)} detail="Requires HR review" tone="violet" /><MetricCard icon={UserCog} label="Inactive / departed" value={String(employees.length - activeCount)} detail="History retained" tone="blue" /></div><section className="card data-card"><SectionHeader kicker="Master employee record" title="People directory" /><div className="table-wrap"><table className="data-table employee-table"><thead><tr><th>Employee</th><th>Department & role</th><th>Training progress</th><th>Learning hours</th><th>Next requirement</th><th>Employment</th><th /></tr></thead><tbody>{visible.map((person) => { const training = trainingFor(person); const percent = training ? Math.round(training.completed / training.required * 100) : 0; return <tr key={person.id}><td><div className="person-cell"><Avatar initials={(person.name ?? person.employeeId).split(" ").map((part) => part[0]).slice(0, 2).join("")} /><span><strong>{person.name || "Name not recorded"}</strong><small>{person.employeeId}</small></span></div></td><td><strong>{person.department.name}</strong><small>{person.role || "Role not recorded"}</small></td><td>{training ? <div className="table-progress"><span><b>{training.completed}/{training.required}</b><em>{percent}%</em></span><div><i style={{ width: `${percent}%` }} /></div></div> : <small>No linked records</small>}</td><td><strong>{training?.hours ?? 0} hours</strong><small>Year to date</small></td><td><strong>{training?.nextDue.split(" · ")[0] ?? "None"}</strong><small>{training?.nextDue.split(" · ")[1] ?? "—"}</small></td><td><span className={`employment-status ${person.status.toLowerCase().replaceAll("_", "-")}`}>{employeeStatusLabel(person.status)}</span></td><td><button className="row-action" aria-label={`Open ${person.name ?? person.employeeId} profile`} onClick={() => { setError(""); setProfile(person); }}><ChevronRight size={17} /></button></td></tr>; })}</tbody></table></div></section></section>{profileDialog}{editorDialog}</>;
}

function EmployeeForm({ employee, onSubmit }: { employee?: Employee; onSubmit: (input: EmployeeInput) => Promise<void> }) {
  const [employeeId, setEmployeeId] = useState(employee?.employeeId ?? "");
  const [name, setName] = useState(employee?.name ?? "");
  const [email, setEmail] = useState(employee?.email ?? "");
  const [department, setDepartment] = useState(employee?.department.name ?? "");
  const [line, setLine] = useState(employee?.line ?? "");
  const [role, setRole] = useState(employee?.role ?? "");
  const [status, setStatus] = useState<Employee["status"]>(employee?.status ?? "ACTIVE");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return <form className="fleet-form employee-form" onSubmit={async (event) => { event.preventDefault(); try { setBusy(true); setError(""); await onSubmit({ employeeId, name, email, department, line, role, status }); } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save this employee."); } finally { setBusy(false); } }}><div className="registry-note"><UserRound size={22} /><div><strong>{employee ? "Maintain the master employee record" : "Create a master employee record"}</strong><small>Status controls whether the employee appears in active workforce workflows; historical training records are always retained.</small></div></div><div className="form-grid"><label className="field"><span>Employee ID</span><input value={employeeId} onChange={(event) => setEmployeeId(event.target.value.toUpperCase())} required /></label><label className="field"><span>Full name</span><input value={name} onChange={(event) => setName(event.target.value)} required /></label><label className="field"><span>Email</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="employee@company.com" /></label><label className="field"><span>Department</span><input value={department} onChange={(event) => setDepartment(event.target.value)} required /></label><label className="field"><span>Role / position</span><input value={role} onChange={(event) => setRole(event.target.value)} /></label><label className="field"><span>Line / unit</span><input value={line} onChange={(event) => setLine(event.target.value)} /></label><label className="field span-2"><span>Employment status</span><select value={status} onChange={(event) => setStatus(event.target.value as Employee["status"])}><option value="ACTIVE">Active</option><option value="ON_LEAVE">On leave</option><option value="INACTIVE">Inactive</option><option value="RESIGNED">Resigned</option><option value="TERMINATED">Terminated</option></select><small className="field-help">Inactive, resigned and terminated employees remain available in historical training and audit records.</small></label></div>{error && <div className="form-error"><CircleAlert size={16} />{error}</div>}<footer className="fleet-form-actions"><span><ShieldCheck size={16} /> Changes are saved to the central people directory.</span><button className="button button-primary" disabled={busy}><CheckCircle2 size={16} />{busy ? "Saving…" : employee ? "Save employee changes" : "Add employee"}</button></footer></form>;
}

function TrainingRecords() {
  const [query, setQuery] = useState(""); const visible = employeeTrainingRows.filter((person) => `${person.name} ${person.id} ${person.department}`.toLowerCase().includes(query.toLowerCase()));
  return <section className="page-stack"><div className="page-toolbar"><label className="search-field"><Search size={17} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search training records" /></label><div className="toolbar-actions"><button className="button button-secondary"><FileSpreadsheet size={16} /> Export report</button></div></div><section className="card matrix-card"><SectionHeader kicker="Requirement matrix" title="Employee training status" /><div className="matrix-legend"><span><i className="complete" />Complete</span><span><i className="due" />Due soon</span><span><i className="overdue" />Overdue</span><span><i className="not-required" />Not required</span></div><div className="table-wrap"><table className="data-table matrix-table"><thead><tr><th>Employee</th><th>GMP</th><th>Safety</th><th>Data integrity</th><th>Line clearance</th><th>PDPA</th><th>Progress</th></tr></thead><tbody>{visible.map((person, index) => <tr key={person.id}><td><div className="person-cell"><Avatar initials={person.initials} /><span><strong>{person.name}</strong><small>{person.department}</small></span></div></td>{[0, 1, 2, 3, 4].map((column) => { const state = (index + column) % 7 === 0 ? "overdue" : (index + column) % 5 === 0 ? "due" : column === 4 && index % 2 === 0 ? "not-required" : "complete"; return <td key={column}><span className={`matrix-status ${state}`}>{state === "complete" ? <Check size={14} /> : state === "due" ? "14d" : state === "overdue" ? "!" : "—"}</span></td>; })}<td><strong>{Math.round(person.completed / person.required * 100)}%</strong></td></tr>)}</tbody></table></div></section><div className="content-grid split-even"><section className="card"><SectionHeader kicker="Expiring requirements" title="Next 30 days" /><div className="expiry-list">{employeeTrainingRows.slice(0, 4).map((person, index) => <div key={person.id}><Avatar initials={person.initials} /><span><strong>{person.name}</strong><small>{person.nextDue}</small></span><em className={index === 0 ? "urgent" : ""}>{index === 0 ? "Today" : `${7 + index * 4} days`}</em></div>)}</div></section><section className="card"><SectionHeader kicker="Coverage" title="By department" /><div className="coverage-list">{departmentReadiness.slice(0, 5).map((department) => <div key={department.department}><span><strong>{department.department}</strong><small>{department.employees} employees</small></span><div><i style={{ width: `${department.readiness}%` }} /></div><em>{department.readiness}%</em></div>)}</div></section></div></section>;
}

const emailBodyCopy: Record<string, string> = {
  "email-1": "This is a friendly reminder that your scheduled training begins today. Please arrive 10 minutes early and bring any required safety equipment.",
  "email-2": "Thank you for completing your training. Please upload your notes and any supporting material so they can be indexed in the shared learning library.",
  "email-3": "It has been three months since you completed this course. Your short feedback helps us understand how the learning is being applied at work.",
  "email-4": "You have an outstanding training action. Please complete it so your learning record remains current."
};

function EmailAutomation({ showNotice }: { showNotice: (message: string) => void }) {
  const [selected, setSelected] = useState(emailAutomations[0]);
  return <section className="page-stack"><div className="module-intro email-intro"><div><span className="module-kicker"><MailCheck size={15} /> Automated communication</span><h2>The right message, at the right moment.</h2><p>Keep employees and managers informed from enrolment through post-training effectiveness review.</p></div><button className="button button-light" onClick={() => showNotice("A new email workflow draft has been created.")}><Plus size={17} /> New automation</button></div><div className="email-layout"><section className="card automation-list"><SectionHeader kicker="Active workflows" title="Email journey" />{emailAutomations.map((automation) => <button key={automation.id} className={selected.id === automation.id ? "selected" : ""} onClick={() => setSelected(automation)}><span className="automation-order"><MailCheck size={18} /></span><div><strong>{automation.title}</strong><p>{automation.trigger}</p><small>{automation.audience}</small></div><span className={`status-badge ${automation.status.toLowerCase()}`}>{automation.status}</span><em>{automation.sent} sent</em></button>)}</section><section className="card email-preview-card"><div className="preview-toolbar"><div><p>Email preview</p><h2>{selected.title}</h2></div><button className="button button-secondary" onClick={() => showNotice("Preview prepared. Connect SMTP credentials on the Linux server to deliver test emails.")}><Send size={15} /> Send test</button></div><div className="email-window"><div className="email-meta"><div><span className="email-logo">SGI</span><span><strong>Human Resource Digital</strong><small>training@sugiharagrand.com</small></span></div><dl><div><dt>To</dt><dd>Employee name</dd></div><div><dt>Subject</dt><dd>{selected.title}: GMP Refresher 2026</dd></div></dl></div><div className="email-body"><div className="email-brand"><img src="/sgi-logo.png" alt="Sugihara Grand Industries" /></div><span className="email-tag">Training & development</span><h3>{selected.id === "email-3" ? "How has your training helped?" : selected.id === "email-2" ? "Share your training notes" : "Your training is coming up"}</h3><p>Hi Muhammad,</p><p>{emailBodyCopy[selected.id]}</p><div className="email-detail-box"><CalendarDays size={19} /><span><strong>GMP Refresher 2026</strong><small>Monday, 21 September · 9:00 AM<br />Main Conference Room</small></span></div><button>{selected.id === "email-3" ? "Complete effectiveness form" : selected.id === "email-2" ? "Upload training notes" : "View training details"}</button><p className="email-signoff">Thank you,<br /><strong>Human Resources · Sugihara Grand Industries</strong></p></div><footer>This is an automated message from Human Resource Digital.</footer></div><div className="delivery-note"><ShieldCheck size={18} /><div><strong>Delivery-ready template</strong><span>Responsive HTML, branded sender identity and tracked action link. SMTP credentials are required on deployment.</span></div></div></section></div></section>;
}

function NotesLibrary({ showNotice }: { showNotice: (message: string) => void }) {
  const [query, setQuery] = useState(""); const visible = notesLibrary.filter((note) => `${note.title} ${note.employee} ${note.course} ${note.tags.join(" ")}`.toLowerCase().includes(query.toLowerCase()));
  return <section className="page-stack"><div className="page-toolbar"><label className="search-field wide"><Search size={17} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search title, employee, course or tag" /></label><div className="toolbar-actions"><select><option>All file types</option><option>PDF</option><option>DOCX</option><option>XLSX</option></select><button className="button button-primary" onClick={() => showNotice("Upload area opened. Files will be stored against an employee and training record.")}><Upload size={16} /> Upload notes</button></div></div><div className="library-layout"><aside className="card library-filter"><SectionHeader kicker="Browse" title="Learning library" /><button className="active"><Library size={17} />All notes<span>{notesLibrary.length}</span></button><button><Clock3 size={17} />Recently added<span>3</span></button><button><UsersRound size={17} />My department<span>12</span></button><p>Popular tags</p>{["GMP", "Safety", "System", "Quality", "Leadership"].map((tag) => <button key={tag} className="tag-filter"># {tag}</button>)}</aside><section className="notes-results"><div className="results-heading"><span><strong>{visible.length} documents</strong><small>Indexed by employee and training</small></span><select><option>Newest first</option><option>Title A–Z</option></select></div>{visible.map((note, index) => <article className="note-card" key={note.id} style={{ "--delay": `${index * 60}ms` } as React.CSSProperties}><span className={`file-type ${note.type.toLowerCase()}`}><FileText size={21} /><em>{note.type}</em></span><div className="note-copy"><small>{note.course}</small><h3>{note.title}</h3><p>{note.excerpt}</p><div className="tag-row">{note.tags.map((tag) => <span key={tag}>{tag}</span>)}</div><footer><span><Avatar initials={note.employee.split(" ").map((n) => n[0]).slice(0, 2).join("")} />{note.employee}</span><em>{note.submitted} · {note.size}</em></footer></div><button className="row-action" aria-label={`Open ${note.title}`} onClick={() => showNotice(`${note.title} is ready to retrieve from document storage.`)}><ArrowRight size={17} /></button></article>)}</section></div></section>;
}

const fleetStatusLabel = (status: Vehicle["status"] | VehicleTrip["status"] | VehicleCondition) =>
  status.toLowerCase().replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());

const makeFallbackFleet = () => {
  const trips: VehicleTrip[] = fallbackVehicleTrips.map((trip, index) => {
    const vehicle = fallbackVehicles.find((item) => item.plate === trip.vehicle)!;
    return {
      id: trip.id,
      vehicleId: vehicle.id,
      driverEmployeeId: `EMP00${index + 1}`,
      driverName: trip.driver,
      destination: trip.destination,
      purpose: trip.purpose,
      passengers: 1,
      startedAt: new Date(`2026-09-${21 - index}T08:30:00+08:00`).toISOString(),
      endedAt: trip.status === "Completed" ? new Date(`2026-09-${21 - index}T12:00:00+08:00`).toISOString() : null,
      odometerStart: vehicle.mileage - trip.distance,
      odometerEnd: trip.status === "Completed" ? vehicle.mileage : null,
      fuelBefore: 75,
      fuelAfter: trip.status === "Completed" ? 58 : null,
      conditionBefore: "GOOD",
      conditionAfter: trip.status === "Completed" ? "GOOD" : null,
      checksBefore: { exterior: true, tyres: true, lights: true, documents: true },
      checksAfter: trip.status === "Completed" ? { interiorClean: true, fuelCardReturned: true, belongingsRemoved: true, damageReported: false } : null,
      notesBefore: null,
      notesAfter: null,
      status: trip.status === "Completed" ? "COMPLETED" : "IN_PROGRESS"
    };
  });
  const vehicles: Vehicle[] = fallbackVehicles.map((vehicle) => {
    const activeTrip = trips.find((trip) => trip.vehicleId === vehicle.id && trip.status === "IN_PROGRESS") ?? null;
    const status: Vehicle["status"] = activeTrip ? "IN_USE" : vehicle.status === "Service due" ? "SERVICE_DUE" : "AVAILABLE";
    return { ...vehicle, status, activeTrip };
  });
  return { vehicles, trips };
};

function FleetTracker({
  showNotice,
  initialVehicleId,
  onOpenRegistry,
}: {
  showNotice: (message: string) => void;
  initialVehicleId?: string;
  onOpenRegistry: () => void;
}) {
  const fallback = makeFallbackFleet();
  const [fleetVehicles, setFleetVehicles] = useState<Vehicle[]>(
    fallback.vehicles,
  );
  const [trips, setTrips] = useState<VehicleTrip[]>(fallback.trips);
  const [selectedVehicleId, setSelectedVehicleId] = useState(
    initialVehicleId ?? fallback.vehicles[0]?.id ?? "",
  );
  const [dialog, setDialog] = useState<
    "start" | "complete" | "qr" | "vehicle" | null
  >(null);
  const [editingVehicleId, setEditingVehicleId] = useState<string | null>(null);
  const [deepLinkHandled, setDeepLinkHandled] = useState(false);

  const refreshFleet = async () => {
    try {
      const [vehicleRows, tripRows] = await Promise.all([
        api.getVehicles(),
        api.getVehicleTrips(),
      ]);
      setFleetVehicles(vehicleRows);
      setTrips(tripRows);
      return vehicleRows;
    } catch {
      setFleetVehicles(fallback.vehicles);
      setTrips(fallback.trips);
      return fallback.vehicles;
    }
  };

  useEffect(() => {
    void refreshFleet();
  }, []);
  useEffect(() => {
    if (!initialVehicleId || deepLinkHandled) return;
    const vehicle = fleetVehicles.find((item) => item.id === initialVehicleId);
    if (!vehicle) return;
    setSelectedVehicleId(vehicle.id);
    setDialog(vehicle.activeTrip ? "complete" : "start");
    setDeepLinkHandled(true);
  }, [deepLinkHandled, fleetVehicles, initialVehicleId]);

  const selectedVehicle =
    fleetVehicles.find((vehicle) => vehicle.id === selectedVehicleId) ??
    fleetVehicles[0];
  const activeTrip =
    selectedVehicle?.activeTrip ??
    trips.find(
      (trip) =>
        trip.vehicleId === selectedVehicle?.id && trip.status === "IN_PROGRESS",
    ) ??
    null;
  const available = fleetVehicles.filter(
    (vehicle) => vehicle.status === "AVAILABLE",
  ).length;
  const distance = trips.reduce(
    (total, trip) =>
      total +
      Math.max(
        0,
        (trip.odometerEnd ?? trip.odometerStart) - trip.odometerStart,
      ),
    0,
  );
  const serviceAttention = fleetVehicles.filter(
    (vehicle) =>
      vehicle.status === "SERVICE_DUE" || vehicle.status === "OUT_OF_SERVICE",
  ).length;

  const openStart = (vehicle?: Vehicle) => {
    const target =
      vehicle ?? fleetVehicles.find((item) => item.status === "AVAILABLE");
    if (!target) {
      showNotice(
        "No vehicle is currently cleared and available for a new trip.",
      );
      return;
    }
    setSelectedVehicleId(target.id);
    setDialog("start");
  };
  const closeDialog = () => {
    setDialog(null);
    if (initialVehicleId)
      window.history.replaceState({}, "", window.location.pathname);
  };

  const editingVehicle = editingVehicleId
    ? fleetVehicles.find((vehicle) => vehicle.id === editingVehicleId)
    : undefined;
  const dialogVehicle = selectedVehicle ?? fleetVehicles[0];
  const dialogTitle =
    dialog === "vehicle"
      ? editingVehicle
        ? "Edit vehicle details"
        : "Register a new vehicle"
      : dialog === "start"
        ? "Before-drive check & trip details"
        : dialog === "complete"
          ? "After-drive return check"
          : "Vehicle scan code";
  const dialogLabel =
    dialog === "vehicle"
      ? (editingVehicle?.plate ?? "Fleet registry")
      : (dialogVehicle?.plate ?? "Company vehicle");
  const fleetDialog =
    dialog && (dialog === "vehicle" || dialogVehicle)
      ? createPortal(
          <div
            className="fleet-dialog-backdrop"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) closeDialog();
            }}
          >
            <section
              className={`fleet-dialog ${dialog === "qr" ? "qr-dialog" : ""}`}
              role="dialog"
              aria-modal="true"
              aria-label={dialogTitle}
            >
              <header>
                <div>
                  <span>{dialogLabel}</span>
                  <strong>{dialogTitle}</strong>
                </div>
                <button onClick={closeDialog} aria-label="Close">
                  <X size={19} />
                </button>
              </header>
              {dialog === "vehicle" && (
                <VehicleForm
                  vehicle={editingVehicle}
                  onSubmit={async (input) => {
                    const saved = editingVehicle
                      ? await api.updateVehicle(editingVehicle.id, input)
                      : await api.createVehicle(input);
                    const rows = await refreshFleet();
                    setSelectedVehicleId(saved.id || rows[0]?.id || "");
                    showNotice(
                      editingVehicle
                        ? `${saved.plate} vehicle details were updated.`
                        : `${saved.plate} was added to the fleet.`,
                    );
                    closeDialog();
                  }}
                />
              )}
              {dialog === "start" && dialogVehicle && (
                <StartTripForm
                  vehicles={fleetVehicles}
                  selectedVehicleId={dialogVehicle.id}
                  onVehicleChange={setSelectedVehicleId}
                  onSubmit={async (input) => {
                    await api.startVehicleTrip(input);
                    await refreshFleet();
                    showNotice(
                      `${dialogVehicle.plate} is checked out and the trip is now active.`,
                    );
                    closeDialog();
                  }}
                />
              )}
              {dialog === "complete" && dialogVehicle && activeTrip && (
                <CompleteTripForm
                  vehicle={dialogVehicle}
                  trip={activeTrip}
                  onSubmit={async (input) => {
                    await api.completeVehicleTrip(activeTrip.id, input);
                    await refreshFleet();
                    showNotice(
                      `${dialogVehicle.plate} was returned and its mileage was updated.`,
                    );
                    closeDialog();
                  }}
                />
              )}
              {dialog === "complete" && !activeTrip && (
                <div className="fleet-form-empty">
                  <CircleAlert size={28} />
                  <strong>No active trip found</strong>
                  <p>Refresh the fleet or start a new trip for this vehicle.</p>
                </div>
              )}
              {dialog === "qr" && dialogVehicle && (
                <VehicleQr vehicle={dialogVehicle} />
              )}
            </section>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <section className="page-stack">
        <div className="module-intro fleet-intro">
          <div>
            <span className="module-kicker">
              <CarFront size={15} /> Company mobility
            </span>
            <h2>Scan. Inspect. Drive. Return.</h2>
            <p>
              Record every journey from the before-drive inspection to the
              final odometer photo and vehicle return.
            </p>
          </div>
          <div className="fleet-hero-actions">
            <button
              className="button button-light"
              onClick={onOpenRegistry}
            >
              <Settings2 size={17} /> Manage vehicle registry
            </button>
            <button
              className="button button-ghost-light"
              onClick={() => openStart()}
            >
              <CarFront size={17} /> Start vehicle use
            </button>
          </div>
        </div>
        <div className="metric-grid">
          <MetricCard
            icon={CarFront}
            label="Registered vehicles"
            value={String(fleetVehicles.length)}
            detail={`${available} currently available`}
            tone="burgundy"
          />
          <MetricCard
            icon={Route}
            label="Recorded distance"
            value={`${formatNumber(distance)} km`}
            detail={`${trips.length} journey records`}
            tone="blue"
          />
          <MetricCard
            icon={Gauge}
            label="Vehicles in use"
            value={String(
              fleetVehicles.filter((vehicle) => vehicle.status === "IN_USE")
                .length,
            )}
            detail="Live check-outs"
            tone="green"
          />
          <MetricCard
            icon={Wrench}
            label="Service attention"
            value={String(serviceAttention)}
            detail="Restricted from new trips"
            tone="violet"
          />
        </div>
        <section className="card vehicle-section">
          <SectionHeader
            kicker="Trip-ready fleet"
            title="Vehicle status & QR access"
          />
          <div className="vehicle-grid">
            {fleetVehicles.map((vehicle) => {
              const remaining = vehicle.serviceAt - vehicle.mileage;
              const progress =
                vehicle.serviceAt > 0
                  ? Math.min(100, (vehicle.mileage / vehicle.serviceAt) * 100)
                  : 100;
              return (
                <article key={vehicle.id} className="vehicle-card">
                  {vehicle.photo && <img className="vehicle-card-photo" src={vehicle.photo} alt={`${vehicle.plate} ${vehicle.model}`} />}
                  <header>
                    <span>
                      <CarFront size={22} />
                    </span>
                    <div>
                      <strong>{vehicle.plate}</strong>
                      <small>{vehicle.model}</small>
                    </div>
                    <em
                      className={vehicle.status
                        .toLowerCase()
                        .replaceAll("_", "-")}
                    >
                      {fleetStatusLabel(vehicle.status)}
                    </em>
                  </header>
                  <div className="vehicle-meta">
                    <span>
                      <small>Category</small>
                      <strong>{vehicle.category}</strong>
                    </span>
                    <span>
                      <small>Pool / owner</small>
                      <strong>{vehicle.assigned}</strong>
                    </span>
                  </div>
                  {vehicle.activeTrip && (
                    <div className="active-driver">
                      <Route size={15} />
                      <span>
                        <strong>{vehicle.activeTrip.driverName}</strong>
                        <small>To {vehicle.activeTrip.destination}</small>
                      </span>
                    </div>
                  )}
                  <div className="odometer">
                    <span>
                      <small>Current mileage</small>
                      <strong>
                        {formatNumber(vehicle.mileage)} <em>km</em>
                      </strong>
                    </span>
                    <Gauge size={18} />
                  </div>
                  <div className="service-meter">
                    <div>
                      <span>Next service</span>
                      <strong>{formatNumber(vehicle.serviceAt)} km</strong>
                    </div>
                    <div>
                      <i
                        className={remaining < 1000 ? "warning" : ""}
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <small>
                      {remaining > 0
                        ? `${formatNumber(remaining)} km remaining`
                        : "Service threshold reached"}
                    </small>
                  </div>
                  <footer className="vehicle-actions">
                    <button
                      onClick={() => {
                        setSelectedVehicleId(vehicle.id);
                        setDialog("qr");
                      }}
                    >
                      <QrCode size={15} /> QR
                    </button>
                    {vehicle.activeTrip ? (
                      <button
                        className="primary"
                        onClick={() => {
                          setSelectedVehicleId(vehicle.id);
                          setDialog("complete");
                        }}
                      >
                        Return <ArrowRight size={14} />
                      </button>
                    ) : (
                      <button
                        className="primary"
                        disabled={vehicle.status !== "AVAILABLE"}
                        onClick={() => openStart(vehicle)}
                      >
                        Start trip <ArrowRight size={14} />
                      </button>
                    )}
                  </footer>
                </article>
              );
            })}
          </div>
        </section>
        <section className="card data-card">
          <SectionHeader
            kicker="Auditable usage log"
            title="Recent journeys"
            action="Export log"
          />
          <div className="table-wrap">
            <table className="data-table trip-table">
              <thead>
                <tr>
                  <th>Trip</th>
                  <th>Vehicle</th>
                  <th>Driver</th>
                  <th>Destination</th>
                  <th>Before / after</th>
                  <th>Distance</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {trips.map((trip) => (
                  <tr key={trip.id}>
                    <td>
                      <strong>
                        {trip.id.startsWith("TRIP-")
                          ? trip.id
                          : trip.id.slice(-8).toUpperCase()}
                      </strong>
                      <small>
                        {new Date(trip.startedAt).toLocaleDateString("en-MY", {
                          day: "2-digit",
                          month: "short",
                        })}
                      </small>
                    </td>
                    <td>
                      <strong>
                        {trip.vehicle?.plate ??
                          fleetVehicles.find(
                            (vehicle) => vehicle.id === trip.vehicleId,
                          )?.plate}
                      </strong>
                    </td>
                    <td>
                      {trip.driverName}
                      <small>{trip.driverEmployeeId}</small>
                    </td>
                    <td>
                      <MapPin size={14} /> {trip.destination}
                      <small>{trip.purpose}</small>
                    </td>
                    <td>
                      <strong>
                        {formatNumber(trip.odometerStart)} →{" "}
                        {trip.odometerEnd
                          ? formatNumber(trip.odometerEnd)
                          : "Pending"}
                      </strong>
                      <small>
                        Condition:{" "}
                        {fleetStatusLabel(
                          trip.conditionAfter ?? trip.conditionBefore,
                        )}
                      </small>
                      {(trip.odometerPhotoBefore || trip.odometerPhotoAfter) && (
                        <span className="trip-evidence">
                          {trip.odometerPhotoBefore && <a href={trip.odometerPhotoBefore} target="_blank" rel="noreferrer">Before photo</a>}
                          {trip.odometerPhotoAfter && <a href={trip.odometerPhotoAfter} target="_blank" rel="noreferrer">After photo</a>}
                        </span>
                      )}
                    </td>
                    <td>
                      <strong>
                        {trip.odometerEnd == null
                          ? "—"
                          : `${formatNumber(trip.odometerEnd - trip.odometerStart)} km`}
                      </strong>
                    </td>
                    <td>
                      <span
                        className={`status-badge ${trip.status.toLowerCase().replaceAll("_", "-")}`}
                      >
                        {fleetStatusLabel(trip.status)}
                      </span>
                      {trip.status === "IN_PROGRESS" && (
                        <button
                          className="table-return"
                          onClick={() => {
                            setSelectedVehicleId(trip.vehicleId);
                            setDialog("complete");
                          }}
                        >
                          Complete
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </section>
      {fleetDialog}
    </>
  );
}

function VehicleRegistryPage({ showNotice }: { showNotice: (message: string) => void }) {
  const fallback = makeFallbackFleet();
  const [vehicles, setVehicles] = useState<Vehicle[]>(fallback.vehicles);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Vehicle | null | undefined>(undefined);
  const [removing, setRemoving] = useState<Vehicle | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const refresh = async () => {
    try {
      const rows = await api.getVehicles();
      setVehicles(rows);
    } catch {
      setVehicles(fallback.vehicles);
    }
  };

  useEffect(() => { void refresh(); }, []);

  const visible = vehicles.filter((vehicle) =>
    `${vehicle.plate} ${vehicle.model} ${vehicle.category} ${vehicle.assigned}`.toLowerCase().includes(query.toLowerCase()),
  );
  const serviceAttention = vehicles.filter((vehicle) => vehicle.status === "SERVICE_DUE" || vehicle.status === "OUT_OF_SERVICE").length;

  const editor = editing !== undefined ? createPortal(
    <div className="fleet-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditing(undefined); }}>
      <section className="fleet-dialog" role="dialog" aria-modal="true" aria-label={editing ? "Edit vehicle" : "Register vehicle"}>
        <header><div><span>{editing?.plate ?? "Fleet registry"}</span><strong>{editing ? "Edit vehicle details" : "Register a new vehicle"}</strong></div><button onClick={() => setEditing(undefined)} aria-label="Close"><X size={19} /></button></header>
        <VehicleForm vehicle={editing ?? undefined} onSubmit={async (input) => {
          const saved = editing ? await api.updateVehicle(editing.id, input) : await api.createVehicle(input);
          await refresh();
          showNotice(editing ? `${saved.plate} was updated.` : `${saved.plate} was added to the vehicle registry.`);
          setEditing(undefined);
        }} />
      </section>
    </div>, document.body,
  ) : null;

  const removalDialog = removing ? createPortal(
    <div className="fleet-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setRemoving(null); }}>
      <section className="fleet-dialog confirm-dialog" role="dialog" aria-modal="true" aria-label="Remove vehicle">
        <header><div><span>{removing.plate}</span><strong>Remove vehicle from active registry?</strong></div><button onClick={() => setRemoving(null)} aria-label="Close" disabled={busy}><X size={19} /></button></header>
        <div className="confirm-dialog-body">
          <span className="danger-icon"><Trash2 size={25} /></span>
          <div><h3>{removing.model}</h3><p>This vehicle will disappear from the active fleet and cannot start new trips. Its previous journeys, mileage evidence and audit history will be retained.</p></div>
          {removing.activeTrip && <div className="form-error span-all"><CircleAlert size={16} />Return the active trip before removing this vehicle.</div>}
          {error && <div className="form-error span-all"><CircleAlert size={16} />{error}</div>}
          <footer><button className="button button-secondary" onClick={() => setRemoving(null)} disabled={busy}>Cancel</button><button className="button button-danger" disabled={busy || Boolean(removing.activeTrip)} onClick={async () => {
            try {
              setBusy(true); setError("");
              await api.removeVehicle(removing.id);
              await refresh();
              showNotice(`${removing.plate} was removed from the active vehicle registry. Trip history was retained.`);
              setRemoving(null);
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : "Unable to remove this vehicle.");
            } finally { setBusy(false); }
          }}><Trash2 size={16} />{busy ? "Removing…" : "Remove vehicle"}</button></footer>
        </div>
      </section>
    </div>, document.body,
  ) : null;

  return <>
    <section className="page-stack">
      <div className="module-intro fleet-intro registry-intro"><div><span className="module-kicker"><CarFront size={15} /> Vehicle registry</span><h2>Every company car, properly documented.</h2><p>Maintain vehicle identity, photos, ownership, odometer readings, service limits and operational availability in one place.</p></div><button className="button button-light" onClick={() => setEditing(null)}><Plus size={17} /> Register vehicle</button></div>
      <div className="metric-grid compact-metrics">
        <MetricCard icon={CarFront} label="Active registry" value={String(vehicles.length)} detail="Company vehicles" tone="burgundy" />
        <MetricCard icon={CheckCircle2} label="Available" value={String(vehicles.filter((item) => item.status === "AVAILABLE").length)} detail="Ready for a trip" tone="green" />
        <MetricCard icon={Route} label="In use" value={String(vehicles.filter((item) => item.status === "IN_USE").length)} detail="Live check-outs" tone="blue" />
        <MetricCard icon={Wrench} label="Attention" value={String(serviceAttention)} detail="Service or unavailable" tone="violet" />
      </div>
      <div className="page-toolbar registry-toolbar"><label className="search-field"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search registration, model, category or owner" /></label><button className="button button-primary" onClick={() => setEditing(null)}><Plus size={16} /> Add vehicle</button></div>
      <section className="card registry-section"><SectionHeader kicker="Fleet master data" title="Registered vehicles" />
        <div className="registry-card-grid">
          {visible.map((vehicle) => <article className="registry-vehicle-card" key={vehicle.id}>
            <div className="registry-vehicle-photo">{vehicle.photo ? <img src={vehicle.photo} alt={`${vehicle.plate} ${vehicle.model}`} /> : <span><CarFront size={34} /><small>Photo not added</small></span>}<em className={vehicle.status.toLowerCase().replaceAll("_", "-")}>{fleetStatusLabel(vehicle.status)}</em></div>
            <div className="registry-vehicle-copy"><div><span>{vehicle.category}</span><h3>{vehicle.plate}</h3><p>{vehicle.model}</p></div><dl><div><dt>Current odometer</dt><dd>{formatNumber(vehicle.mileage)} km</dd></div><div><dt>Next service</dt><dd>{formatNumber(vehicle.serviceAt)} km</dd></div><div><dt>Pool / owner</dt><dd>{vehicle.assigned}</dd></div></dl><footer><button className="button button-secondary" onClick={() => setEditing(vehicle)}><Pencil size={15} /> Edit details</button><button className="button button-danger-outline" onClick={() => { setError(""); setRemoving(vehicle); }}><Trash2 size={15} /> Remove</button></footer></div>
          </article>)}
          {!visible.length && <div className="registry-empty"><Search size={27} /><strong>No vehicle matched that search</strong><p>Try a plate number, model, category or assigned pool.</p></div>}
        </div>
      </section>
    </section>
    {editor}
    {removalDialog}
  </>;
}

function VehicleForm({
  vehicle,
  onSubmit,
}: {
  vehicle?: Vehicle;
  onSubmit: (input: VehicleInput) => Promise<void>;
}) {
  const [plate, setPlate] = useState(vehicle?.plate ?? "");
  const [model, setModel] = useState(vehicle?.model ?? "");
  const [category, setCategory] = useState(vehicle?.category ?? "Operations");
  const [assigned, setAssigned] = useState(vehicle?.assigned ?? "Shared pool");
  const [photo, setPhoto] = useState<string | null>(vehicle?.photo ?? null);
  const [mileage, setMileage] = useState(vehicle?.mileage ?? 0);
  const [serviceAt, setServiceAt] = useState(vehicle?.serviceAt ?? 10000);
  const [status, setStatus] = useState<VehicleInput["status"]>(
    vehicle?.status === "SERVICE_DUE" || vehicle?.status === "OUT_OF_SERVICE"
      ? vehicle.status
      : "AVAILABLE",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const hasActiveTrip = Boolean(
    vehicle?.activeTrip || vehicle?.status === "IN_USE",
  );

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (serviceAt < mileage && status === "AVAILABLE") {
      setError(
        "A vehicle past its service target cannot be marked available. Choose Service due or set a later service mileage.",
      );
      return;
    }
    try {
      setBusy(true);
      await onSubmit({
        plate,
        model,
        category,
        assigned,
        mileage,
        serviceAt,
        status,
        photo,
      });
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to save this vehicle.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="fleet-form vehicle-registry-form" onSubmit={submit}>
      <div className="registry-note">
        <CarFront size={22} />
        <div>
          <strong>
            {vehicle
              ? "Keep the fleet record accurate"
              : "Add this vehicle to the shared fleet"}
          </strong>
          <small>
            The registration number appears on the QR label and every usage
            record.
          </small>
        </div>
      </div>
      <VehiclePhotoField photo={photo} onChange={setPhoto} />
      <div className="form-grid">
        <label className="field">
          <span>Registration / plate number</span>
          <input
            value={plate}
            onChange={(event) => setPlate(event.target.value.toUpperCase())}
            placeholder="e.g. BKV 9132"
            required
            maxLength={20}
          />
        </label>
        <label className="field">
          <span>Make & model</span>
          <input
            value={model}
            onChange={(event) => setModel(event.target.value)}
            placeholder="e.g. Toyota Hilux 2.4"
            required
          />
        </label>
        <label className="field">
          <span>Vehicle category</span>
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            <option>Operations</option>
            <option>Management</option>
            <option>Staff transport</option>
            <option>Logistics</option>
            <option>Maintenance</option>
            <option>Other</option>
          </select>
        </label>
        <label className="field">
          <span>Assigned pool / owner</span>
          <input
            value={assigned}
            onChange={(event) => setAssigned(event.target.value)}
            placeholder="e.g. Shared pool or Warehouse"
            required
          />
        </label>
        <label className="field">
          <span>Current odometer (km)</span>
          <input
            type="number"
            min="0"
            value={mileage}
            onChange={(event) => setMileage(Number(event.target.value))}
            required
          />
        </label>
        <label className="field">
          <span>Next service at (km)</span>
          <input
            type="number"
            min="0"
            value={serviceAt}
            onChange={(event) => setServiceAt(Number(event.target.value))}
            required
          />
        </label>
        <label className="field span-2">
          <span>Operational status</span>
          <select
            value={hasActiveTrip ? "IN_USE" : status}
            disabled={hasActiveTrip}
            onChange={(event) =>
              setStatus(event.target.value as VehicleInput["status"])
            }
          >
            <option value="AVAILABLE">Available for use</option>
            {hasActiveTrip && (
              <option value="IN_USE">In use · controlled by active trip</option>
            )}
            <option value="SERVICE_DUE">Service due · block new trips</option>
            <option value="OUT_OF_SERVICE">
              Out of service · block new trips
            </option>
          </select>
          {hasActiveTrip && (
            <small className="field-help">
              This status stays “In use” until the active trip is returned.
            </small>
          )}
        </label>
      </div>
      {error && (
        <div className="form-error">
          <CircleAlert size={16} />
          {error}
        </div>
      )}
      <footer className="fleet-form-actions">
        <span>
          <ShieldCheck size={16} /> Vehicle details are stored in the fleet
          registry and linked to its QR code.
        </span>
        <button className="button button-primary" disabled={busy}>
          {busy ? (
            "Saving…"
          ) : (
            <>
              <CheckCircle2 size={16} />{" "}
              {vehicle ? "Save vehicle changes" : "Register vehicle"}
            </>
          )}
        </button>
      </footer>
    </form>
  );
}

function StartTripForm({
  vehicles,
  selectedVehicleId,
  onVehicleChange,
  onSubmit,
}: {
  vehicles: Vehicle[];
  selectedVehicleId: string;
  onVehicleChange: (id: string) => void;
  onSubmit: (
    input: Parameters<typeof api.startVehicleTrip>[0],
  ) => Promise<void>;
}) {
  const vehicle = vehicles.find((item) => item.id === selectedVehicleId)!;
  const [employeeId, setEmployeeId] = useState(
    employeeTrainingRows[0]?.id ?? "",
  );
  const [destination, setDestination] = useState("");
  const [purpose, setPurpose] = useState("");
  const [passengers, setPassengers] = useState(1);
  const [odometer, setOdometer] = useState(vehicle.mileage);
  const [odometerPhoto, setOdometerPhoto] = useState("");
  const [fuel, setFuel] = useState(75);
  const [condition, setCondition] = useState<VehicleCondition>("GOOD");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [checks, setChecks] = useState({
    exterior: false,
    tyres: false,
    lights: false,
    documents: false,
  });
  useEffect(() => {
    setOdometer(vehicle.mileage);
  }, [vehicle.id, vehicle.mileage]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (!odometerPhoto) {
      setError(
        "Take a clear photo of the ODO display before starting the trip.",
      );
      return;
    }
    if (!Object.values(checks).every(Boolean)) {
      setError("Complete every required before-drive check.");
      return;
    }
    const employee = employeeTrainingRows.find(
      (person) => person.id === employeeId,
    );
    if (!employee) return;
    try {
      setBusy(true);
      await onSubmit({
        vehicleId: vehicle.id,
        driverEmployeeId: employee.id,
        driverName: employee.name,
        destination,
        purpose,
        passengers,
        odometerStart: odometer,
        odometerPhotoBefore: odometerPhoto,
        fuelBefore: fuel,
        conditionBefore: condition,
        checksBefore: checks,
        notesBefore: notes,
      });
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to start this trip.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="fleet-form" onSubmit={submit}>
      <div className="fleet-form-step">
        <span>1</span>
        <div>
          <strong>Journey information</strong>
          <small>Who is driving and where the vehicle is going.</small>
        </div>
      </div>
      <div className="form-grid">
        <label className="field">
          <span>Vehicle</span>
          <select
            value={vehicle.id}
            onChange={(event) => onVehicleChange(event.target.value)}
          >
            {vehicles
              .filter(
                (item) => item.status === "AVAILABLE" || item.id === vehicle.id,
              )
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.plate} · {item.model}
                </option>
              ))}
          </select>
        </label>
        <label className="field">
          <span>Driver</span>
          <select
            value={employeeId}
            onChange={(event) => setEmployeeId(event.target.value)}
          >
            {employeeTrainingRows.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name} · {person.id}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Destination</span>
          <input
            value={destination}
            onChange={(event) => setDestination(event.target.value)}
            placeholder="e.g. Shah Alam"
            required
          />
        </label>
        <label className="field">
          <span>Purpose</span>
          <input
            value={purpose}
            onChange={(event) => setPurpose(event.target.value)}
            placeholder="e.g. Supplier meeting"
            required
          />
        </label>
        <label className="field">
          <span>People in vehicle</span>
          <input
            type="number"
            min="1"
            max="20"
            value={passengers}
            onChange={(event) => setPassengers(Number(event.target.value))}
            required
          />
        </label>
        <label className="field">
          <span>Starting odometer (km)</span>
          <input
            type="number"
            min={vehicle.mileage}
            value={odometer}
            onChange={(event) => setOdometer(Number(event.target.value))}
            required
          />
        </label>
      </div>
      <OdometerPhotoField
        minimumMileage={vehicle.mileage}
        photo={odometerPhoto}
        onPhoto={setOdometerPhoto}
        onMileage={setOdometer}
      />
      <div className="fleet-form-step">
        <span>2</span>
        <div>
          <strong>Before-drive condition</strong>
          <small>Confirm the vehicle is safe before leaving.</small>
        </div>
      </div>
      <div className="inspection-grid">
        {[
          {
            key: "exterior",
            label: "Body & exterior",
            detail: "No new damage or obstruction",
          },
          {
            key: "tyres",
            label: "Tyres & wheels",
            detail: "Inflated with no visible damage",
          },
          {
            key: "lights",
            label: "Lights & signals",
            detail: "Headlights, brake lights and signals work",
          },
          {
            key: "documents",
            label: "Documents & equipment",
            detail: "Road tax, insurance and safety kit present",
          },
        ].map((item) => (
          <label
            key={item.key}
            className={checks[item.key as keyof typeof checks] ? "checked" : ""}
          >
            <input
              type="checkbox"
              checked={checks[item.key as keyof typeof checks]}
              onChange={(event) =>
                setChecks((current) => ({
                  ...current,
                  [item.key]: event.target.checked,
                }))
              }
            />
            <span>
              <Check size={15} />
            </span>
            <div>
              <strong>{item.label}</strong>
              <small>{item.detail}</small>
            </div>
          </label>
        ))}
      </div>
      <div className="form-grid inspection-fields">
        <label className="field">
          <span>Vehicle condition</span>
          <select
            value={condition}
            onChange={(event) =>
              setCondition(event.target.value as VehicleCondition)
            }
          >
            <option value="GOOD">Good · cleared to drive</option>
            <option value="ATTENTION_REQUIRED">Attention required</option>
            <option value="UNSAFE">Unsafe · do not drive</option>
          </select>
        </label>
        <label className="field fuel-field">
          <span>
            Fuel before drive <strong>{fuel}%</strong>
          </span>
          <input
            type="range"
            min="0"
            max="100"
            step="5"
            value={fuel}
            onChange={(event) => setFuel(Number(event.target.value))}
          />
        </label>
        <label className="field span-2">
          <span>Existing damage / notes</span>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Record scratches, warning lights or other observations before driving."
            rows={3}
          />
        </label>
      </div>
      {error && (
        <div className="form-error">
          <CircleAlert size={16} />
          {error}
        </div>
      )}
      <footer className="fleet-form-actions">
        <span>
          <ShieldCheck size={16} /> Submitted checks are time-stamped in the
          trip record.
        </span>
        <button
          className="button button-primary"
          disabled={busy || condition === "UNSAFE"}
        >
          {busy ? (
            "Starting…"
          ) : (
            <>
              <CarFront size={16} /> Confirm & start trip
            </>
          )}
        </button>
      </footer>
    </form>
  );
}

function CompleteTripForm({
  vehicle,
  trip,
  onSubmit,
}: {
  vehicle: Vehicle;
  trip: VehicleTrip;
  onSubmit: (
    input: Parameters<typeof api.completeVehicleTrip>[1],
  ) => Promise<void>;
}) {
  const [odometer, setOdometer] = useState(
    Math.max(vehicle.mileage, trip.odometerStart),
  );
  const [odometerPhoto, setOdometerPhoto] = useState("");
  const [fuel, setFuel] = useState(50);
  const [condition, setCondition] = useState<VehicleCondition>("GOOD");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [checks, setChecks] = useState({
    interiorClean: false,
    fuelCardReturned: false,
    belongingsRemoved: false,
    damageReported: false,
  });
  const distance = Math.max(0, odometer - trip.odometerStart);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (!odometerPhoto) {
      setError(
        "Take a clear photo of the ODO display before completing the return.",
      );
      return;
    }
    if (
      !checks.interiorClean ||
      !checks.fuelCardReturned ||
      !checks.belongingsRemoved
    ) {
      setError("Complete every required return check.");
      return;
    }
    try {
      setBusy(true);
      await onSubmit({
        odometerEnd: odometer,
        odometerPhotoAfter: odometerPhoto,
        fuelAfter: fuel,
        conditionAfter: condition,
        checksAfter: checks,
        notesAfter: notes,
      });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to complete this trip.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="fleet-form" onSubmit={submit}>
      <div className="return-summary">
        <span>
          <Route size={21} />
        </span>
        <div>
          <strong>{trip.driverName}</strong>
          <small>
            {trip.purpose} · {trip.destination}
          </small>
        </div>
        <em>
          Started{" "}
          {new Date(trip.startedAt).toLocaleString("en-MY", {
            day: "2-digit",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </em>
      </div>
      <div className="fleet-form-step">
        <span>1</span>
        <div>
          <strong>Return mileage & fuel</strong>
          <small>
            The ending odometer automatically calculates total distance.
          </small>
        </div>
      </div>
      <div className="form-grid">
        <label className="field">
          <span>Starting odometer</span>
          <input value={`${formatNumber(trip.odometerStart)} km`} disabled />
        </label>
        <label className="field">
          <span>Ending odometer (km)</span>
          <input
            type="number"
            min={trip.odometerStart}
            value={odometer}
            onChange={(event) => setOdometer(Number(event.target.value))}
            required
          />
        </label>
        <div className="distance-result">
          <span>Trip distance</span>
          <strong>{formatNumber(distance)} km</strong>
        </div>
        <label className="field fuel-field">
          <span>
            Fuel after drive <strong>{fuel}%</strong>
          </span>
          <input
            type="range"
            min="0"
            max="100"
            step="5"
            value={fuel}
            onChange={(event) => setFuel(Number(event.target.value))}
          />
        </label>
      </div>
      <OdometerPhotoField
        minimumMileage={trip.odometerStart}
        photo={odometerPhoto}
        onPhoto={setOdometerPhoto}
        onMileage={setOdometer}
      />
      <div className="fleet-form-step">
        <span>2</span>
        <div>
          <strong>After-drive inspection</strong>
          <small>
            Leave the vehicle ready and report any change in condition.
          </small>
        </div>
      </div>
      <div className="inspection-grid return-checks">
        {[
          {
            key: "interiorClean",
            label: "Interior clean",
            detail: "Cabin and load area left tidy",
          },
          {
            key: "fuelCardReturned",
            label: "Keys & fuel card returned",
            detail: "Returned to the designated location",
          },
          {
            key: "belongingsRemoved",
            label: "Personal items removed",
            detail: "No belongings left in the vehicle",
          },
          {
            key: "damageReported",
            label: "New damage / issue found",
            detail: "Selecting this flags the vehicle for attention",
          },
        ].map((item) => (
          <label
            key={item.key}
            className={
              checks[item.key as keyof typeof checks]
                ? `checked ${item.key === "damageReported" ? "attention" : ""}`
                : ""
            }
          >
            <input
              type="checkbox"
              checked={checks[item.key as keyof typeof checks]}
              onChange={(event) =>
                setChecks((current) => ({
                  ...current,
                  [item.key]: event.target.checked,
                }))
              }
            />
            <span>
              <Check size={15} />
            </span>
            <div>
              <strong>{item.label}</strong>
              <small>{item.detail}</small>
            </div>
          </label>
        ))}
      </div>
      <div className="form-grid inspection-fields">
        <label className="field">
          <span>Condition after drive</span>
          <select
            value={condition}
            onChange={(event) =>
              setCondition(event.target.value as VehicleCondition)
            }
          >
            <option value="GOOD">Good · ready for next user</option>
            <option value="ATTENTION_REQUIRED">Attention required</option>
            <option value="UNSAFE">Unsafe · remove from service</option>
          </select>
        </label>
        <label className="field span-2">
          <span>Return notes</span>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Record refuelling, damage, warning lights, cleanliness or maintenance concerns."
            rows={3}
          />
        </label>
      </div>
      {error && (
        <div className="form-error">
          <CircleAlert size={16} />
          {error}
        </div>
      )}
      <footer className="fleet-form-actions">
        <span>
          <ClipboardCheck size={16} /> The vehicle status will update from this
          return check.
        </span>
        <button className="button button-primary" disabled={busy}>
          {busy ? (
            "Completing…"
          ) : (
            <>
              <CheckCircle2 size={16} /> Complete return
            </>
          )}
        </button>
      </footer>
    </form>
  );
}

function VehicleQr({ vehicle }: { vehicle: Vehicle }) {
  const [image, setImage] = useState("");
  const url = `${window.location.origin}/?vehicle=${encodeURIComponent(vehicle.id)}&action=start`;
  useEffect(() => { void QRCode.toDataURL(url, { width: 420, margin: 2, color: { dark: "#101112", light: "#ffffff" }, errorCorrectionLevel: "H" }).then(setImage); }, [url]);
  return <div className="vehicle-qr"><div className="qr-sheet"><img className="qr-company" src="/sgi-logo.png" alt="Sugihara Grand Industries" /><span>Company vehicle access</span><strong>{vehicle.plate}</strong><small>{vehicle.model}</small>{image ? <img className="qr-code" src={image} alt={`QR code for ${vehicle.plate}`} /> : <div className="qr-loading">Generating QR…</div>}<p>Scan before taking this vehicle.<br />Complete the return check after driving.</p><em>{vehicle.id}</em></div><div className="qr-actions"><a className="button button-primary" href={image} download={`HR-Digital-${vehicle.plate.replaceAll(" ", "-")}-QR.png`}><Download size={16} /> Download QR</a><button className="button button-secondary" onClick={() => navigator.clipboard?.writeText(url)}><QrCode size={16} /> Copy link</button></div><p className="qr-help"><ShieldCheck size={16} /> Print and place this QR inside the vehicle. It always opens the secured HR Digital trip form for this vehicle.</p></div>;
}

function Avatar({ initials }: { initials: string }) { return <span className="avatar">{initials}</span>; }
export default App;
