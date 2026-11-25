export const employeeStatuses = ["ACTIVE", "INACTIVE", "ON_LEAVE", "RESIGNED", "TERMINATED"] as const;
export const emailTestTemplates = ["email-1", "email-2", "email-3", "email-4"] as const;
export type EmailTestTemplate = (typeof emailTestTemplates)[number];
export type EmailTestPreview = { templateId: EmailTestTemplate; subject: string; html: string; text: string };
export type EmailTestStatus = { mode: "preview" | "smtp"; ready: boolean; from: string; allowedRecipients: string[]; issues: string[] };
export type EmailTestMessage = EmailTestPreview & { id: string; recipient: string; createdAt: string; mode: "preview" | "smtp"; messageId: string };
export type EmailTestResult = { id: string; recipient: string; subject: string; mode: "preview" | "smtp"; status: "captured" | "accepted"; messageId: string };
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

export const vehicleTripStatuses = ["BOOKED", "NO_SHOW", "AWAITING_DEPARTURE", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const;
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
  departedAt?: string | null;
  expectedReturnAt?: string | null;
  mileageMismatch?: boolean;
  archivedAt?: string | null;
  removalReason?: string | null;
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
  resumeToken?: string | null;
  /** Booked start; expectedReturnAt is the booked end. */
  bookedFrom?: string | null;
  locationConsent?: boolean;
  arrivedAt?: string | null;
  vehicle?: Vehicle;
};

export type VehicleTripPingKind = "DEPART" | "ARRIVE" | "RETURN";
export type VehicleTripPing = { kind: VehicleTripPingKind; latitude: number; longitude: number; accuracy: number | null; recordedAt: string };
/** A location the driver's phone reported (with consent) at depart, arrive or return. */
export type TripLocation = { latitude: number; longitude: number; accuracy?: number | null };

export type FleetBoardTrip = Pick<VehicleTrip, "id" | "status" | "driverName" | "driverEmployeeId" | "destination" | "purpose" | "startedAt" | "departedAt" | "bookedFrom" | "expectedReturnAt" | "arrivedAt" | "locationConsent"> & { lastPing: VehicleTripPing | null };
export type FleetBoardCar = Pick<Vehicle, "id" | "plate" | "model" | "category" | "photo" | "mileage" | "status"> & { current: FleetBoardTrip | null; next: FleetBoardTrip | null };
export type FleetBoard = { now: string; cars: FleetBoardCar[] };

/** A car's availability for a requested booking window. */
export type VehicleAvailability = Pick<Vehicle, "id" | "plate" | "model" | "category" | "photo" | "mileage" | "status"> & { available: boolean; reason?: string };

/** Where the personal trip link was emailed when a car was reserved. */
export type TripLinkDelivery = "employee" | "hod" | "none";
export type VehicleReservation = VehicleTrip & { linkDelivery: TripLinkDelivery };

export type Vehicle = {
  id: string;
  plate: string;
  model: string;
  category: string;
  mileage: number;
  serviceAt: number;
  serviceDueDate?: string | null;
  status: VehicleStatus;
  assigned: string;
  photo?: string | null;
  archivedAt?: string | null;
  activeTrip?: VehicleTrip | null;
};

export type EmployeeImportRow = {
  employeeId: string;
  email?: string;
  department: string;
  company?: string;
  base?: string;
  name?: string;
  section?: string | null;
  group?: string | null;
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
    sheet?: string;
  };
};

export type EmployeeEmailImportPreview = {
  rows: Array<{
    row: number;
    name: string;
    email: string;
    employeeId?: string;
    existingEmail?: string | null;
    issue?: string;
    invalid?: boolean;
  }>;
  matched: number;
  needsReview: number;
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
