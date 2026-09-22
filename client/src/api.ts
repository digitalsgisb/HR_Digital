import type {
  DashboardSummary, EmployeeImportPreview, Vehicle, VehicleCondition, VehicleStatus, VehicleTrip
} from "@hr-training/shared";
import { sampleCourses, sampleDashboard, sampleEmployees, sampleSessions } from "./sample-data";
import type { Course, Employee, SessionListItem } from "./types";

export type EmployeeInput = {
  employeeId: string;
  name?: string;
  email?: string;
  department: string;
  line?: string;
  role?: string;
  status: Employee["status"];
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

export const api = {
  async getDashboard(): Promise<DashboardSummary> {
    try {
      return await request<DashboardSummary>("/api/dashboard/summary");
    } catch {
      return sampleDashboard;
    }
  },

  async getEmployees(): Promise<Employee[]> {
    try {
      return await request<Employee[]>("/api/employees");
    } catch {
      return sampleEmployees;
    }
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
    try {
      return await request<Course[]>("/api/training-courses");
    } catch {
      return sampleCourses;
    }
  },

  async getSessions(): Promise<SessionListItem[]> {
    try {
      return await request<SessionListItem[]>("/api/training-sessions");
    } catch {
      return sampleSessions;
    }
  },

  previewEmployeeImport(file: File) {
    const formData = new FormData();
    formData.append("file", file);
    return request<EmployeeImportPreview>("/api/employees/import/preview", {
      method: "POST",
      body: formData
    });
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
