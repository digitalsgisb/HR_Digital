import type { DashboardSummary, EmployeeImportPreview } from "@hr-training/shared";
import { sampleCourses, sampleDashboard, sampleEmployees, sampleSessions } from "./sample-data";
import type { Course, Employee, SessionListItem } from "./types";

const request = async <T>(path: string, options?: RequestInit): Promise<T> => {
  const response = await fetch(path, {
    headers: options?.body instanceof FormData ? undefined : { "Content-Type": "application/json" },
    ...options
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed with ${response.status}`);
  }

  return response.json() as Promise<T>;
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
  }
};
