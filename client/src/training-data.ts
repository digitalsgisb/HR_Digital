import type { CalendarSession } from "./portal-data.js";
import type { SessionListItem } from "./types.js";
import { malaysiaDate, malaysiaTime } from "./calendar-utils.js";

export function toCalendarSession(session: SessionListItem, now = new Date()): CalendarSession {
  const completions = session.completions ?? [];
  const completed = completions.length > 0 && completions.every((record) => record.status === "COMPLETED");
  const inProgress = new Date(session.dateStart) <= now && !!session.dateEnd && new Date(session.dateEnd) >= now;
  return {
    id: session.id, date: malaysiaDate(new Date(session.dateStart)), time: malaysiaTime(session.dateStart),
    endTime: session.dateEnd ? malaysiaTime(session.dateEnd) : "", title: session.course.name, code: session.course.code,
    category: session.course.category || "Development", trainer: session.trainerName || "", venue: session.venue || "",
    capacity: session.capacity ?? 0, status: completed ? "Completed" : inProgress ? "In progress" : "Scheduled",
    attendees: completions.map((record) => ({ id: record.employee.id, name: record.employee.name || record.employee.employeeId,
      section: record.employee.section, line: record.employee.line, group: record.employee.group,
      department: record.employee.department.name, role: record.employee.role || "", hours: record.hours, checkedInAt: record.checkedInAt,
      status: record.status.toLowerCase().replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase()) }))
  };
}
