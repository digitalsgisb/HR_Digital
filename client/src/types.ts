import type { EmployeeStatus, TrainingCourseStatus } from "@hr-training/shared";

export type Department = {
  id: string;
  code: string;
  name: string;
};

export type Employee = {
  id: string;
  employeeId: string;
  name?: string | null;
  email?: string | null;
  company?: string | null;
  base?: string | null;
  line?: string | null;
  role?: string | null;
  status: EmployeeStatus;
  department: Department;
};

export type Course = {
  id: string;
  code: string;
  name: string;
  defaultHours: number;
  category?: string | null;
  status: TrainingCourseStatus;
};

export type SessionListItem = {
  id: string;
  dateStart: string;
  dateEnd?: string | null;
  trainerName?: string | null;
  venue?: string | null;
  capacity?: number | null;
  deliveryMethod?: string | null;
  completions?: Array<{ id: string; status: string; hours: number; employee: Employee }>;
  scopeType: string;
  scopeValue?: string | null;
  course: Course;
  _count: {
    completions: number;
  };
};
