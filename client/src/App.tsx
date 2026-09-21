import { FormEvent, useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Activity, ArrowRight, Bell, BookOpenCheck, CalendarCheck2, CalendarDays, CarFront, Check,
  CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, CircleAlert, Clock3, FileSpreadsheet,
  FileText, Gauge, GraduationCap, LayoutDashboard, Library, LockKeyhole, MailCheck, MapPin, Menu,
  MessageSquareText, Plus, Route, Search, Send, ServerCog, Settings2, ShieldCheck, Upload,
  UserCog, UserRound, UsersRound, Wrench, X
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DashboardSummary, EmployeeImportPreview } from "@hr-training/shared";
import { api } from "./api";
import {
  departmentReadiness, emailAutomations, employeeTrainingRows, notesLibrary,
  trainingSessions as initialTrainingSessions, vehicleTrips, vehicles, type CalendarSession
} from "./portal-data";

type View = "overview" | "employees" | "training-overview" | "training-calendar" |
  "training-planner" | "training-records" | "email-automation" | "notes-library" | "fleet" | "administration";

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
  const [activeView, setActiveView] = useState<View>("overview");
  const [trainingOpen, setTrainingOpen] = useState(false);
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
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="app-shell">
      <Sidebar activeView={activeView} trainingOpen={trainingOpen} mobileOpen={mobileNavOpen}
        onTrainingToggle={() => setTrainingOpen((open) => !open)} onNavigate={navigate} onClose={() => setMobileNavOpen(false)} />
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
          {activeView === "fleet" && <FleetTracker showNotice={setNotice} />}
          {activeView === "administration" && <Administration showNotice={setNotice} />}
        </div>
      </main>
      {notice && <div className="toast" role="status"><CheckCircle2 size={18} /><span>{notice}</span><button onClick={() => setNotice("")} aria-label="Dismiss notification"><X size={16} /></button></div>}
    </div>
  );
}

