export type TrainingAttendee = {
  id: string;
  name: string;
  department: string;
  role: string;
  status: "Confirmed" | "Pending" | "Completed";
};

export type CalendarSession = {
  id: string;
  date: string;
  time: string;
  endTime: string;
  title: string;
  code: string;
  category: "Compliance" | "Safety" | "System" | "Development";
  trainer: string;
  venue: string;
  capacity: number;
  status: "Scheduled" | "In progress" | "Completed";
  attendees: TrainingAttendee[];
};

export const trainingSessions: CalendarSession[] = [
  {
    id: "ts-001",
    date: "2026-09-07",
    time: "09:00",
    endTime: "12:00",
    title: "Line Clearance Essentials",
    code: "TRN-LC",
    category: "Compliance",
    trainer: "Nur Aisyah",
    venue: "Training Room 2",
    capacity: 16,
    status: "Completed",
    attendees: [
      { id: "EMP001", name: "Muhammad Muqri", department: "Production", role: "Operator", status: "Completed" },
      { id: "EMP002", name: "Abd Rahman", department: "Production", role: "Operator", status: "Completed" },
      { id: "EMP006", name: "Nurul Huda", department: "Quality", role: "QA Executive", status: "Completed" }
    ]
  },
  {
    id: "ts-002",
    date: "2026-09-12",
    time: "08:30",
    endTime: "17:00",
    title: "AppSheet Workflow Training",
    code: "TRN-APP",
    category: "System",
    trainer: "Digital Transformation Unit",
    venue: "Innovation Lab",
    capacity: 20,
    status: "Completed",
    attendees: [
      { id: "EMP004", name: "Tan Jia", department: "HR & Admin", role: "HR Executive", status: "Completed" },
      { id: "EMP007", name: "Firdaus Azmi", department: "Supply Chain", role: "Planner", status: "Completed" },
      { id: "EMP008", name: "Joanne Lim", department: "Finance", role: "Executive", status: "Completed" }
    ]
  },
  {
    id: "ts-003",
    date: "2026-09-21",
    time: "09:00",
    endTime: "17:00",
    title: "GMP Refresher 2026",
    code: "TRN-GMP",
    category: "Compliance",
    trainer: "HR Training Team",
    venue: "Main Conference Room",
    capacity: 32,
    status: "In progress",
    attendees: [
      { id: "EMP001", name: "Muhammad Muqri", department: "Production", role: "Operator", status: "Confirmed" },
      { id: "EMP003", name: "Siti Nor", department: "Quality Management", role: "QA Inspector", status: "Confirmed" },
      { id: "EMP005", name: "Mohd Sallehuddin", department: "Maintenance", role: "Technician", status: "Confirmed" },
      { id: "EMP009", name: "Liyana Rahim", department: "R&D", role: "Chemist", status: "Pending" }
    ]
  },
  {
    id: "ts-004",
    date: "2026-09-25",
    time: "14:00",
    endTime: "17:00",
    title: "Workplace Safety & Emergency Response",
    code: "TRN-SAF",
    category: "Safety",
    trainer: "Ahmad Faizal",
    venue: "Safety Briefing Hall",
    capacity: 18,
    status: "Scheduled",
    attendees: [
      { id: "EMP001", name: "Muhammad Muqri", department: "Production", role: "Operator", status: "Confirmed" },
      { id: "EMP002", name: "Abd Rahman", department: "Production", role: "Operator", status: "Confirmed" },
      { id: "EMP005", name: "Mohd Sallehuddin", department: "Maintenance", role: "Technician", status: "Pending" }
    ]
  },
  {
    id: "ts-005",
    date: "2026-09-29",
    time: "10:00",
    endTime: "12:00",
    title: "Coaching for New Supervisors",
    code: "TRN-LDR",
    category: "Development",
    trainer: "Nadia Karim",
    venue: "Training Room 1",
    capacity: 12,
    status: "Scheduled",
    attendees: [
      { id: "EMP010", name: "Ravi Kumar", department: "Production", role: "Supervisor", status: "Confirmed" },
      { id: "EMP011", name: "Amira Yasmin", department: "Warehouse", role: "Team Lead", status: "Confirmed" }
    ]
  }
];

export const employeeTrainingRows = [
  { id: "EMP001", name: "Muhammad Muqri", initials: "MM", department: "Production", role: "Operator", completed: 8, required: 10, hours: 42, nextDue: "GMP · Today", risk: "Due now" },
  { id: "EMP002", name: "Abd Rahman", initials: "AR", department: "Production", role: "Operator", completed: 9, required: 10, hours: 38, nextDue: "Safety · 25 Sep", risk: "On track" },
  { id: "EMP003", name: "Siti Nor", initials: "SN", department: "Quality Management", role: "QA Inspector", completed: 12, required: 12, hours: 56, nextDue: "Data Integrity · 14 Oct", risk: "Complete" },
  { id: "EMP004", name: "Tan Jia", initials: "TJ", department: "HR & Admin", role: "HR Executive", completed: 7, required: 8, hours: 31, nextDue: "PDPA · 30 Sep", risk: "Attention" },
  { id: "EMP005", name: "Mohd Sallehuddin", initials: "MS", department: "Maintenance", role: "Technician", completed: 10, required: 11, hours: 49, nextDue: "LOTO · 08 Oct", risk: "On track" },
  { id: "EMP006", name: "Nurul Huda", initials: "NH", department: "Quality Management", role: "QA Executive", completed: 11, required: 12, hours: 51, nextDue: "Audit Skills · 11 Oct", risk: "On track" }
];

