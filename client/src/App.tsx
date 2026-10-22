import { FormEvent, useEffect, useLayoutEffect, useRef, useState } from "react";
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
import { VehicleDriverPicker, type TripDriver } from "./VehicleDriverPicker";
import { EmployeeImportPreview as ImportPreview } from "./EmployeeImportPreview";
import { EmployeeDirectory } from "./EmployeeDirectory";
import { EmployeeEmailImport } from "./EmployeeEmailImport";
import { TrainingAttendance } from "./TrainingAttendance";
import { TrainingDeleteButton } from "./TrainingDeleteButton";
import { TrainingCalendar } from "./TrainingCalendar";
import { EmailAutomation } from "./EmailAutomation";
import { TrainingPlanner } from "./TrainingPlanner";
import { malaysiaDate } from "./calendar-utils";
import { toCalendarSession } from "./training-data";
import type { Employee } from "./types";
import {
  employeeTrainingRows, notesLibrary,
  vehicleTrips as fallbackVehicleTrips,
  vehicles as fallbackVehicles, type CalendarSession
} from "./portal-data";

type View = "overview" | "employees" | "training-overview" | "training-calendar" |
  "training-planner" | "training-records" | "email-automation" | "notes-library" | "fleet" | "fleet-registry" | "usage-history" | "administration";

const viewMeta: Record<View, { title: string; eyebrow: string }> = {
  overview: { title: "Dashboard", eyebrow: "HR Digital" },
  employees: { title: "Employees", eyebrow: "People" },
  "training-overview": { title: "Training overview", eyebrow: "Learning & development" },
  "training-calendar": { title: "Training calendar", eyebrow: "Learning & development" },
  "training-planner": { title: "Plan training", eyebrow: "Learning & development" },
  "training-records": { title: "Employee training records", eyebrow: "Learning & development" },
  "email-automation": { title: "Email automation", eyebrow: "Learning & development" },
  "notes-library": { title: "Training notes library", eyebrow: "Learning & development" },
  fleet: { title: "Car usage", eyebrow: "Company cars" },
  "fleet-registry": { title: "Manage cars", eyebrow: "Company cars" },
  "usage-history": { title: "Trip history", eyebrow: "Company cars" },
  administration: { title: "Settings", eyebrow: "HR Digital" }
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
  { id: "fleet", label: "Car usage", icon: Route },
  { id: "fleet-registry", label: "Manage cars", icon: CarFront },
  { id: "usage-history", label: "Trip history", icon: Clock3 }
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

const notificationFeed: Array<{ title: string; detail: string; time: string }> = [];

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
  const vehicleId = new URLSearchParams(window.location.search).get("vehicle");
  return vehicleId ? <VehicleUsagePage vehicleId={vehicleId} /> : <AdminApp />;
}

