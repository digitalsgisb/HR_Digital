import type { DashboardSummary } from "@hr-training/shared";
import type { Course, Employee, SessionListItem } from "./types";

const departments = {
  production: { id: "dept-production", code: "PRODUCTION", name: "Production" },
  qa: { id: "dept-qa", code: "QUALITY", name: "Quality Management" },
  hr: { id: "dept-hr", code: "HR_ADMIN", name: "HR & Admin" },
  maintenance: { id: "dept-maintenance", code: "MAINTENANCE", name: "Maintenance & Facilities" }
};

export const sampleDashboard: DashboardSummary = {
  stats: {
    activeEmployees: 175,
    departments: 12,
    activeCourses: 48,
    sessions: 22,
    completedRecords: 380,
    totalTrainingHours: 3386
  },
  departmentHours: [
    { department: "Production", hours: 941, employees: 82 },
    { department: "Research & Development", hours: 712, employees: 21 },
    { department: "Quality Management", hours: 406, employees: 18 },
    { department: "HR & Admin", hours: 352, employees: 8 },
    { department: "Maintenance & Facilities", hours: 301, employees: 15 },
    { department: "Supply Chain", hours: 244, employees: 12 }
  ],
  completionByStatus: [
    { status: "COMPLETED", count: 380 },
    { status: "REQUIRED", count: 42 },
    { status: "ABSENT", count: 6 },
    { status: "EXCUSED", count: 4 },
    { status: "NOT_REQUIRED", count: 0 }
  ],
  courseHours: [
    { course: "GMP Refresher", hours: 904 },
    { course: "AppSheet Training", hours: 768 },
    { course: "Workplace Safety", hours: 412 },
    { course: "Line Clearance", hours: 336 },
    { course: "Machine Handling", hours: 288 }
  ],
  upcomingSessions: [
    {
      id: "session-1",
      courseName: "GMP Refresher",
      dateStart: new Date().toISOString(),
      trainerName: "HR Training Team",
      participantCount: 32
    },
    {
      id: "session-2",
      courseName: "Workplace Safety",
      dateStart: new Date(Date.now() + 86400000 * 4).toISOString(),
      trainerName: "Safety Officer",
      participantCount: 18
    }
  ],
  recentCompletions: [
    {
      id: "completion-1",
      employeeId: "EMP001",
      employeeName: "Muhammad Muqri",
      courseName: "AppSheet Training",
      department: "Production",
      status: "COMPLETED",
      hours: 8,
      completedAt: new Date().toISOString()
    },
    {
      id: "completion-2",
      employeeId: "EMP003",
      employeeName: "Siti Nor",
      courseName: "GMP Refresher",
      department: "Quality Management",
      status: "COMPLETED",
      hours: 8,
      completedAt: new Date().toISOString()
    }
  ]
};

export const sampleEmployees: Employee[] = [
  {
    id: "emp-1",
    employeeId: "EMP001",
    name: "Muhammad Muqri",
    line: "Line A",
    role: "Operator",
    status: "ACTIVE",
    department: departments.production
  },
  {
    id: "emp-2",
    employeeId: "EMP002",
    name: "Abd Rahman",
    line: "Line A",
    role: "Operator",
    status: "ACTIVE",
    department: departments.production
  },
  {
    id: "emp-3",
    employeeId: "EMP003",
    name: "Siti Nor",
    role: "QA Inspector",
    status: "ACTIVE",
    department: departments.qa
  },
  {
    id: "emp-4",
    employeeId: "EMP004",
    name: "Tan Jia",
    role: "HR Executive",
    status: "ACTIVE",
    department: departments.hr
  },
  {
    id: "emp-5",
    employeeId: "EMP005",
    name: "Mohd Sallehuddin",
    role: "Technician",
    status: "ACTIVE",
    department: departments.maintenance
  }
];

export const sampleCourses: Course[] = [
  { id: "course-1", code: "TRN-GMP", name: "GMP Refresher", defaultHours: 8, category: "Mandatory", status: "ACTIVE" },
  { id: "course-2", code: "TRN-APP", name: "AppSheet Training", defaultHours: 8, category: "System", status: "ACTIVE" },
  { id: "course-3", code: "TRN-SAF", name: "Workplace Safety", defaultHours: 4, category: "Safety", status: "ACTIVE" },
  { id: "course-4", code: "TRN-LC", name: "Line Clearance", defaultHours: 3, category: "Production", status: "ACTIVE" }
];

export const sampleSessions: SessionListItem[] = [
  {
    id: "session-1",
    dateStart: new Date().toISOString(),
    trainerName: "HR Training Team",
    scopeType: "DEPARTMENT",
    scopeValue: "Production",
    course: sampleCourses[0],
    _count: { completions: 32 }
  },
  {
    id: "session-2",
    dateStart: new Date(Date.now() + 86400000 * 4).toISOString(),
    trainerName: "Safety Officer",
    scopeType: "LINE",
    scopeValue: "Line A",
    course: sampleCourses[2],
    _count: { completions: 18 }
  }
];
