import type { EmployeeStatus, TrainingCourseStatus } from "@hr-training/shared";

export type Department = {
  id: string;
  code: string;
  name: string;
  hodName?: string | null;
  hodEmail?: string | null;
  hodEmployeeId?: string | null;
  hodEmployee?: Pick<Employee,"id"|"employeeId"|"name"|"email"|"status"> | null;
};

export type Employee = {
  id: string;
  employeeId: string;
  name?: string | null;
  email?: string | null;
  superiorName?: string | null;
  superiorEmail?: string | null;
  hodName?: string | null;
  hodEmail?: string | null;
  company?: string | null;
  base?: string | null;
  section?: string | null;
  group?: string | null;
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
  emailDelivery?: { queued: number; recipients: number; withoutEmail: number; enabled: boolean; historical: boolean; requested: boolean };
  id: string;
  dateStart: string;
  dateEnd?: string | null;
  trainerName?: string | null;
  venue?: string | null;
  capacity?: number | null;
  deliveryMethod?: string | null;
  attendanceEnabled?: boolean;
  completions?: Array<{ id: string; status: string; hours: number; checkedInAt?: string | null; attendanceSource?: string | null; employee: Employee }>;
  scopeType: string;
  scopeValue?: string | null;
  course: Course;
  _count: {
    completions: number;
  };
};