function AdminApp() {
  const initialVehicleId = new URLSearchParams(window.location.search).get("vehicle") ?? undefined;
  const [activeView, setActiveView] = useState<View>(initialVehicleId ? "fleet" : "overview");
  const [trainingOpen, setTrainingOpen] = useState(false);
  const [fleetOpen, setFleetOpen] = useState(Boolean(initialVehicleId));
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [dashboard, setDashboard] = useState<DashboardSummary | null>(null);
  const [calendarSessions, setCalendarSessions] = useState<CalendarSession[]>([]);
  const [selectedDate, setSelectedDate] = useState(malaysiaDate);
  const [notice, setNotice] = useState("");
  const [historyVehicleId, setHistoryVehicleId] = useState<string | null>(null);
  const workspaceRef = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    if (workspaceRef.current) workspaceRef.current.scrollTop = 0;
  }, [activeView]);

  const [trainingError, setTrainingError] = useState("");
  const [trainingLoading, setTrainingLoading] = useState(true);
  const loadTraining = async () => {
    setTrainingLoading(true); setTrainingError("");
    try { setCalendarSessions((await api.getSessions()).map((session) => toCalendarSession(session))); }
    catch { setTrainingError("Training could not be loaded. Check the server connection and retry."); }
    finally { setTrainingLoading(false); }
  };
  useEffect(() => { api.getDashboard().then(setDashboard).catch(() => setDashboard(null)); void loadTraining(); }, []);
  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(""), 3600);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const navigate = (view: View) => {
    setActiveView(view);
    setMobileNavOpen(false);
    if (view.startsWith("training") || view === "email-automation" || view === "notes-library") setTrainingOpen(true);
    if (view === "fleet" || view === "fleet-registry" || view === "usage-history") setFleetOpen(true);
  };

  const deleteTraining = async (id: string) => {
    await api.deleteTrainingSession(id);
    setCalendarSessions(current => current.filter(session => session.id !== id));
    setNotice("Training deleted. Pending emails were cancelled.");
    api.getDashboard().then(setDashboard).catch(() => setDashboard(null));
  };

  const openHistory = (vehicleId: string) => {
    setHistoryVehicleId(vehicleId);
    navigate("usage-history");
  };

  return (
    <div className="app-shell">
      <Sidebar activeView={activeView} trainingOpen={trainingOpen} fleetOpen={fleetOpen} mobileOpen={mobileNavOpen}
        onTrainingToggle={() => setTrainingOpen((open) => !open)} onFleetToggle={() => setFleetOpen((open) => !open)} onNavigate={navigate} onClose={() => setMobileNavOpen(false)} />
      <main className="workspace" ref={workspaceRef}>
        <Topbar meta={viewMeta[activeView]} onMenu={() => setMobileNavOpen(true)}
          onSettings={() => navigate("administration")} showNotice={setNotice} />
        <div className="page-stage" key={activeView}>
          {activeView.startsWith("training") && (trainingLoading ? <p className="training-empty" role="status">Loading training…</p> : trainingError ? <div className="form-error" role="alert">{trainingError}<button type="button" onClick={() => { void loadTraining(); }}>Retry</button></div> : null)}
          {activeView === "overview" && <Overview dashboard={dashboard} sessions={calendarSessions} navigate={navigate} />}
          {activeView === "employees" && <EmployeesDatabase showNotice={setNotice} />}
          {activeView === "training-overview" && <TrainingOverview dashboard={dashboard} sessions={calendarSessions} navigate={navigate} />}
          {activeView === "training-calendar" && <TrainingCalendar sessions={calendarSessions} selectedDate={selectedDate} setSelectedDate={setSelectedDate} navigate={navigate} onDelete={deleteTraining} onRefresh={() => { void loadTraining(); api.getDashboard().then(setDashboard).catch(() => {}); }} />}
          {activeView === "training-planner" && <TrainingPlanner initialDate={selectedDate} onCreate={(session, message) => {
            setCalendarSessions((current) => [...current, session]); setSelectedDate(session.date);
            setNotice(message); setTrainingError(""); api.getDashboard().then(setDashboard).catch(() => {}); navigate("training-calendar");
          }} />}
          {activeView === "training-records" && <TrainingRecords sessions={calendarSessions} onDelete={deleteTraining} onRefresh={() => { void loadTraining(); api.getDashboard().then(setDashboard).catch(() => {}); }} />}
          {activeView === "email-automation" && <EmailAutomation showNotice={setNotice} />}
          {activeView === "notes-library" && <NotesLibrary showNotice={setNotice} />}
          {activeView === "fleet" && <FleetTracker showNotice={setNotice} initialVehicleId={initialVehicleId} onOpenRegistry={() => navigate("fleet-registry")} onOpenHistory={openHistory} />}
          {activeView === "fleet-registry" && <VehicleRegistryPage showNotice={setNotice} onOpenHistory={openHistory} />}
          {activeView === "usage-history" && <UsageHistory initialVehicleId={historyVehicleId} />}
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
        <img className="company-brand" src="/sugihara-mark.png" alt="Sugihara Grand Industries" />
        <div className="product-name"><strong>HR Digital</strong><span>HR management</span></div>
        <button className="sidebar-close" onClick={onClose} aria-label="Close navigation"><X size={20} /></button>
      </div>
      <nav className="primary-nav" aria-label="Primary navigation">
        <NavButton icon={LayoutDashboard} label="Dashboard" active={activeView === "overview"} onClick={() => onNavigate("overview")} />
        <NavButton icon={UsersRound} label="Employees" active={activeView === "employees"} onClick={() => onNavigate("employees")} />
        <button className={`nav-item nav-parent ${inTraining ? "active-parent" : ""}`} onClick={onTrainingToggle} aria-expanded={trainingOpen} aria-controls="training-navigation">
          <span className="nav-icon"><BookOpenCheck size={18} /></span><span>Training</span><ChevronDown className={trainingOpen ? "rotate" : ""} size={16} />
        </button>
        <div id="training-navigation" className={`nav-children ${trainingOpen ? "open" : ""}`} inert={!trainingOpen}>
          <div className="nav-children-content">
          {trainingNav.map((item) => <button key={item.id} className={`nav-child ${activeView === item.id ? "active" : ""}`} onClick={() => onNavigate(item.id)}>
            <item.icon size={15} /><span>{item.label}</span></button>)}
          </div>
        </div>
        <button className={`nav-item nav-parent ${inFleet ? "active-parent" : ""}`} onClick={onFleetToggle} aria-expanded={fleetOpen} aria-controls="car-navigation">
          <span className="nav-icon"><CarFront size={18} /></span><span>Company cars</span><ChevronDown className={fleetOpen ? "rotate" : ""} size={16} />
        </button>
        <div id="car-navigation" className={`nav-children fleet-children ${fleetOpen ? "open" : ""}`} inert={!fleetOpen}>
          <div className="nav-children-content">
          {fleetNav.map((item) => <button key={item.id} className={`nav-child ${activeView === item.id ? "active" : ""}`} onClick={() => onNavigate(item.id)}>
            <item.icon size={15} /><span>{item.label}</span></button>)}
          </div>
        </div>
        <NavButton icon={Settings2} label="Settings" active={activeView === "administration"} onClick={() => onNavigate("administration")} />
      </nav>
      <div className="sidebar-footer">
        <span className="copyright"><span className="copyright-badge">©</span><span>Digital Transformation Unit</span></span>
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
    const delivered = await showSystemNotification("HR Digital", "Notifications are working on this device.");
    showNotice(delivered ? "Test notification sent successfully." : "The browser could not display the test notification.");
  };

  return <header className="topbar"><div className="topbar-title"><button className="mobile-menu" onClick={onMenu} aria-label="Open navigation"><Menu size={20} /></button><div><p>{meta.eyebrow}</p><h1>{meta.title}</h1></div></div><div className="topbar-actions"><span className="today-label">{new Intl.DateTimeFormat("en-MY", { timeZone: "Asia/Kuala_Lumpur", weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(new Date())}</span><div className="topbar-notifications"><button className={`topbar-icon ${notificationsOpen ? "active" : ""}`} onClick={() => { setPermission(getNotificationPermission()); setNotificationsOpen((open) => !open); }} aria-label="Notifications" aria-expanded={notificationsOpen}><Bell size={18} /><i /></button>{notificationsOpen && <section className="notification-panel" role="dialog" aria-label="Notification centre"><header><div><strong>Notifications</strong><span>{permission === "granted" ? "Device alerts active" : "Device alerts need permission"}</span></div><button onClick={() => setNotificationsOpen(false)} aria-label="Close notifications"><X size={16} /></button></header><div className={`notification-permission ${permission}`}><Bell size={17} /><div><strong>{permission === "granted" ? "PC & PWA notifications are on" : permission === "denied" ? "Notifications are blocked" : permission === "unsupported" ? "Notifications unavailable" : "Enable alerts on this device"}</strong><span>{permission === "granted" ? "Alerts can appear even when HR Digital is installed as an app." : permission === "denied" ? "Open this site's browser settings and change Notifications to Allow." : permission === "unsupported" ? "Use a current version of Chrome, Edge or another compatible browser." : "Allow training, employee and vehicle reminders to appear on your PC."}</span></div>{permission === "granted" ? <button onClick={sendTestNotification}>Test</button> : permission === "default" ? <button onClick={enableNotifications}>Enable</button> : null}</div><div className="notification-feed">{notificationFeed.map((item, index) => <article key={item.title}><span className={index === 0 ? "unread" : ""}><Bell size={15} /></span><div><strong>{item.title}</strong><p>{item.detail}</p></div><time>{item.time}</time></article>)}</div></section>}</div><button className="topbar-icon" onClick={onSettings} aria-label="Settings"><Settings2 size={18} /></button><div className="user-chip"><span>SA</span><div><strong>System Admin</strong><small>HR operations</small></div></div></div></header>;
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
    <div className="module-intro admin-intro"><div><span className="module-kicker"><LockKeyhole size={15} /> Restricted administration</span><h2>Manage HR Digital settings</h2><p>Update company details, email reminders, uploads and access settings.</p></div><span className="admin-access"><ShieldCheck size={17} /> Full access</span></div>
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
  const today = malaysiaDate();
  const upcoming = sessions.filter((session) => session.date >= today).sort((a,b) => a.date.localeCompare(b.date)).slice(0, 4);
  return <section className="page-stack"><article className="hero-card"><div className="hero-glow" /><div className="hero-copy"><p className="live-label">HR operations</p><h2>Good day, <em>HR team.</em></h2><p>Manage employees, training and company cars.</p><div className="hero-actions"><button className="button button-light" onClick={() => navigate("training-planner")}><Plus size={17} />Plan training</button><button className="button button-ghost" onClick={() => navigate("training-calendar")}><CalendarDays size={17} />Open calendar</button></div></div></article>
    <div className="metric-grid"><MetricCard icon={UsersRound} label="Active employees" value={stats?.activeEmployees ?? "—"} detail={stats ? stats.departments + " departments" : "Waiting for server"} tone="burgundy" onClick={() => navigate("employees")} /><MetricCard icon={GraduationCap} label="Training hours" value={stats?.totalTrainingHours ?? "—"} detail="Completed training records" tone="blue" /><MetricCard icon={CalendarCheck2} label="Saved sessions" value={stats?.sessions ?? "—"} detail="Training calendar" tone="violet" onClick={() => navigate("training-calendar")} /><MetricCard icon={ClipboardCheck} label="Completed records" value={stats?.completedRecords ?? "—"} detail="Saved attendance records" tone="green" onClick={() => navigate("training-records")} /></div>
    <div className="content-grid overview-grid"><section className="card"><SectionHeader kicker="Training" title="Training hours by department" action="View records" onAction={() => navigate("training-records")} />{dashboard?.departmentHours.length ? <div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><BarChart data={dashboard.departmentHours} layout="vertical" margin={{right:22,left:12}}><CartesianGrid horizontal={false} stroke="#ece8e6" /><XAxis type="number" /><YAxis type="category" dataKey="department" width={100} /><Tooltip /><Bar dataKey="hours" fill="#17181a" radius={[0,6,6,0]} barSize={16} /></BarChart></ResponsiveContainer></div> : <p className="training-empty">No completed training records to display.</p>}</section><section className="card"><SectionHeader kicker="Calendar" title="Upcoming training" action="Full calendar" onAction={() => navigate("training-calendar")} /><div className="timeline-list">{upcoming.length ? upcoming.map((session) => <SessionTimeline key={session.id} session={session} />) : <p className="training-empty">No upcoming training scheduled.</p>}</div></section></div>
  </section>;
}

function MetricCard({ icon: Icon, label, value, detail, tone, trend, onClick, selected }: { icon: LucideIcon; label: string; value: string | number; detail: string; tone: string; trend?: boolean; onClick?: () => void; selected?: boolean }) {
  const content = <><span className={`metric-icon ${tone}`}><Icon size={20} /></span><div><p>{label}</p><strong>{value}</strong><small className={trend ? "positive" : ""}>{trend && "↗ "}{detail}</small></div><ChevronRight size={17} /></>;
  return onClick ? <button type="button" className="metric-card metric-card-button" aria-pressed={selected} onClick={onClick}>{content}</button> : <article className="metric-card">{content}</article>;
}
function SectionHeader({ kicker, title, action, onAction }: { kicker: string; title: string; action?: string; onAction?: () => void }) {
  return <header className="section-header"><div><p>{kicker}</p><h2>{title}</h2></div>{action && <button onClick={onAction}>{action}<ArrowRight size={15} /></button>}</header>;
}
function SessionTimeline({ session }: { session: CalendarSession }) {
  return <article className="timeline-item"><div className="date-tile"><strong>{new Date(`${session.date}T08:00:00`).getDate()}</strong><span>{new Intl.DateTimeFormat("en", { month: "short" }).format(new Date(session.date + "T08:00:00"))}</span></div><div className="timeline-copy"><strong>{session.title}</strong><span>{session.time}–{session.endTime} · {session.venue}</span><div><i className={`category-dot ${session.category.toLowerCase()}`} />{session.attendees.length} participants</div></div><span className={`status-badge ${session.status.toLowerCase().replace(" ", "-")}`}>{session.status}</span></article>;
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
  const today = malaysiaDate();
  const upcoming = sessions.filter((session) => session.date >= today && session.status !== "Completed").length;
  const completed = sessions.filter((session) => session.status === "Completed").length;
  return <section className="page-stack"><div className="module-intro training-intro"><div><span className="module-kicker"><GraduationCap size={15} />Training</span><h2>Manage employee training</h2><p>Plan sessions and keep employee training records.</p></div><button className="button button-light" onClick={() => navigate("training-planner")}><Plus size={17} />Plan training</button></div><div className="metric-grid"><MetricCard icon={CalendarDays} label="Saved sessions" value={sessions.length} detail="All dates" tone="blue" onClick={() => navigate("training-calendar")} /><MetricCard icon={CalendarCheck2} label="Upcoming sessions" value={upcoming} detail="Today onwards" tone="green" onClick={() => navigate("training-calendar")} /><MetricCard icon={Clock3} label="Training hours" value={dashboard?.stats.totalTrainingHours ?? "—"} detail="Completed records" tone="violet" /><MetricCard icon={CheckCircle2} label="Completed sessions" value={completed} detail="All participants completed" tone="burgundy" /></div><section className="card feature-hub"><SectionHeader kicker="Training" title="Training tools" /><div className="feature-grid">{trainingNav.slice(1).map((item) => <button key={item.id} onClick={() => navigate(item.id)}><span><item.icon size={21} /></span><div><strong>{item.label}</strong><p>{featureDescription[item.id]}</p></div><ArrowRight size={17} /></button>)}</div></section>{!sessions.length && <section className="card training-empty"><CalendarDays size={28} /><h3>No training scheduled yet</h3><p>Create your first training plan to get started.</p></section>}</section>;
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

  const [quickFilter, setQuickFilter] = useState({ kind: "all", version: 0 });
  const directoryRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!quickFilter.version) return;
    directoryRef.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    if (quickFilter.kind === "departments") directoryRef.current?.querySelector<HTMLSelectElement>('[aria-label="Department"]')?.focus({ preventScroll: true });
  }, [quickFilter]);
  const chooseFilter = (kind: string) => { setQuery(""); setQuickFilter((current) => ({ kind, version: current.version + 1 })); };
  const refresh = async () => setEmployees(await api.getEmployees());
  useEffect(() => { void refresh().catch(() => showNotice("Employees could not be loaded. Check the server connection.")); }, []);

  const trainingFor = (employee: Employee) => employeeTrainingRows.find((item) => item.id === employee.employeeId);
  const activeCount = employees.filter((person) => person.status === "ACTIVE").length;
  const previewFile = async (file?: File) => { if (!file) return; setPreview(null); setImporting(true); try { const result = await api.previewEmployeeImport(file); setPreview(result); showNotice(`${result.meta.validRows} valid employee records are ready to import.`); } catch (cause) { showNotice(cause instanceof Error ? cause.message : "The spreadsheet could not be read. Choose an .xlsx or .csv file."); } finally { setImporting(false); } };
  const commit = async () => { if (!preview?.rows.length) return; setImporting(true); try { const result = await api.commitEmployeeImport(preview.rows); await refresh(); showNotice(`${result.imported} employee records were imported.`); setPreview(null); } catch (cause) { showNotice(cause instanceof Error ? cause.message : "The import could not be saved. Please try again."); } finally { setImporting(false); } };

  const profileDialog = profile ? createPortal(<div className="fleet-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !removing) setProfile(null); }}><section className="fleet-dialog employee-profile-dialog" role="dialog" aria-modal="true" aria-label={`${profile.name ?? profile.employeeId} employee profile`}><header><div><span>{profile.employeeId}</span><strong>Employee profile</strong></div><button onClick={() => setProfile(null)} aria-label="Close"><X size={19} /></button></header><div className="employee-profile-body"><div className="profile-identity"><Avatar initials={(profile.name ?? profile.employeeId).split(" ").map((part) => part[0]).slice(0, 2).join("")} /><div><h2>{profile.name || "Name not recorded"}</h2><p>{profile.role || "Role not recorded"} · {profile.department.name}</p></div><span className={`employment-status ${profile.status.toLowerCase().replaceAll("_", "-")}`}>{employeeStatusLabel(profile.status)}</span></div><div className="profile-details"><div><span>Company</span><strong>{profile.company || "Not recorded"}</strong></div><div><span>Base</span><strong>{profile.base || "Not recorded"}</strong></div><div><span>Email</span><strong>{profile.email || "Not recorded"}</strong></div><div><span>Production line</span><strong>{profile.line || "Not assigned"}</strong></div><div><span>Employee ID</span><strong>{profile.employeeId}</strong></div><div><span>Department</span><strong>{profile.department.name}</strong></div></div>{(() => { const training = trainingFor(profile); return training ? <section className="profile-training"><div><span>Training completion</span><strong>{training.completed} / {training.required}</strong></div><div><span>Learning hours</span><strong>{training.hours} hours</strong></div><div><span>Next requirement</span><strong>{training.nextDue}</strong></div><div><span>Training attention</span><strong>{training.risk}</strong></div></section> : <section className="profile-training-empty"><GraduationCap size={22} /><span>No training summary is linked to this employee yet.</span></section>; })()} {error && <div className="form-error"><CircleAlert size={16} />{error}</div>}<footer className="profile-actions"><button className="button button-danger-outline" disabled={removing || profile.status === "INACTIVE"} onClick={async () => { try { setRemoving(true); setError(""); await api.removeEmployee(profile.id); await refresh(); showNotice(`${profile.name ?? profile.employeeId} was removed from the active directory. Training history was retained.`); setProfile(null); } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to remove this employee."); } finally { setRemoving(false); } }}><Trash2 size={16} />{removing ? "Removing…" : "Remove from active directory"}</button><button className="button button-primary" onClick={() => { setEditor(profile); setProfile(null); }}><Pencil size={16} /> Edit profile & status</button></footer></div></section></div>, document.body) : null;

  const editorDialog = editor !== undefined ? createPortal(<div className="fleet-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditor(undefined); }}><section className="fleet-dialog employee-profile-dialog" role="dialog" aria-modal="true" aria-label={editor ? "Edit employee" : "Add employee"}><header><div><span>{editor?.employeeId ?? "People directory"}</span><strong>{editor ? "Edit employee profile" : "Add a new employee"}</strong></div><button onClick={() => setEditor(undefined)} aria-label="Close"><X size={19} /></button></header><EmployeeForm employee={editor ?? undefined} onSubmit={async (input) => { const saved = editor ? await api.updateEmployee(editor.id, input) : await api.createEmployee(input); await refresh(); showNotice(editor ? `${saved.name ?? saved.employeeId}'s profile was updated.` : `${saved.name ?? saved.employeeId} was added to the people directory.`); setEditor(undefined); }} /></section></div>, document.body) : null;

  return <><section className="page-stack"><div className="page-toolbar"><label className="search-field"><Search size={17} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search employees, departments or emails" /></label><div className="toolbar-actions"><label className="button button-secondary upload-button"><Upload size={16} />{importing ? "Reading…" : "Import employees"}<input type="file" accept=".csv,.xlsx" disabled={importing} onChange={(e) => { void previewFile(e.target.files?.[0]); e.target.value = ""; }} /></label><EmployeeEmailImport employees={employees} onImported={refresh} showNotice={showNotice} /><button className="button button-primary" onClick={() => setEditor(null)}><Plus size={16} /> Add employee</button></div></div>{preview && <ImportPreview preview={preview} busy={importing} onImport={() => { void commit(); }} onDismiss={() => setPreview(null)} />}<div className="metric-grid compact-metrics"><MetricCard icon={UsersRound} label="Active employees" onClick={() => chooseFilter("active")} selected={quickFilter.kind === "active"} value={String(activeCount)} detail={`${employees.length} total records`} tone="burgundy" /><MetricCard icon={UsersRound} label="Departments" onClick={() => chooseFilter("departments")} selected={quickFilter.kind === "departments"} value={new Set(employees.map((person) => person.department.name)).size} detail="Browse by department below" tone="violet" /><MetricCard icon={MailCheck} label="With email" onClick={() => chooseFilter("with")} selected={quickFilter.kind === "with"} value={employees.filter((person) => person.email).length} detail="Email address recorded" tone="green" /><MetricCard icon={UserCog} label="Without email" onClick={() => chooseFilter("without")} selected={quickFilter.kind === "without"} value={employees.filter((person) => !person.email).length} detail="Included in employee records" tone="blue" /></div><div className="employee-directory-anchor" ref={directoryRef}><EmployeeDirectory key={quickFilter.version} employees={employees} query={query} initialEmailFilter={quickFilter.kind === "with" || quickFilter.kind === "without" ? quickFilter.kind : "all"} initialStatus={quickFilter.kind === "active" ? "ACTIVE" : "all"} onOpen={(person) => { setError(""); setProfile(person); }} /></div></section>{profileDialog}{editorDialog}</>;
}

