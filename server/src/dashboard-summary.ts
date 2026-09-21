import type { CompletionStatus } from "@hr-training/shared";

export type CompletionRecordForSummary = {
  department: string;
  employeeId: string;
  courseName: string;
  status: CompletionStatus;
  hours: number;
};

export const summarizeDepartmentHours = (records: CompletionRecordForSummary[]) => {
  const departmentMap = new Map<string, { department: string; hours: number; employees: Set<string> }>();

  for (const record of records) {
    const current =
      departmentMap.get(record.department) ??
      { department: record.department, hours: 0, employees: new Set<string>() };

    if (record.status === "COMPLETED") {
      current.hours += record.hours;
    }

    current.employees.add(record.employeeId);
    departmentMap.set(record.department, current);
  }

  return [...departmentMap.values()]
    .map((item) => ({
      department: item.department,
      hours: Number(item.hours.toFixed(2)),
      employees: item.employees.size
    }))
    .sort((a, b) => b.hours - a.hours);
};

export const summarizeCourseHours = (records: CompletionRecordForSummary[]) => {
  const courseMap = new Map<string, number>();

  for (const record of records) {
    if (record.status !== "COMPLETED") continue;
    courseMap.set(record.courseName, (courseMap.get(record.courseName) ?? 0) + record.hours);
  }

  return [...courseMap.entries()]
    .map(([course, hours]) => ({ course, hours: Number(hours.toFixed(2)) }))
    .sort((a, b) => b.hours - a.hours)
    .slice(0, 8);
};
