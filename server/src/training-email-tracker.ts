import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";
import { processTrainingEmails, trainingEmailReady } from "./training-email.js";
import { reminderProgress } from "./training-email-schedule.js";

// Emails in the order a participant receives them.
export const trackerKinds = ["INVITATION", "REMINDER", "FOLLOW_UP", "SUMMARY_REMINDER", "HOD_SUMMARY", "SUPERIOR_REVIEW"] as const;
export type TrainingPhase = "UPCOMING" | "IN_PROGRESS" | "FOLLOW_UP";
// What HR needs to know about one email for one participant. A recurring
// reminder returns to PENDING after each send, so "sent" is derived from sentAt.
export type EmailState = "SCHEDULED" | "SENDING" | "SENT" | "RECURRING" | "FAILED" | "CANCELLED";

type JobLite = { id: string; employeeId: string; kind: string; status: string; recipient: string; dueAt: Date; sentAt: Date | null; lastError: string | null };
type CompletionLite = { employeeId: string; status: string; summarySubmittedAt: Date | null; employee: { status: string; email: string | null } };
type SessionLite = { dateStart: Date; dateEnd: Date | null };

const DAY = 86400000;
const activeStatuses = ["PENDING", "SENDING", "FAILED"];

export function trainingPhase(session: SessionLite, now = new Date()): TrainingPhase {
  if (session.dateStart > now) return "UPCOMING";
  return (session.dateEnd ?? session.dateStart) >= now ? "IN_PROGRESS" : "FOLLOW_UP";
}

export function emailState(job: Pick<JobLite, "status" | "sentAt">): EmailState {
  if (job.status === "FAILED" || job.status === "SENDING") return job.status;
  if (job.status === "SENT") return "SENT";
  if (job.status === "PENDING") return job.sentAt ? "RECURRING" : "SCHEDULED";
  // Reminders stop (CANCELLED) once the participant submits; earlier sends still count.
  return job.sentAt ? "SENT" : "CANCELLED";
}

const evaluationEligible = (record: CompletionLite) => record.employee.status === "ACTIVE" && ["REQUIRED", "COMPLETED"].includes(record.status);

export function summarizeTrainingEmails(session: SessionLite & { completions: CompletionLite[]; emailJobs: JobLite[] }, sends: number, now = new Date()) {
  const byKind = Object.fromEntries(trackerKinds.map(kind => [kind, { sent: 0, scheduled: 0, failed: 0, cancelled: 0 }]));
  for (const job of session.emailJobs) {
    const counts = byKind[job.kind] ??= { sent: 0, scheduled: 0, failed: 0, cancelled: 0 };
    const state = emailState(job);
    if (state === "SENT" || state === "RECURRING") counts.sent++;
    if (state === "SCHEDULED" || state === "SENDING") counts.scheduled++;
    if (state === "FAILED") counts.failed++;
    if (state === "CANCELLED") counts.cancelled++;
  }
  const eligible = session.completions.filter(evaluationEligible);
  const ended = (session.dateEnd ?? session.dateStart) < now;
  const lastSent = Math.max(0, ...session.emailJobs.map(job => job.sentAt?.getTime() ?? 0));
  return {
    phase: trainingPhase(session, now),
    participants: session.completions.length,
    withoutEmail: session.completions.filter(record => !record.employee.email?.trim()).length,
    evaluations: { eligible: eligible.length, submitted: eligible.filter(record => record.summarySubmittedAt).length, outstanding: ended ? eligible.filter(record => !record.summarySubmittedAt).length : 0 },
    emails: {
      sent: session.emailJobs.filter(job => job.sentAt).length,
      scheduled: session.emailJobs.filter(job => job.status === "PENDING" || job.status === "SENDING").length,
      failed: session.emailJobs.filter(job => job.status === "FAILED").length,
      sends,
      lastSentAt: lastSent ? new Date(lastSent) : null
    },
    byKind
  };
}

// Upcoming, running, or still chasing participants/HODs. A short grace period
// keeps just-finished training visible even when no follow-up is queued.
export function currentTrainingWhere(now = new Date()): Prisma.TrainingSessionWhereInput {
  const recent = new Date(now.getTime() - 7 * DAY);
  return { archivedAt: null, OR: [{ dateStart: { gte: recent } }, { dateEnd: { gte: recent } }, { emailJobs: { some: { status: { in: activeStatuses } } } }] };
}

const phaseOrder: Record<TrainingPhase, number> = { IN_PROGRESS: 0, UPCOMING: 1, FOLLOW_UP: 2 };
export function sortTrainings<T extends { phase: TrainingPhase; dateStart: Date }>(rows: T[]) {
  return [...rows].sort((a, b) => phaseOrder[a.phase] - phaseOrder[b.phase] || (a.phase === "FOLLOW_UP" ? b.dateStart.getTime() - a.dateStart.getTime() : a.dateStart.getTime() - b.dateStart.getTime()));
}