function EmployeeForm({ employee, onSubmit }: { employee?: Employee; onSubmit: (input: EmployeeInput) => Promise<void> }) {
  const [employeeId, setEmployeeId] = useState(employee?.employeeId ?? "");
  const [name, setName] = useState(employee?.name ?? "");
  const [email, setEmail] = useState(employee?.email ?? "");
  const [company, setCompany] = useState(employee?.company ?? "");
  const [base, setBase] = useState(employee?.base ?? "");
  const [department, setDepartment] = useState(employee?.department.name ?? "");
  const [line, setLine] = useState(employee?.line ?? "");
  const [role, setRole] = useState(employee?.role ?? "");
  const [status, setStatus] = useState<Employee["status"]>(employee?.status ?? "ACTIVE");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return <form className="fleet-form employee-form" onSubmit={async (event) => { event.preventDefault(); try { setBusy(true); setError(""); await onSubmit({ employeeId, name, email, company, base, department, line, role, status }); } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save this employee."); } finally { setBusy(false); } }}><div className="registry-note"><UserRound size={22} /><div><strong>{employee ? "Maintain the master employee record" : "Create a master employee record"}</strong><small>Status controls whether the employee appears in active workforce workflows; historical training records are always retained.</small></div></div><div className="form-grid"><label className="field"><span>Employee ID</span><input value={employeeId} onChange={(event) => setEmployeeId(event.target.value.toUpperCase())} required /></label><label className="field"><span>Full name</span><input value={name} onChange={(event) => setName(event.target.value)} required /></label><label className="field"><span>Email</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="employee@company.com" /></label><label className="field"><span>Department</span><input value={department} onChange={(event) => setDepartment(event.target.value)} required /></label><label className="field"><span>Role / job type</span><input value={role} onChange={(event) => setRole(event.target.value)} /></label><label className="field"><span>Company</span><input value={company} onChange={(event) => setCompany(event.target.value)} /></label><label className="field"><span>Base</span><input value={base} onChange={(event) => setBase(event.target.value)} /></label><label className="field"><span>Line / unit</span><input value={line} onChange={(event) => setLine(event.target.value)} /></label><label className="field span-2"><span>Employment status</span><select value={status} onChange={(event) => setStatus(event.target.value as Employee["status"])}><option value="ACTIVE">Active</option><option value="ON_LEAVE">On leave</option><option value="INACTIVE">Inactive</option><option value="RESIGNED">Resigned</option><option value="TERMINATED">Terminated</option></select><small className="field-help">Inactive, resigned and terminated employees remain available in historical training and audit records.</small></label></div>{error && <div className="form-error"><CircleAlert size={16} />{error}</div>}<footer className="fleet-form-actions"><span><ShieldCheck size={16} /> Changes are saved to the central people directory.</span><button className="button button-primary" disabled={busy}><CheckCircle2 size={16} />{busy ? "Saving…" : employee ? "Save employee changes" : "Add employee"}</button></footer></form>;
}

function TrainingRecords({ sessions, onDelete, onRefresh }: { sessions: CalendarSession[]; onDelete: (id: string) => Promise<void>; onRefresh: () => void }) {
  const [query, setQuery] = useState("");
  const records = sessions.flatMap((session) => session.attendees.map((employee) => ({ session, employee }))).filter(({session,employee}) => (session.title + " " + employee.name + " " + employee.department).toLowerCase().includes(query.toLowerCase()));
  return <section className="page-stack"><label className="search-field"><Search size={17} /><input placeholder="Search training records" value={query} onChange={(event) => setQuery(event.target.value)} /></label><section className="card data-card"><SectionHeader kicker="Training" title="Employee training records" />{records.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Employee</th><th>Department</th><th>Training</th><th>Date</th><th>Status</th><th>Check-in (Malaysia)</th><th>Hours</th><th>Manage</th></tr></thead><tbody>{records.map(({session,employee}) => <tr key={session.id + employee.id}><td>{employee.name}</td><td>{employee.department}</td><td>{session.title}</td><td>{session.date}</td><td>{employee.status}</td><td>{employee.checkedInAt ? new Date(employee.checkedInAt).toLocaleString("en-MY", {timeZone:"Asia/Kuala_Lumpur"}) : "—"}</td><td>{employee.hours ?? 0}</td><td><TrainingAttendance sessionId={session.id} onRefresh={onRefresh}/><TrainingDeleteButton session={session} onDelete={onDelete} /></td></tr>)}</tbody></table></div> : <p className="training-empty">No training records found. Saved training plans and attendance records will appear here.</p>}</section></section>;
}

function NotesLibrary({ showNotice }: { showNotice: (message: string) => void }) {
  const [query, setQuery] = useState(""); const visible = notesLibrary.filter((note) => `${note.title} ${note.employee} ${note.course} ${note.tags.join(" ")}`.toLowerCase().includes(query.toLowerCase()));
  return <section className="page-stack"><div className="page-toolbar"><label className="search-field wide"><Search size={17} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search title, employee, course or tag" /></label><div className="toolbar-actions"><select><option>All file types</option><option>PDF</option><option>DOCX</option><option>XLSX</option></select><button className="button button-primary" onClick={() => showNotice("Upload area opened. Files will be stored against an employee and training record.")}><Upload size={16} /> Upload notes</button></div></div><div className="library-layout"><aside className="card library-filter"><SectionHeader kicker="Browse" title="Learning library" /><button className="active"><Library size={17} />All notes<span>{notesLibrary.length}</span></button><button><Clock3 size={17} />Recently added<span>0</span></button><button><UsersRound size={17} />My department<span>0</span></button><p>Popular tags</p>{["GMP", "Safety", "System", "Quality", "Leadership"].map((tag) => <button key={tag} className="tag-filter"># {tag}</button>)}</aside><section className="notes-results"><div className="results-heading"><span><strong>{visible.length} documents</strong><small>Indexed by employee and training</small></span><select><option>Newest first</option><option>Title A–Z</option></select></div>{!visible.length && <p className="training-empty">No training notes uploaded.</p>}{visible.map((note, index) => <article className="note-card" key={note.id} style={{ "--delay": `${index * 60}ms` } as React.CSSProperties}><span className={`file-type ${note.type.toLowerCase()}`}><FileText size={21} /><em>{note.type}</em></span><div className="note-copy"><small>{note.course}</small><h3>{note.title}</h3><p>{note.excerpt}</p><div className="tag-row">{note.tags.map((tag) => <span key={tag}>{tag}</span>)}</div><footer><span><Avatar initials={note.employee.split(" ").map((n) => n[0]).slice(0, 2).join("")} />{note.employee}</span><em>{note.submitted} · {note.size}</em></footer></div><button className="row-action" aria-label={`Open ${note.title}`} onClick={() => showNotice(`${note.title} is ready to retrieve from document storage.`)}><ArrowRight size={17} /></button></article>)}</section></div></section>;
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
  onOpenHistory,
}: {
  showNotice: (message: string) => void;
  initialVehicleId?: string;
  onOpenRegistry: () => void;
  onOpenHistory: (vehicleId: string) => void;
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
  const [loading, setLoading] = useState(true);
  const [fleetError, setFleetError] = useState("");

  const refreshFleet = async () => {
    setLoading(true);
    setFleetError("");
    try {
      const [vehicleRows, tripRows] = await Promise.all([
        api.getVehicles(),
        api.getVehicleTrips(),
      ]);
      setFleetVehicles(vehicleRows);
      setTrips(tripRows);
      return vehicleRows;
    } catch {
      setFleetVehicles([]);
      setTrips([]);
      setFleetError("Vehicle data could not be loaded. Check the connection and retry.");
      return [];
    } finally {
      setLoading(false);
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
              <CarFront size={15} /> Company cars
            </span>
            <h2>Track company car trips</h2>
            <p>
              Start a trip, complete the car checks and record the odometer reading when you return.
            </p>
          </div>
          <div className="fleet-hero-actions">
            <button
              className="button button-light"
              onClick={onOpenRegistry}
            >
              <Settings2 size={17} /> Manage cars
            </button>
            <button
              className="button button-ghost-light"
              disabled={loading || !selectedVehicle || selectedVehicle.status !== "AVAILABLE"}
              onClick={() => selectedVehicle && openStart(selectedVehicle)}
            >
              <CarFront size={17} /> Start trip
            </button>
          </div>
        </div>
        <section className="card trip-launcher" aria-label="Choose a car and start a trip">
          <div><span className="module-kicker"><Route size={16} /> Ready to drive?</span><h2>Choose your car & start a trip</h2><p>Record the driver, destination and starting mileage before leaving.</p></div>
          <div className="trip-launcher-controls">
            <label className="field"><span>Company car</span><select value={selectedVehicle?.id ?? ""} disabled={loading || !fleetVehicles.length} onChange={(event) => setSelectedVehicleId(event.target.value)}>
              {!fleetVehicles.length && <option value="">{loading ? "Loading cars…" : "No cars available"}</option>}
              {fleetVehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.plate} · {vehicle.model} · {fleetStatusLabel(vehicle.status)}</option>)}
            </select></label>
            <button className="button button-primary" disabled={loading || !selectedVehicle || (!activeTrip && selectedVehicle.status !== "AVAILABLE")} onClick={() => { if (activeTrip) setDialog("complete"); else if (selectedVehicle) openStart(selectedVehicle); }}><CarFront size={18} />{activeTrip ? "Return car" : "Start trip"}<ArrowRight size={16} /></button>
            <button className="button button-secondary" disabled={loading || !selectedVehicle} onClick={() => setDialog("qr")}><QrCode size={17} /> Print car QR</button>
          </div>
          {selectedVehicle && selectedVehicle.status !== "AVAILABLE" && !activeTrip && <p role="status">This car is {fleetStatusLabel(selectedVehicle.status).toLowerCase()}. Choose an available car to start a trip.</p>}
          <small><QrCode size={15} /> Driving as a guest? Scan the QR inside the car to open its usage form.</small>
          {fleetError && <div className="form-error" role="alert">{fleetError}<button type="button" onClick={() => { void refreshFleet(); }}>Retry</button></div>}
        </section>
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
                    <button onClick={() => onOpenHistory(vehicle.id)}><Clock3 size={15} /> History</button>
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

function VehicleRegistryPage({ showNotice, onOpenHistory }: { showNotice: (message: string) => void; onOpenHistory: (vehicleId: string) => void }) {
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
      <section className="fleet-dialog" role="dialog" aria-modal="true" aria-label={editing ? "Edit vehicle" : "Add car"}>
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
      <div className="module-intro fleet-intro registry-intro"><div><span className="module-kicker"><CarFront size={15} /> Vehicle registry</span><h2>Manage company cars</h2><p>Add cars and update their photos, mileage, service dates and availability.</p></div><button className="button button-light" onClick={() => setEditing(null)}><Plus size={17} /> Add car</button></div>
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
            <div className="registry-vehicle-copy"><div><span>{vehicle.category}</span><h3>{vehicle.plate}</h3><p>{vehicle.model}</p></div><dl><div><dt>Current odometer</dt><dd>{formatNumber(vehicle.mileage)} km</dd></div><div><dt>Next service</dt><dd>{formatNumber(vehicle.serviceAt)} km</dd></div><div><dt>Pool / owner</dt><dd>{vehicle.assigned}</dd></div></dl><footer><button className="button button-secondary" onClick={() => onOpenHistory(vehicle.id)}><Clock3 size={15} /> Usage history</button><button className="button button-secondary" onClick={() => setEditing(vehicle)}><Pencil size={15} /> Edit details</button><button className="button button-danger-outline" onClick={() => { setError(""); setRemoving(vehicle); }}><Trash2 size={15} /> Remove</button></footer></div>
          </article>)}
          {!visible.length && <div className="registry-empty"><Search size={27} /><strong>No vehicle matched that search</strong><p>Try a plate number, model, category or assigned pool.</p></div>}
        </div>
      </section>
    </section>
    {editor}
    {removalDialog}
  </>;
}

function UsageHistory({ initialVehicleId }: { initialVehicleId: string | null }) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [trips, setTrips] = useState<VehicleTrip[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState(initialVehicleId ?? "");
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState(false);

  useEffect(() => {
    let mounted = true;
    Promise.all([api.getVehicles(), api.getVehicleTrips()])
      .then(([vehicleRows, tripRows]) => {
        if (!mounted) return;
        const allVehicles = new Map(vehicleRows.map((vehicle) => [vehicle.id, vehicle]));
        tripRows.forEach((trip) => {
          if (trip.vehicle && !allVehicles.has(trip.vehicleId)) allVehicles.set(trip.vehicleId, trip.vehicle);
        });
        const available = [...allVehicles.values()].sort((a, b) => a.plate.localeCompare(b.plate));
        setVehicles(available);
        setTrips(tripRows);
        setSelectedVehicleId((current) => current || available[0]?.id || "");
        setPreview(false);
      })
      .catch(() => {
        if (!mounted) return;
        const fallback = makeFallbackFleet();
        setVehicles(fallback.vehicles);
        setTrips(fallback.trips);
        setSelectedVehicleId((current) => current || fallback.vehicles[0]?.id || "");
        setPreview(true);
      })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  const selectedVehicle = vehicles.find((vehicle) => vehicle.id === selectedVehicleId);
  const history = trips.filter((trip) => trip.vehicleId === selectedVehicleId)
    .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
  const completed = history.filter((trip) => trip.status === "COMPLETED");
  const totalDistance = completed.reduce((sum, trip) => sum + Math.max(0, (trip.odometerEnd ?? trip.odometerStart) - trip.odometerStart), 0);
  const localDate = (value: string) => new Date(value).toLocaleString("en-MY", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kuala_Lumpur"
  });

  return <section className="page-stack usage-history-page">
    <div className="module-intro history-intro"><div><span className="module-kicker"><Clock3 size={15} /> Company cars</span><h2>Review past trips</h2><p>Select a car to see drivers, trips, mileage, inspections and photos.</p></div></div>
    {preview && <div className="history-preview" role="status">The fleet API is unavailable. Showing sample records until the server is connected.</div>}
    <div className="history-selector card">
      <div><span className="history-kicker">Vehicle record</span><h3>{selectedVehicle?.plate ?? (loading ? "Loading vehicles…" : "No vehicle selected")}</h3><p>{selectedVehicle?.model ?? "Choose a vehicle to inspect its history."}{selectedVehicle?.archivedAt ? " · Archived" : ""}</p></div>
      <label><span>Select company car</span><select value={selectedVehicleId} onChange={(event) => setSelectedVehicleId(event.target.value)} disabled={loading || vehicles.length === 0}>
        {vehicles.length === 0 && <option value="">No vehicles available</option>}
        {vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.plate} · {vehicle.model}{vehicle.archivedAt ? " (archived)" : ""}</option>)}
      </select></label>
    </div>
    <div className="history-summary">
      <div><span>Total journeys</span><strong>{history.length}</strong><small>Recorded check-outs</small></div>
      <div><span>Completed</span><strong>{completed.length}</strong><small>Returned vehicles</small></div>
      <div><span>Distance logged</span><strong>{formatNumber(totalDistance)} <em>km</em></strong><small>Completed journeys</small></div>
      <div><span>Latest use</span><strong className="history-last-used">{history[0] ? localDate(history[0].startedAt).split(",")[0] : "—"}</strong><small>{history[0] ? history[0].driverName : "No journeys yet"}</small></div>
    </div>
    <section className="card history-log"><div className="history-log-heading"><div><span className="history-kicker">Audit trail</span><h3>{selectedVehicle?.plate ?? "Vehicle"} usage log</h3><p>{history.length} journey{history.length === 1 ? "" : "s"} · newest first</p></div><ShieldCheck size={24} /></div>
      {loading && <div className="history-empty">Loading usage history…</div>}
      {!loading && history.length === 0 && <div className="history-empty"><Clock3 size={28} /><strong>No usage recorded for this car</strong><p>Trips will appear here after a driver starts using it.</p></div>}
      {history.map((trip) => <article className="history-entry" key={trip.id}>
        <div className="history-entry-top"><span className="history-entry-icon"><Route size={18} /></span><div><strong>{trip.destination}</strong><small>{trip.purpose} · {trip.id.startsWith("TRIP-") ? trip.id : trip.id.slice(-8).toUpperCase()}</small></div><span className={`status-badge ${trip.status.toLowerCase().replaceAll("_", "-")}`}>{fleetStatusLabel(trip.status)}</span></div>
        <div className="history-entry-grid">
          <div><span>Driver</span><strong>{trip.driverName}</strong><small>{trip.driverEmployeeId} · {trip.passengers} passenger{trip.passengers === 1 ? "" : "s"}</small></div>
          <div><span>Checked out</span><strong>{localDate(trip.startedAt)}</strong><small>Fuel {trip.fuelBefore}% · {fleetStatusLabel(trip.conditionBefore)}</small></div>
          <div><span>Returned</span><strong>{trip.endedAt ? localDate(trip.endedAt) : "Still in use"}</strong><small>{trip.fuelAfter == null ? "Return inspection pending" : `Fuel ${trip.fuelAfter}% · ${fleetStatusLabel(trip.conditionAfter ?? trip.conditionBefore)}`}</small></div>
          <div><span>Odometer</span><strong>{formatNumber(trip.odometerStart)} → {trip.odometerEnd == null ? "Pending" : formatNumber(trip.odometerEnd)} km</strong><small>{trip.odometerEnd == null ? "Distance pending" : `${formatNumber(Math.max(0, trip.odometerEnd - trip.odometerStart))} km travelled`}</small></div>
        </div>
        <div className="history-entry-footer"><div className="history-evidence">{trip.odometerPhotoBefore && <a href={trip.odometerPhotoBefore} target="_blank" rel="noreferrer"><Gauge size={14} /> Before photo</a>}{trip.odometerPhotoAfter && <a href={trip.odometerPhotoAfter} target="_blank" rel="noreferrer"><Gauge size={14} /> After photo</a>}{!trip.odometerPhotoBefore && !trip.odometerPhotoAfter && <span>No odometer photos saved</span>}</div>{(trip.notesBefore || trip.notesAfter) && <div className="history-notes">{trip.notesBefore && <p><strong>Before:</strong> {trip.notesBefore}</p>}{trip.notesAfter && <p><strong>After:</strong> {trip.notesAfter}</p>}</div>}</div>
        <details className="history-inspection"><summary>Inspection checklist</summary><div><div><strong>Before departure</strong>{Object.entries(trip.checksBefore).map(([check, passed]) => <span key={check}>{check.replace(/([A-Z])/g, " $1")} · {passed ? "Yes" : "No"}</span>)}</div><div><strong>After return</strong>{trip.checksAfter ? Object.entries(trip.checksAfter).map(([check, passed]) => <span key={check}>{check.replace(/([A-Z])/g, " $1")} · {passed ? "Yes" : "No"}</span>) : <span>Pending return</span>}</div></div></details>
      </article>)}
    </section>
  </section>;
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
  // Keep odometer inputs as text while they are being edited. Converting an
  // empty number input to Number immediately produces 0, which prevented an
  // existing (seeded) reading from being cleared and replaced naturally.
  const [mileage, setMileage] = useState(() => String(vehicle?.mileage ?? ""));
  const [serviceAt, setServiceAt] = useState(() => String(vehicle?.serviceAt ?? 10000));
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
    const actualMileage = Number(mileage);
    const nextServiceMileage = Number(serviceAt);
    if (!Number.isInteger(actualMileage) || actualMileage < 0) {
      setError("Enter the vehicle's actual odometer reading as a whole number.");
      return;
    }
    if (!Number.isInteger(nextServiceMileage) || nextServiceMileage < 0) {
      setError("Enter the next service mileage as a whole number.");
      return;
    }
    const savedStatus = status === "AVAILABLE" && actualMileage >= nextServiceMileage
      ? "SERVICE_DUE"
      : status;
    try {
      setBusy(true);
      await onSubmit({
        plate,
        model,
        category,
        assigned,
        mileage: actualMileage,
        serviceAt: nextServiceMileage,
        status: savedStatus,
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
            onChange={(event) => setMileage(event.target.value)}
            onFocus={(event) => event.currentTarget.select()}
            placeholder="Enter actual mileage"
            required
          />
          <small className="field-help">Select the saved value and type the vehicle's actual odometer reading.</small>
        </label>
        <label className="field">
          <span>Next service at (km)</span>
          <input
            type="number"
            min="0"
            value={serviceAt}
            onChange={(event) => setServiceAt(event.target.value)}
            onFocus={(event) => event.currentTarget.select()}
            required
          />
          {mileage !== "" && serviceAt !== "" && Number(mileage) >= Number(serviceAt) && status === "AVAILABLE" && (
            <small className="field-help">This mileage has reached the service limit, so saving will mark the vehicle as Service due.</small>
          )}
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
              {vehicle ? "Save vehicle changes" : "Add car"}
            </>
          )}
        </button>
      </footer>
    </form>
  );
}

