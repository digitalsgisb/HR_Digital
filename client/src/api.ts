import type { RosterPreview } from "./ProductionRosterImport";
import type {
  DashboardSummary, EmployeeImportPreview, EmployeeEmailImportPreview, Vehicle, VehicleCondition, VehicleStatus, VehicleTrip
} from "@hr-training/shared";
import type { Course, Employee, SessionListItem } from "./types";

export type EmployeeInput = {
  employeeId: string;
  name?: string;
  email?: string;
  hodName?: string | null;
  hodEmail?: string | null;
  company?: string;
  base?: string;
  department: string;
  section?: string | null;
  group?: string | null;
  line?: string;
  role?: string;
  status: Employee["status"];
};

export type VehicleDriver = Pick<Employee, "id" | "employeeId" | "name" | "role"> & {
  department: { id: string; name: string };
};

const request = async <T>(path: string, options?: RequestInit): Promise<T> => {
  const response = await fetch(path, {
    headers: options?.body instanceof FormData ? undefined : { "Content-Type": "application/json" },
    ...options
  });

  if (!response.ok) {
    const body = await response.text();
    let message = body;
    try {
      const parsed = JSON.parse(body) as { message?: string };
      message = parsed.message ?? body;
    } catch { /* Keep the original non-JSON response. */ }
    throw new Error(message || `Request failed with ${response.status}`);
  }

  return response.json() as Promise<T>;
};

export type TrainingPlanInput = {
  title: string; category: string; dateStart: string; dateEnd: string; trainerName: string; venue: string;
  capacity: number; deliveryMethod: string; participantEmployeeIds: string[]; notifyParticipants?: boolean; attendanceEnabled?: boolean;
};

export type VehicleInput = {
  plate: string;
  model: string;
  category: string;
  mileage: number;
  serviceAt: number;
  status: Exclude<VehicleStatus, "IN_USE">;
  assigned: string;
  photo?: string | null;
};

export type TrainingAttendanceData = { id:string;title:string;dateStart:string;dateEnd:string|null;enabled:boolean;url:string|null;opensAt?:string;closesAt?:string;participants:Array<{id:string;employeeId:string;name:string;department:string;checkedInAt:string|null;source:string|null;status:string;hours:number}> };

