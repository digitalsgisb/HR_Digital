export const employeeStatuses = ["ACTIVE", "INACTIVE", "ON_LEAVE", "RESIGNED", "TERMINATED"] as const;
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

export const vehicleStatuses = ["AVAILABLE", "IN_USE", "SERVICE_DUE", "OUT_OF_SERVICE"] as const;
export type VehicleStatus = (typeof vehicleStatuses)[number];

export const vehicleConditions = ["GOOD", "ATTENTION_REQUIRED", "UNSAFE"] as const;
export type VehicleCondition = (typeof vehicleConditions)[number];

export const vehicleTripStatuses = ["IN_PROGRESS", "COMPLETED"] as const;
export type VehicleTripStatus = (typeof vehicleTripStatuses)[number];

export type VehicleTrip = {
  id: string;
  vehicleId: string;
  driverEmployeeId: string;
  driverName: string;
  destination: string;
  purpose: string;
  passengers: number;
  startedAt: string;
  endedAt?: string | null;
  odometerStart: number;
  odometerEnd?: number | null;
  odometerPhotoBefore?: string | null;
  odometerPhotoAfter?: string | null;
  fuelBefore: number;
  fuelAfter?: number | null;
  conditionBefore: VehicleCondition;
  conditionAfter?: VehicleCondition | null;
  checksBefore: Record<string, boolean>;
  checksAfter?: Record<string, boolean> | null;
  notesBefore?: string | null;
  notesAfter?: string | null;
  status: VehicleTripStatus;
  vehicle?: Vehicle;
};

export type Vehicle = {
  id: string;
  plate: string;
  model: string;
  category: string;
  mileage: number;
  serviceAt: number;
  status: VehicleStatus;
  assigned: string;
  photo?: string | null;
  archivedAt?: string | null;
  activeTrip?: VehicleTrip | null;
};

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