function VehicleFormPhoto({ vehicle, showIdentity = true }: { vehicle: Vehicle; showIdentity?: boolean }) {
  const [failedPhoto, setFailedPhoto] = useState<string | null>(null);
  return <figure className="trip-car-photo">
    {vehicle.photo && failedPhoto !== vehicle.photo
      ? <img src={vehicle.photo} alt={`${vehicle.plate} · ${vehicle.model}`} onError={() => setFailedPhoto(vehicle.photo ?? null)} />
      : <div className="trip-car-photo-empty"><CarFront size={42} /><span>Car photo not added yet</span></div>}
    {showIdentity && <figcaption><strong>{vehicle.plate}</strong><span>{vehicle.model}</span></figcaption>}
  </figure>;
}

function StartTripForm({
  vehicles,
  selectedVehicleId,
  onVehicleChange,
  onSubmit,
  showCarPhoto = true,
}: {
  vehicles: Vehicle[];
  selectedVehicleId: string;
  onVehicleChange: (id: string) => void;
  showCarPhoto?: boolean;
  onSubmit: (
    input: Parameters<typeof api.startVehicleTrip>[0],
  ) => Promise<void>;
}) {
  const vehicle = vehicles.find((item) => item.id === selectedVehicleId)!;
  const [driver, setDriver] = useState<TripDriver | null>(null);
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
    setOdometerPhoto("");
    setChecks({ exterior: false, tyres: false, lights: false, documents: false });
  }, [vehicle.id, vehicle.mileage]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (!driver) {
      setError("Choose the driver's department, position and name, or enter the guest's full name.");
      return;
    }
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
    if (vehicle.status !== "AVAILABLE") {
      setError("This car is no longer available. Refresh its status before starting.");
      return;
    }
    try {
      setBusy(true);
      await onSubmit({
        vehicleId: vehicle.id,
        driverEmployeeId: driver.reference,
        driverName: driver.name,
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
      {showCarPhoto && <VehicleFormPhoto vehicle={vehicle} />}
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
        <VehicleDriverPicker onChange={setDriver} />
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
  showCarPhoto = true,
}: {
  vehicle: Vehicle;
  trip: VehicleTrip;
  showCarPhoto?: boolean;
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
      {showCarPhoto && <VehicleFormPhoto vehicle={vehicle} />}
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

function VehicleUsagePage({ vehicleId }: { vehicleId: string }) {
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [recording, setRecording] = useState(false);
  const load = async () => {
    setLoading(true); setError("");
    try { setVehicle(await api.getVehicle(vehicleId)); }
    catch (cause) { setVehicle(null); setError(cause instanceof Error ? cause.message : "Unable to load this car."); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [vehicleId]);
  return <main className="vehicle-usage-page"><div className="vehicle-usage-container">
    <header className="vehicle-usage-brand"><img src="/sgi-logo.png" alt="Sugihara Grand Industries" /><span>Company car usage</span></header>
    {loading ? <section className="card" role="status">Loading your car…</section> : error ? <section className="card"><h1>Unable to open this car</h1><p role="alert">{error}</p><button className="button button-primary" onClick={() => { void load(); }}>Retry</button></section> : vehicle && <>
      <section className="card vehicle-usage-heading"><VehicleFormPhoto vehicle={vehicle} showIdentity={false} /><span className="module-kicker"><QrCode size={17} /> Your scanned car</span><h1>{vehicle.plate}</h1><p>{vehicle.model}</p><span className="status-badge">{fleetStatusLabel(vehicle.status)}</span><p>Current odometer: <strong>{formatNumber(vehicle.mileage)} km</strong></p></section>
      {message && <section className="card vehicle-usage-message" role="status"><CheckCircle2 size={24} /><div><strong>{message}</strong><p>{vehicle.activeTrip ? "Scan this same QR when you return to record the ending mileage and car condition." : "Your usage record has been saved. Thank you for returning the car."}</p></div></section>}
      <section className="card vehicle-usage-form">
        <header><h2>{vehicle.activeTrip ? "Return this car" : "Start your trip"}</h2><p>{vehicle.activeTrip ? "Complete the return check and enter the final odometer reading." : "Enter your details, destination and car checks before driving."}</p></header>
        {vehicle.activeTrip ? recording ? <CompleteTripForm key={vehicle.activeTrip.id} vehicle={vehicle} trip={vehicle.activeTrip} showCarPhoto={false} onSubmit={async (input) => {
          await api.completeVehicleTrip(vehicle.activeTrip!.id, input);
          setMessage("Car returned successfully."); setRecording(false); await load(); window.scrollTo(0, 0);
        }} /> : <div className="vehicle-usage-prompt"><p>This car has a trip in progress. Only submit a return check when the car has been returned.</p><button className="button button-primary" onClick={() => setRecording(true)}><ClipboardCheck size={17} /> Record return</button></div> : vehicle.status === "AVAILABLE" ? <StartTripForm key={vehicle.id} vehicles={[vehicle]} selectedVehicleId={vehicle.id} onVehicleChange={() => {}} showCarPhoto={false} onSubmit={async (input) => {
          await api.startVehicleTrip(input);
          setMessage("Trip started. Drive safely."); setRecording(false); await load(); window.scrollTo(0, 0);
        }} /> : <div className="vehicle-usage-prompt" role="status"><CircleAlert size={24} /><p>This car is {fleetStatusLabel(vehicle.status).toLowerCase()} and cannot start a trip. Please contact the fleet administrator.</p></div>}
      </section>
    </>}
    <footer className="vehicle-usage-footer">HR Digital · Scan this car’s QR before driving and again when returning.</footer>
  </div></main>;
}

function VehicleQr({ vehicle }: { vehicle: Vehicle }) {
  const [image, setImage] = useState("");
  const [feedback, setFeedback] = useState("");
  const url = `${window.location.origin}/?vehicle=${encodeURIComponent(vehicle.id)}`;
  useEffect(() => { setImage(""); void QRCode.toDataURL(url, { width: 420, margin: 2, color: { dark: "#101112", light: "#ffffff" }, errorCorrectionLevel: "H" }).then(setImage).catch(() => setFeedback("Unable to generate QR. Please reopen this label.")); }, [url]);
  return <div className="vehicle-qr"><div className="qr-sheet"><img className="qr-company" src="/sgi-logo.png" alt="Sugihara Grand Industries" /><span>Company vehicle access</span><strong>{vehicle.plate}</strong><small>{vehicle.model}</small>{image ? <img className="qr-code" src={image} alt={`QR code for ${vehicle.plate}`} /> : <div className="qr-loading">Generating QR…</div>}<p>Scan before taking this vehicle.<br />Complete the return check after driving.</p><em>{vehicle.id}</em></div><div className="qr-actions"><button className="button button-primary" disabled={!image} onClick={() => window.print()}><QrCode size={16} /> Print label</button>{image && <a className="button button-secondary" href={image} download={`HR-Digital-${vehicle.plate.replaceAll(" ", "-")}-QR.png`}><Download size={16} /> Download QR</a>}<button className="button button-secondary" onClick={async () => { try { await navigator.clipboard.writeText(url); setFeedback("Link copied."); } catch { setFeedback("Copy the car link below."); } }}><QrCode size={16} /> Copy link</button></div>{feedback && <p role="status">{feedback}</p>}<a className="qr-car-link" href={url} target="_blank" rel="noreferrer">{url}</a><p className="qr-help"><QrCode size={16} /> Print and place this label inside the car. Guests scan to record usage and scan again to return it. Generate labels from the address guests use to access HR Digital.</p></div>;
}

function Avatar({ initials }: { initials: string }) { return <span className="avatar">{initials}</span>; }
export default App;
