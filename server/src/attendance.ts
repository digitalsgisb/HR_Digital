import { randomBytes } from "node:crypto";
import { z } from "zod";
import { prisma } from "./prisma.js";
import { env } from "./env.js";

export class AttendanceError extends Error { constructor(public status: number, message: string) { super(message); } }
export const attendanceTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{32}$/, "Attendance link is invalid.");
export const checkInSchema = z.object({ employeeId: z.string().trim().min(1).max(100), name: z.string().trim().min(2).max(200), confirmed: z.literal(true) });
export const normalizeAttendanceName = (name: string) => name.normalize("NFKC").toLocaleUpperCase("en").replace(/[\p{P}\p{Z}\s]+/gu, " ").trim();
export function attendanceWindow(session: { dateStart: Date; dateEnd: Date | null }) {
  if (!session.dateEnd || session.dateEnd <= session.dateStart) throw new AttendanceError(400, "Set a valid training end time before enabling QR attendance.");
  return { opensAt: new Date(session.dateStart.getTime() - 30 * 60000), closesAt: new Date(session.dateEnd.getTime() + 2 * 3600000) };
}
export const sessionHours = (start: Date, end: Date) => Math.round((end.getTime() - start.getTime()) / 36000) / 100;
export const attendanceUrl = (token: string) => new URL(`/attendance/${token}`, process.env.ATTENDANCE_BASE_URL?.trim() || (env.nodeEnv === "production" ? env.clientOrigin : `http://localhost:${env.port}`)).toString();
export const isInternalTraining = (method: string) => /internal|ojt|on.the.job/i.test(method);

export async function getAttendance(sessionId: string) {
  const session = await prisma.trainingSession.findFirst({ where: { id: sessionId, archivedAt: null }, include: { course: true, completions: { include: { employee: { include: { department: true } } }, orderBy: { employee: { employeeId: "asc" } } } } });
  if (!session) throw new AttendanceError(404, "Training was not found.");
  const window = session.dateEnd ? attendanceWindow(session) : null;
  return { id: session.id, title: session.course.name, dateStart: session.dateStart, dateEnd: session.dateEnd, enabled: session.attendanceEnabled,
    url: session.attendanceEnabled && session.attendanceToken ? attendanceUrl(session.attendanceToken) : null, ...window,
    participants: session.completions.map(record => ({ id: record.id, employeeId: record.employee.employeeId, name: record.employee.name || record.employee.employeeId, department: record.employee.department.name, checkedInAt: record.checkedInAt, source: record.attendanceSource, status: record.status, hours: record.hours })) };
}

export async function enableAttendance(sessionId: string, rotate = false) {
  await prisma.$transaction(async tx => {
    const session = await tx.trainingSession.findFirst({ where: { id: sessionId, archivedAt: null } });
    if (!session) throw new AttendanceError(404, "Training was not found.");
    attendanceWindow(session);
    if (!session.attendanceEnabled || !session.attendanceToken || rotate) await tx.trainingSession.update({ where: { id: sessionId, archivedAt: null }, data: { attendanceEnabled: true, attendanceToken: randomBytes(24).toString("base64url") } });
  });
  return getAttendance(sessionId);
}

export async function publicAttendanceSession(token: string, now = new Date()) {
  if (!attendanceTokenSchema.safeParse(token).success) throw new AttendanceError(404, "Attendance link is invalid or closed. Please ask HR for the current QR code.");
  const session = await prisma.trainingSession.findFirst({ where: { attendanceToken: token, attendanceEnabled: true, archivedAt: null }, include: { course: true } });
  if (!session) throw new AttendanceError(404, "Attendance link is invalid or closed. Please ask HR for the current QR code.");
  const window = attendanceWindow(session);
  if (now > window.closesAt) throw new AttendanceError(410, "Attendance has closed for this training. Please contact HR if your attendance is missing.");
  return { session, ...window };
}

export async function registerAttendance(token: string, input: z.infer<typeof checkInSchema>, now = new Date()) {
  const { session, opensAt } = await publicAttendanceSession(token, now);
  if (now < opensAt) throw new AttendanceError(409, "Check-in opens 30 minutes before training starts. Please scan again then.");
  return prisma.$transaction(async tx => {
    const record = await tx.trainingCompletion.findFirst({ where: { sessionId: session.id, employee: { employeeId: { equals: input.employeeId, mode: "insensitive" }, status: "ACTIVE" } }, include: { employee: true } });
    if (!record || !record.employee.name || normalizeAttendanceName(record.employee.name) !== normalizeAttendanceName(input.name)) throw new AttendanceError(400, "Employee ID and name must match a participant selected for this training. Please check your details or contact HR.");
    if (!["REQUIRED", "COMPLETED"].includes(record.status)) throw new AttendanceError(409, "Please ask HR to review your attendance status for this training.");
    if (record.checkedInAt) return { message: "Your attendance is already registered.", checkedInAt: record.checkedInAt, name: record.employee.name, training: session.course.name };
    const ended = session.dateEnd! <= now && record.status === "REQUIRED";
    const result = await tx.trainingCompletion.updateMany({ where: { id: record.id, checkedInAt: null, status: { in: ["REQUIRED", "COMPLETED"] }, employee: { status: "ACTIVE" }, session: { archivedAt: null, attendanceEnabled: true, attendanceToken: token, dateStart: { lte: new Date(now.getTime() + 30 * 60000) }, dateEnd: { gte: new Date(now.getTime() - 2 * 3600000) } } }, data: { checkedInAt: now, attendanceSource: "QR", ...(ended ? { status: "COMPLETED", hours: sessionHours(session.dateStart, session.dateEnd!), completedAt: session.dateEnd } : {}) } });
    if (!result.count) {
      const saved = await tx.trainingCompletion.findUnique({ where: { id: record.id } });
      if (saved?.checkedInAt) return { message: "Your attendance is already registered.", checkedInAt: saved.checkedInAt, name: record.employee.name, training: session.course.name };
      throw new AttendanceError(409, "This attendance link has changed. Please scan the latest QR code from HR.");
    }
    return { message: "Attendance registered. Thank you!", checkedInAt: now, name: record.employee.name, training: session.course.name };
  });
}

export async function finalizeTrainingAttendance(now = new Date()) {
  const sessions = await prisma.trainingSession.findMany({ where: { archivedAt: null, dateEnd: { lte: now }, completions: { some: { checkedInAt: { not: null }, status: "REQUIRED" } } }, select: { id: true, dateStart: true, dateEnd: true } });
  for (const session of sessions) {
    if (!session.dateEnd || session.dateEnd <= session.dateStart) continue;
    await prisma.trainingCompletion.updateMany({ where: { sessionId: session.id, checkedInAt: { not: null }, status: "REQUIRED", session: { archivedAt: null } }, data: { status: "COMPLETED", completedAt: session.dateEnd, hours: sessionHours(session.dateStart, session.dateEnd) } });
  }
}

export function startAttendanceWorker() {
  if (!env.databaseUrl) return;
  let busy = false;
  const tick = async () => { if (busy) return; busy = true; try { await finalizeTrainingAttendance(); } catch { console.error("Training attendance could not be finalized. Check database connectivity and schema."); } finally { busy = false; } };
  const timer = setInterval(() => { void tick(); }, 60000); timer.unref(); void tick();
}