export const notesLibrary = [
  { id: "NOTE-1042", title: "GMP refresher — key controls", employee: "Muhammad Muqri", course: "GMP Refresher 2026", type: "PDF", size: "2.4 MB", submitted: "21 Sep 2026", tags: ["GMP", "Production"], excerpt: "Personal summary of contamination controls, line clearance checks and reporting responsibilities." },
  { id: "NOTE-1038", title: "AppSheet automation workbook", employee: "Tan Jia", course: "AppSheet Workflow Training", type: "XLSX", size: "840 KB", submitted: "13 Sep 2026", tags: ["System", "Workflow"], excerpt: "Exercise workbook covering approval routing, notifications and dashboard views." },
  { id: "NOTE-1034", title: "Emergency response checklist", employee: "Mohd Sallehuddin", course: "Workplace Safety", type: "DOCX", size: "510 KB", submitted: "02 Sep 2026", tags: ["Safety", "Checklist"], excerpt: "Practical checklist for assembly points, spill isolation and first response responsibilities." },
  { id: "NOTE-1029", title: "Root cause analysis notes", employee: "Siti Nor", course: "Problem Solving Fundamentals", type: "PDF", size: "1.1 MB", submitted: "28 Aug 2026", tags: ["Quality", "RCA"], excerpt: "Worked examples for 5-Why analysis and evidence-based corrective actions." }
];

export const emailAutomations = [
  { id: "email-1", title: "Training day reminder", trigger: "08:00 on training day", audience: "Confirmed participants + manager", channel: "Email", status: "Active", sent: 74 },
  { id: "email-2", title: "Notes upload request", trigger: "2 hours after session ends", audience: "Attendees marked present", channel: "Email", status: "Active", sent: 48 },
  { id: "email-3", title: "Post-training effectiveness form", trigger: "3 months after completion", audience: "Employee + line manager", channel: "Email", status: "Active", sent: 126 },
  { id: "email-4", title: "Overdue action follow-up", trigger: "Every Monday at 09:00", audience: "Outstanding respondents", channel: "Email", status: "Draft", sent: 0 }
];

export const vehicles = [
  { id: "VH-01", plate: "VBU 2841", model: "Toyota Hilux 2.4", category: "Operations", mileage: 48260, serviceAt: 50000, status: "Available", assigned: "Shared pool" },
  { id: "VH-02", plate: "BKV 9132", model: "Honda City 1.5", category: "Management", mileage: 31780, serviceAt: 35000, status: "In use", assigned: "Siti Nor" },
  { id: "VH-03", plate: "VFY 6620", model: "Perodua Alza", category: "Staff transport", mileage: 69440, serviceAt: 70000, status: "Service due", assigned: "Shared pool" },
  { id: "VH-04", plate: "BPP 4418", model: "Toyota Hiace", category: "Logistics", mileage: 22510, serviceAt: 25000, status: "Available", assigned: "Warehouse" }
];

export const vehicleTrips = [
  { id: "TRIP-408", date: "21 Sep", vehicle: "VBU 2841", driver: "Muhammad Muqri", destination: "Port Klang", purpose: "Vendor collection", distance: 86, status: "In progress" },
  { id: "TRIP-407", date: "20 Sep", vehicle: "BKV 9132", driver: "Siti Nor", destination: "Shah Alam", purpose: "Supplier audit", distance: 42, status: "Completed" },
  { id: "TRIP-406", date: "19 Sep", vehicle: "BPP 4418", driver: "Firdaus Azmi", destination: "Subang Jaya", purpose: "Document delivery", distance: 34, status: "Completed" },
  { id: "TRIP-405", date: "18 Sep", vehicle: "VFY 6620", driver: "Tan Jia", destination: "Klang", purpose: "Recruitment event", distance: 51, status: "Completed" }
];

export const departmentReadiness = [
  { department: "Production", readiness: 89, employees: 82 },
  { department: "Quality", readiness: 96, employees: 18 },
  { department: "R&D", readiness: 84, employees: 21 },
  { department: "HR & Admin", readiness: 92, employees: 8 },
  { department: "Maintenance", readiness: 78, employees: 15 },
  { department: "Supply Chain", readiness: 87, employees: 12 }
];