const jobSelect = { id: true, employeeId: true, kind: true, status: true, recipient: true, dueAt: true, sentAt: true, lastError: true } as const;

class HttpError extends Error { constructor(public readonly status: number, message: string) { super(message); } }
const asyncHandler = (handler: (req: Request, res: Response) => Promise<void>) => (req: Request, res: Response, next: NextFunction) => { handler(req, res).catch(next); };
const param = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value ?? "");

export function createTrainingEmailTrackerRouter() {
  const router = Router();

  router.get("/training-email/trainings", asyncHandler(async (req, res) => {
    const { scope } = z.object({ scope: z.enum(["current", "all"]).default("current") }).parse(req.query);
    const now = new Date();
    const sessions = await prisma.trainingSession.findMany({
      where: scope === "current" ? currentTrainingWhere(now) : { archivedAt: null },
      include: { course: true, completions: { select: { employeeId: true, status: true, summarySubmittedAt: true, employee: { select: { status: true, email: true } } } }, emailJobs: { select: jobSelect } },
      orderBy: { dateStart: "desc" }, take: 200
    });
    const sendCounts = sessions.length ? await prisma.trainingEmailEvent.groupBy({ by: ["sessionId"], where: { sessionId: { in: sessions.map(session => session.id) }, outcome: "SENT" }, _count: true }) : [];
    const rows = sessions.map(session => ({
      id: session.id, title: session.course.name, code: session.course.code, category: session.course.category,
      dateStart: session.dateStart, dateEnd: session.dateEnd, venue: session.venue, trainer: session.trainerName,
      ...summarizeTrainingEmails(session, sendCounts.find(row => row.sessionId === session.id)?._count ?? 0, now)
    }));
    res.json({ ready: trainingEmailReady(), trainings: sortTrainings(rows) });
  }));

  router.get("/training-email/trainings/:id", asyncHandler(async (req, res) => {
    const now = new Date();
    const session = await prisma.trainingSession.findFirst({
      where: { id: param(req.params.id), archivedAt: null },
      include: {
        course: true, emailJobs: { select: jobSelect },
        completions: { select: { employeeId: true, status: true, checkedInAt: true, summarySubmittedAt: true, reviewSubmittedAt: true, employee: { select: { employeeId: true, name: true, email: true, status: true, department: { select: { name: true } } } } }, orderBy: { employee: { employeeId: "asc" } } }
      }
    });
    if (!session) throw new HttpError(404, "Training was not found.");
    const events = await prisma.trainingEmailEvent.findMany({ where: { sessionId: session.id }, orderBy: { createdAt: "desc" }, take: 500, select: { id: true, jobId: true, employeeId: true, kind: true, recipient: true, cc: true, outcome: true, error: true, createdAt: true } });
    const sends = (jobId: string) => events.filter(event => event.jobId === jobId && event.outcome === "SENT").length;
    res.json({
      id: session.id, title: session.course.name, code: session.course.code, dateStart: session.dateStart, dateEnd: session.dateEnd, venue: session.venue, trainer: session.trainerName,
      ready: trainingEmailReady(),
      ...summarizeTrainingEmails(session, events.filter(event => event.outcome === "SENT").length, now),
      participants: session.completions.map(record => ({
        employeeId: record.employeeId, staffId: record.employee.employeeId, name: record.employee.name || record.employee.employeeId,
        department: record.employee.department.name, email: record.employee.email, employeeStatus: record.employee.status,
        attendance: record.status, checkedInAt: record.checkedInAt, summarySubmittedAt: record.summarySubmittedAt, reviewSubmittedAt: record.reviewSubmittedAt,
        emails: Object.fromEntries(session.emailJobs.filter(job => job.employeeId === record.employeeId).map(job => [job.kind, { ...job, state: emailState(job), sends: sends(job.id), ...reminderProgress(job.kind, sends(job.id)) }])),
        history: events.filter(event => event.employeeId === record.employeeId)
      }))
    });
  }));

  // Retries one failed email; the scheduled worker still applies every eligibility check.
  router.post("/training-email/jobs/:id/retry", asyncHandler(async (req, res) => {
    if (!trainingEmailReady()) throw new HttpError(503, "Configure SMTP and enable training emails before retrying.");
    const result = await prisma.trainingEmailJob.updateMany({ where: { id: param(req.params.id), status: "FAILED", expiresAt: { gt: new Date() }, session: { archivedAt: null } }, data: { status: "PENDING", attempts: 0, dueAt: new Date(), lastError: null } });
    if (!result.count) throw new HttpError(409, "This email can no longer be retried. Refresh to see its latest status.");
    res.json({ queued: true });
    void processTrainingEmails().catch(() => {});
  }));

  return router;
}