function Sidebar({ activeView, trainingOpen, mobileOpen, onTrainingToggle, onNavigate, onClose }: {
  activeView: View; trainingOpen: boolean; mobileOpen: boolean; onTrainingToggle: () => void;
  onNavigate: (view: View) => void; onClose: () => void;
}) {
  const inTraining = trainingNav.some((item) => item.id === activeView);
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
        <NavButton icon={CarFront} label="Company car usage" active={activeView === "fleet"} onClick={() => onNavigate("fleet")} />
        <button className={`nav-item nav-parent ${inTraining ? "active-parent" : ""}`} onClick={onTrainingToggle}>
          <span className="nav-icon"><BookOpenCheck size={18} /></span><span>Training</span><ChevronDown className={trainingOpen ? "rotate" : ""} size={16} />
        </button>
        <div className={`nav-children ${trainingOpen ? "open" : ""}`}>
          {trainingNav.map((item) => <button key={item.id} className={`nav-child ${activeView === item.id ? "active" : ""}`} onClick={() => onNavigate(item.id)}>
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

function EmployeesDatabase({ showNotice }: { showNotice: (message: string) => void }) {
  const [query, setQuery] = useState(""); const [preview, setPreview] = useState<EmployeeImportPreview | null>(null); const [importing, setImporting] = useState(false);
  const visible = employeeTrainingRows.filter((person) => `${person.name} ${person.id} ${person.department} ${person.role}`.toLowerCase().includes(query.toLowerCase()));
  const previewFile = async (file?: File) => { if (!file) return; setImporting(true); try { const result = await api.previewEmployeeImport(file); setPreview(result); showNotice(`${result.meta.validRows} valid employee records are ready to import.`); } catch { showNotice("The spreadsheet could not be previewed. Check the required column names."); } finally { setImporting(false); } };
  const commit = async () => { if (!preview?.rows.length) return; setImporting(true); try { const result = await api.commitEmployeeImport(preview.rows); showNotice(`${result.imported} employee records were imported.`); setPreview(null); } catch { showNotice("The database is not connected yet, so the import could not be saved."); } finally { setImporting(false); } };
  return <section className="page-stack"><div className="page-toolbar"><label className="search-field"><Search size={17} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, employee ID, role or department" /></label><div className="toolbar-actions"><label className="button button-secondary upload-button"><Upload size={16} />{importing ? "Reading…" : "Import spreadsheet"}<input type="file" accept=".csv,.xlsx,.xls" onChange={(e) => previewFile(e.target.files?.[0])} /></label><button className="button button-primary" onClick={() => showNotice("New employee form is ready for backend connection.")}><Plus size={16} /> Add employee</button></div></div>{preview && <section className="import-banner"><FileSpreadsheet size={22} /><div><strong>Spreadsheet ready</strong><span>{preview.meta.validRows} valid rows · {preview.errors.length} issues found</span></div><button onClick={commit} disabled={importing}>Import valid rows</button><button onClick={() => setPreview(null)} aria-label="Dismiss import"><X size={17} /></button></section>}<div className="metric-grid compact-metrics"><MetricCard icon={UsersRound} label="Active employees" value="175" detail="+4 this month" tone="burgundy" /><MetricCard icon={ShieldCheck} label="Fully compliant" value="148" detail="84.6% of workforce" tone="green" /><MetricCard icon={CircleAlert} label="Training attention" value="27" detail="7 overdue" tone="violet" /><MetricCard icon={Clock3} label="Average learning" value="19.3h" detail="Per employee YTD" tone="blue" /></div><section className="card data-card"><SectionHeader kicker="Master employee record" title="People directory" /><div className="table-wrap"><table className="data-table employee-table"><thead><tr><th>Employee</th><th>Department & role</th><th>Training progress</th><th>Learning hours</th><th>Next requirement</th><th>Status</th><th /></tr></thead><tbody>{visible.map((person) => { const percent = Math.round(person.completed / person.required * 100); return <tr key={person.id}><td><div className="person-cell"><Avatar initials={person.initials} /><span><strong>{person.name}</strong><small>{person.id}</small></span></div></td><td><strong>{person.department}</strong><small>{person.role}</small></td><td><div className="table-progress"><span><b>{person.completed}/{person.required}</b><em>{percent}%</em></span><div><i style={{ width: `${percent}%` }} /></div></div></td><td><strong>{person.hours} hours</strong><small>Year to date</small></td><td><strong>{person.nextDue.split(" · ")[0]}</strong><small>{person.nextDue.split(" · ")[1]}</small></td><td><span className={`risk-badge ${person.risk.toLowerCase().replace(" ", "-")}`}>{person.risk}</span></td><td><button className="row-action" onClick={() => showNotice(`${person.name}'s complete training profile is ready to open.`)}><ChevronRight size={17} /></button></td></tr>; })}</tbody></table></div></section></section>;
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

function FleetTracker({ showNotice }: { showNotice: (message: string) => void }) {
  return <section className="page-stack"><div className="module-intro fleet-intro"><div><span className="module-kicker"><CarFront size={15} /> Company mobility</span><h2>Every trip and kilometre accounted for.</h2><p>Track availability, drivers, mileage and upcoming service requirements for company vehicles.</p></div><button className="button button-light" onClick={() => showNotice("New journey form opened. Driver, vehicle and odometer fields are ready for connection.")}><Plus size={17} /> Log vehicle use</button></div><div className="metric-grid"><MetricCard icon={CarFront} label="Registered vehicles" value="4" detail="3 currently available" tone="burgundy" /><MetricCard icon={Route} label="Distance this month" value="1,284 km" detail="38 recorded trips" tone="blue" /><MetricCard icon={Gauge} label="Average utilisation" value="64%" detail="Within normal range" tone="green" /><MetricCard icon={Wrench} label="Service attention" value="1" detail="Due within 600 km" tone="violet" /></div><section className="card vehicle-section"><SectionHeader kicker="Live fleet" title="Vehicle status" /><div className="vehicle-grid">{vehicles.map((vehicle) => { const remaining = vehicle.serviceAt - vehicle.mileage; const progress = Math.min(100, vehicle.mileage / vehicle.serviceAt * 100); return <article key={vehicle.id} className="vehicle-card"><header><span><CarFront size={22} /></span><div><strong>{vehicle.plate}</strong><small>{vehicle.model}</small></div><em className={vehicle.status.toLowerCase().replace(" ", "-")}>{vehicle.status}</em></header><div className="vehicle-meta"><span><small>Category</small><strong>{vehicle.category}</strong></span><span><small>Assigned to</small><strong>{vehicle.assigned}</strong></span></div><div className="odometer"><span><small>Current mileage</small><strong>{formatNumber(vehicle.mileage)} <em>km</em></strong></span><Gauge size={18} /></div><div className="service-meter"><div><span>Next service</span><strong>{formatNumber(vehicle.serviceAt)} km</strong></div><div><i className={remaining < 1000 ? "warning" : ""} style={{ width: `${progress}%` }} /></div><small>{formatNumber(remaining)} km remaining</small></div></article>; })}</div></section><section className="card data-card"><SectionHeader kicker="Usage log" title="Recent journeys" action="Export log" /><div className="table-wrap"><table className="data-table trip-table"><thead><tr><th>Trip</th><th>Vehicle</th><th>Driver</th><th>Destination</th><th>Purpose</th><th>Distance</th><th>Status</th></tr></thead><tbody>{vehicleTrips.map((trip) => <tr key={trip.id}><td><strong>{trip.id}</strong><small>{trip.date}</small></td><td><strong>{trip.vehicle}</strong></td><td>{trip.driver}</td><td><MapPin size={14} /> {trip.destination}</td><td>{trip.purpose}</td><td><strong>{trip.distance} km</strong></td><td><span className={`status-badge ${trip.status.toLowerCase().replace(" ", "-")}`}>{trip.status}</span></td></tr>)}</tbody></table></div></section></section>;
}

function Avatar({ initials }: { initials: string }) { return <span className="avatar">{initials}</span>; }
export default App;
