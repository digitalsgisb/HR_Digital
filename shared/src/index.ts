export const employeeStatuses = ["ACTIVE", "INACTIVE", "RESIGNED"] as const;
export type EmployeeStatus = (typeof employeeStatuses)[number];

export const courseStatuses = ["ACTIVE", "ARCHIVED"] as const;
export type TrainingCourseStatus = (typeof courseStatuses)[number];

export const completionStatuses = [
  "REQUIRED",
  "COMPLETED",
  "ABSENT",
  "EXCUSED",
  "NOT_REQUIRED"
] as const;
export type CompletionStatus = (typeof completionStatuses)[number];

export const userRoles = [
  "HR_ADMIN",
  "HR_STAFF",
  "TRAINER",
  "SUPERVISOR",
  "VIEWER"
] as const;
export type UserRole = (typeof userRoles)[number];

export type EmployeeImportRow = {
  employeeId: string;
  department: string;
  name?: string;
  line?: string;
  role?: string;
  status: EmployeeStatus;
};

export type EmployeeImportError = {
  row: number;
  field: string;
  message: string;
};

export type EmployeeImportPreview = {
  rows: EmployeeImportRow[];
  errors: EmployeeImportError[];
  meta: {
    totalRows: number;
    validRows: number;
    invalidRows: number;
  };
};

export type DashboardSummary = {
  stats: {
    activeEmployees: number;
    departments: number;
    activeCourses: number;
    sessions: number;
    completedRecords: number;
    totalTrainingHours: number;
  };
  departmentHours: Array<{
    department: string;
    hours: number;
    employees: number;
  }>;
  completionByStatus: Array<{
    status: CompletionStatus;
    count: number;
  }>;
  courseHours: Array<{
    course: string;
    hours: number;
  }>;
  upcomingSessions: Array<{
    id: string;
    courseName: string;
    dateStart: string;
    trainerName?: string | null;
    participantCount: number;
  }>;
  recentCompletions: Array<{
    id: string;
    employeeId: string;
    employeeName?: string | null;
    courseName: string;
    department: string;
    status: CompletionStatus;
    hours: number;
    completedAt?: string | null;
  }>;
};
