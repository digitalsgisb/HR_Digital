export type TrainingAttendee = {
  id: string;
  name: string;
  department: string;
  role: string;
  status: string;
  hours?: number;
  checkedInAt?: string | null;
};

export type CalendarSession = {
  id: string;
  date: string;
  time: string;
  endTime: string;
  title: string;
  code: string;
  category: string;
  trainer: string;
  venue: string;
  capacity: number;
  status: "Scheduled" | "In progress" | "Completed";
  attendees: TrainingAttendee[];
};

export const trainingSessions: CalendarSession[] = [];
export const employeeTrainingRows: Array<{ id: string; name: string; initials: string; department: string; role: string; completed: number; required: number; hours: number; nextDue: string; risk: string }> = [];
export const notesLibrary: Array<{ id: string; title: string; employee: string; course: string; type: string; size: string; submitted: string; tags: string[]; excerpt: string }> = [];

export const emailAutomations = [
  { id: "email-1", title: "Training day reminder", trigger: "08:00 on training day", audience: "Confirmed participants + manager", channel: "Email", status: "Draft", sent: 0 },
  { id: "email-2", title: "Notes upload request", trigger: "2 hours after session ends", audience: "Attendees marked present", channel: "Email", status: "Draft", sent: 0 },
  { id: "email-3", title: "Post-training effectiveness form", trigger: "3 months after completion", audience: "Employee + line manager", channel: "Email", status: "Draft", sent: 0 },
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

export const departmentReadiness: Array<{ department: string; readiness: number; employees: number }> = [];