export const api = {
  identifyFleetDriver: (employeeId: string, signal?: AbortSignal) => request<{ employeeId: string; name: string }>("/api/vehicle-drivers/identify", { method: "POST", body: JSON.stringify({ employeeId }), signal }),
  getTrainingAttendance: (id:string) => request<TrainingAttendanceData>(`/api/training-sessions/${encodeURIComponent(id)}/attendance`),
  enableTrainingAttendance: (id:string,rotate=false) => request<TrainingAttendanceData>(`/api/training-sessions/${encodeURIComponent(id)}/attendance/qr`,{method:"POST",body:JSON.stringify({rotate})}),
  closeTrainingAttendance: (id:string) => request<{closed:boolean}>(`/api/training-sessions/${encodeURIComponent(id)}/attendance/qr`,{method:"DELETE"}),
  trainingEmailStatus: () => request<{ enabled: boolean; ready: boolean; counts: Record<string, number>; failures: Array<{id: string; recipient: string; lastError: string | null; session: {course: {name: string}}}> }>("/api/training-email/status"),
  retryTrainingEmails: () => request<{queued: number}>("/api/training-email/retry", {method: "POST"}),
  emailTestStatus: () => request<import("@hr-training/shared").EmailTestStatus>("/api/email-test/status"),
  emailTestPreview: (id: string) => request<import("@hr-training/shared").EmailTestPreview>(`/api/email-test/preview/${id}`),
  emailTestInbox: () => request<import("@hr-training/shared").EmailTestMessage[]>("/api/email-test/inbox"),
  emailTestVerify: () => request<{ message: string }>("/api/email-test/verify", { method: "POST" }),
  emailTestSend: (templateId: string, recipient: string) => request<import("@hr-training/shared").EmailTestResult>("/api/email-test/send", { method: "POST", body: JSON.stringify({ templateId, recipient }) }),
  async getDashboard(): Promise<DashboardSummary> {
    return request<DashboardSummary>("/api/dashboard/summary");
  },

  previewProductionRoster(file: File) {
    const data = new FormData(); data.append("file", file);
    return request<RosterPreview>("/api/employees/production/preview", { method: "POST", body: data });
  },
  commitProductionRoster(rows: RosterPreview["rows"]) {
    return request<{ imported: number }>("/api/employees/production/commit", { method: "POST", body: JSON.stringify({ rows }) });
  },
  async getEmployees(): Promise<Employee[]> {
    return request<Employee[]>("/api/employees");
  },

  createEmployee(input: EmployeeInput) {
    return request<Employee>("/api/employees", { method: "POST", body: JSON.stringify(input) });
  },

  updateEmployee(id: string, input: EmployeeInput) {
    return request<Employee>(`/api/employees/${id}`, { method: "PUT", body: JSON.stringify(input) });
  },

  removeEmployee(id: string) {
    return request<Employee>(`/api/employees/${id}`, { method: "DELETE" });
  },

  async getCourses(): Promise<Course[]> {
    return request<Course[]>("/api/training-courses");
  },

  async getSessions(): Promise<SessionListItem[]> {
    return request<SessionListItem[]>("/api/training-sessions");
  },

  deleteTrainingSession: (id: string) => request<{deleted: boolean}>(`/api/training-sessions/${encodeURIComponent(id)}`, {method: "DELETE"}),

  createTrainingPlan(input: TrainingPlanInput) {
    return request<SessionListItem>("/api/training-plans", { method: "POST", body: JSON.stringify(input) });
  },

  previewEmployeeImport(file: File) {
    const formData = new FormData();
    formData.append("file", file);
    return request<EmployeeImportPreview>("/api/employees/import/preview", {
      method: "POST",
      body: formData
    });
  },

  previewEmployeeEmails(file: File) {
    const formData = new FormData(); formData.append("file", file);
    return request<EmployeeEmailImportPreview>("/api/employees/emails/preview", { method: "POST", body: formData });
  },

  commitEmployeeEmails(rows: Array<{ employeeId: string; email: string }>, replaceExisting: boolean) {
    return request<{ imported: number; skipped: number }>("/api/employees/emails/commit", { method: "POST", body: JSON.stringify({ rows, replaceExisting }) });
  },

  commitEmployeeImport(rows: EmployeeImportPreview["rows"]) {
    return request<{ imported: number }>("/api/employees/import/commit", {
      method: "POST",
      body: JSON.stringify({ rows })
    });
  },

  getVehicles() {
    return request<Vehicle[]>("/api/vehicles");
  },

  getVehicle(id: string) {
    return request<Vehicle>(`/api/vehicles/${encodeURIComponent(id)}`);
  },

  getVehicleDrivers() {
    return request<VehicleDriver[]>("/api/vehicle-drivers");
  },

  createVehicle(input: VehicleInput) {
    return request<Vehicle>("/api/vehicles", {
      method: "POST",
      body: JSON.stringify(input)
    });
  },

  updateVehicle(id: string, input: VehicleInput) {
    return request<Vehicle>(`/api/vehicles/${id}`, {
      method: "PUT",
      body: JSON.stringify(input)
    });
  },

  removeVehicle(id: string) {
    return request<{ removed: true }>(`/api/vehicles/${id}`, { method: "DELETE" });
  },

  getVehicleTrips() {
    return request<VehicleTrip[]>("/api/vehicle-trips");
  },

  startVehicleTrip(input: {
    vehicleId: string; driverEmployeeId: string; driverName: string; destination: string;
    purpose: string; passengers: number; odometerStart: number; odometerPhotoBefore: string; fuelBefore: number;
    conditionBefore: VehicleCondition; checksBefore: Record<string, boolean>; notesBefore?: string;
  }) {
    return request<VehicleTrip>("/api/vehicle-trips/start", {
      method: "POST",
      body: JSON.stringify(input)
    });
  },

  completeVehicleTrip(id: string, input: {
    odometerEnd: number; odometerPhotoAfter: string; fuelAfter: number; conditionAfter: VehicleCondition;
    checksAfter: Record<string, boolean>; notesAfter?: string;
  }) {
    return request<VehicleTrip>(`/api/vehicle-trips/${id}/complete`, {
      method: "PUT",
      body: JSON.stringify(input)
    });
  }
};
