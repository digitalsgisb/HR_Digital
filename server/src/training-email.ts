import { departmentWithHod } from "./department-hod.js";
import { trainingEmailTemplate, renderConfiguredTrainingEmail, trainingEmailCopies } from "./training-email-templates.js";
import { participantFields, resolvedHod, resolvedHodName } from "./training-evaluation.js";
import { trainingPortalUrl } from "./training-portal.js";
import { attendanceUrl } from "./attendance.js";
import { z } from "zod";
import nodemailer, { type SendMailOptions } from "nodemailer";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { env } from "./env.js";
import { prisma } from "./prisma.js";
import { emailLogo, emailLogoCid } from "./email-template.js";
import { ESCALATE_FROM_REMINDER, eligibleTrainingEmailRecipient, nextReminderAt, trainingEmailSchedule } from "./training-email-schedule.js";

export const trainingEmailEnabled = () => process.env.EMAIL_AUTOMATION_ENABLED !== "false";
export const trainingEmailReady = () => trainingEmailEnabled() && env.emailTransport === "smtp" && !!env.smtpHost && (!env.smtpUser || !!env.smtpPassword);

export async function queueTrainingEmails(tx: Prisma.TransactionClient, session: { id: string; dateStart: Date; dateEnd: Date | null }, notify = true, now = new Date()) {
  const participants = await tx.trainingCompletion.findMany({ where: { sessionId: session.id }, include: { employee: true } });
  const recipients = participants.filter(record => eligibleTrainingEmailRecipient(record.employee, record.status));
  const schedule = notify ? trainingEmailSchedule(session.dateStart, now) : [];
  const result = await tx.trainingEmailJob.createMany({ data: recipients.flatMap(record => schedule.map(job => ({ ...job, sessionId: session.id, employeeId: record.employeeId, recipient: record.employee.email!.trim().toLowerCase() }))), skipDuplicates: true });
  return { queued: result.count, recipients: recipients.length, withoutEmail: participants.length - recipients.length, enabled: trainingEmailReady(), historical: session.dateStart <= now, requested: notify };
}

const FOREVER = new Date("9999-12-31");
const activeJobStatuses = ["PENDING", "SENDING", "FAILED"];

// Every participant HR has not excluded (ABSENT / EXCUSED / NOT_REQUIRED) is asked
// to evaluate once the training has ended, whether or not they checked in and
// whatever the plan's notify setting was. Run on every worker tick, this also
// catches up past training, people added after the event and changed end dates.
export async function ensureEvaluationEmails(db = prisma, now = new Date()) {
  const outstanding = await db.trainingCompletion.findMany({
    where: { summarySubmittedAt: null, status: { in: ["REQUIRED", "COMPLETED"] }, employee: { status: "ACTIVE", email: { not: null } }, session: { archivedAt: null, dateEnd: { lte: now } } },
    select: { sessionId: true, employeeId: true, status: true, employee: { select: { email: true, status: true } } }
  });
  const eligible = outstanding.filter(record => eligibleTrainingEmailRecipient(record.employee, record.status));
  if (!eligible.length) return 0;
  const jobs = await db.trainingEmailJob.findMany({ where: { kind: { in: ["FOLLOW_UP", "SUMMARY_REMINDER"] }, sessionId: { in: [...new Set(eligible.map(record => record.sessionId))] } }, select: { sessionId: true, employeeId: true, kind: true, status: true } });
  let queued = 0;
  for (const record of eligible) {
    const own = jobs.filter(job => job.sessionId === record.sessionId && job.employeeId === record.employeeId);
    if (own.some(job => activeJobStatuses.includes(job.status))) continue;
    const key = (kind: string) => ({ sessionId_employeeId_kind: { sessionId: record.sessionId, employeeId: record.employeeId, kind } });
    const recipient = record.employee.email!.trim().toLowerCase();
    // Already asked once (reminders were stopped, e.g. marked absent and later restored): resume reminders.
    const kind = own.some(job => job.kind === "FOLLOW_UP" && job.status === "SENT") ? "SUMMARY_REMINDER" : "FOLLOW_UP";
    const dueAt = kind === "FOLLOW_UP" ? now : nextReminderAt(now);
    const reset = { status: "PENDING", dueAt, expiresAt: FOREVER, attempts: 0, claimToken: null, lockedAt: null, lastError: null, recipient };
    await db.trainingEmailJob.upsert({ where: key(kind), create: { sessionId: record.sessionId, employeeId: record.employeeId, kind, recipient, dueAt, expiresAt: FOREVER }, update: reset });
    queued++;
  }
  return queued;
}

const transport = nodemailer.createTransport({ host: env.smtpHost, port: env.smtpPort, secure: env.smtpSecure, requireTLS: env.smtpRequireTls,
  auth: env.smtpUser ? { user: env.smtpUser, pass: env.smtpPassword } : undefined,
  connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000, disableFileAccess: true, disableUrlAccess: true });
export const sendSmtpMail = (message: SendMailOptions): Promise<{ rejected?: unknown[] }> => transport.sendMail(message);

// An atomic lease makes overlapping ticks/processes compete for the same job.
// The queue and stable Message-ID survive restarts. SMTP itself cannot provide
// exactly-once delivery if a process stops after SMTP acceptance but before commit.
export async function processTrainingEmails(now = new Date(), db = prisma, sendMail: (message: SendMailOptions) => Promise<{ rejected?: unknown[] }> = message => transport.sendMail(message)) {
  if (!trainingEmailReady()) return;
  const stale = new Date(now.getTime() - 30 * 60000);
  await db.trainingEmailJob.updateMany({ where: { status: "SENDING", lockedAt: { lt: stale }, attempts: { gte: 5 } }, data: { status: "FAILED", claimToken: null, lockedAt: null, lastError: "Delivery was interrupted. Check the provider logs before retrying." } });
  await db.trainingEmailJob.updateMany({ where: { status: "SENDING", lockedAt: { lt: stale }, attempts: { lt: 5 } }, data: { status: "PENDING", claimToken: null, lockedAt: null } });
  await db.trainingEmailJob.updateMany({ where: { status: { in: ["PENDING", "FAILED"] }, expiresAt: { lte: now } }, data: { status: "CANCELLED", lastError: "The delivery window has passed." } });
  const candidates = await db.trainingEmailJob.findMany({ where: { status: "PENDING", dueAt: { lte: now }, expiresAt: { gt: now }, attempts: { lt: 5 }, session: { archivedAt: null } }, orderBy: { dueAt: "asc" }, take: 50, select: { id: true } });
  for (const candidate of candidates) {
    const claimToken = randomUUID();
    const claimed = await db.trainingEmailJob.updateMany({ where: { id: candidate.id, status: "PENDING", dueAt: { lte: now }, expiresAt: { gt: now }, attempts: { lt: 5 }, session: { archivedAt: null } }, data: { status: "SENDING", claimToken, lockedAt: new Date(), attempts: { increment: 1 } } });
    if (!claimed.count) continue;
    const job = await db.trainingEmailJob.findUniqueOrThrow({ where: { id: candidate.id }, include: { employee: {include:{department:departmentWithHod}}, session: { include: { course: true, completions: true } } } });
    const completion = job.session.completions.find(record => record.employeeId === job.employeeId);
    const hodEmail=resolvedHod(job.employee);
    const reviewerEmail=job.employee.superiorEmail?.trim() || hodEmail;
    const reviewAction=job.kind === "SUPERIOR_REVIEW";
    const owned = { id: job.id, status: "SENDING", claimToken };
    if (job.session.archivedAt || job.expiresAt <= new Date() || !completion || !(job.kind === "HOD_SUMMARY" || reviewAction ? !!completion.summarySubmittedAt && ["REQUIRED","COMPLETED"].includes(completion.status) && job.employee.status === "ACTIVE" : eligibleTrainingEmailRecipient(job.employee, completion.status))) {
      await db.trainingEmailJob.updateMany({ where: owned, data: { status: "CANCELLED", claimToken: null, lockedAt: null, lastError: "Training or participant is no longer eligible." } }); continue;
    }
    if(reviewAction && completion.reviewSubmittedAt){await db.trainingEmailJob.updateMany({where:owned,data:{status:"CANCELLED",claimToken:null,lockedAt:null}});continue;}
    const summaryAction = ["FOLLOW_UP","SUMMARY_REMINDER"].includes(job.kind);
    const recurring = job.kind === "SUMMARY_REMINDER" || reviewAction;
    if (summaryAction && completion?.summarySubmittedAt) { await db.trainingEmailJob.updateMany({where:owned,data:{status:"CANCELLED",claimToken:null,lockedAt:null}}); continue; }
    if (["HOD_SUMMARY","SUPERIOR_REVIEW"].includes(job.kind) && !z.string().email().safeParse(reviewAction?reviewerEmail:hodEmail).success) {
      await db.trainingEmailJob.updateMany({where:owned,data:{status:"PENDING",attempts:0,dueAt:new Date(now.getTime()+86400000),claimToken:null,lockedAt:null,lastError:"Missing HOD / superior email. Update Department HODs or the employee profile; delivery will retry automatically."}}); continue;
    }
    // Logged even when SMTP fails before the recipient/CC are resolved.
    const attempt = { recipient: job.recipient, cc: [] as string[], messageId: null as string | null };
    try {
      const dateFormat = new Intl.DateTimeFormat("en-MY", { timeZone: "Asia/Kuala_Lumpur", day: "numeric", month: "long", year: "numeric" });
      const timeFormat = new Intl.DateTimeFormat("en-MY", { timeZone: "Asia/Kuala_Lumpur", hour: "2-digit", minute: "2-digit", hour12: false });
      const session = job.session;
      const settings=trainingEmailTemplate(job.kind,await db.trainingEmailTemplate.findUnique({where:{kind:job.kind}}));
      const details={name:job.employee.name||job.employee.employeeId,training:session.course.name,date:dateFormat.format(session.dateStart),time:`${timeFormat.format(session.dateStart)}${session.dateEnd?`–${timeFormat.format(session.dateEnd)}`:""} · Malaysia time`,venue:session.venue||"Contact HR for the venue",trainer:session.trainerName||"Human Resources"};
      const actionUrl=job.kind==="INVITATION"||job.kind==="HOD_SUMMARY"?trainingPortalUrl(`/training/details/${session.detailsToken}`):job.kind==="REMINDER"?attendanceUrl(session.attendanceToken||"closed"):reviewAction?trainingPortalUrl(`/training/review/${completion!.reviewToken}`):trainingPortalUrl(`/training/summary/${completion!.summaryToken}`);
      // Recheck cancellation immediately before handing the message to SMTP.
      if (!(await db.trainingEmailJob.count({ where: { ...owned, session: { archivedAt: null } } }))) continue;
      const recipient = (reviewAction ? reviewerEmail : job.kind === "HOD_SUMMARY" ? hodEmail : job.employee.email!).trim().toLowerCase();
      if (summaryAction && !(await db.trainingEmailJob.count({where:{...owned,session:{archivedAt:null,completions:{some:{employeeId:job.employeeId,summarySubmittedAt:null}}}}}))) continue;
      const hodSummary = job.kind === "HOD_SUMMARY";
      const summaryText = hodSummary ? [`Training summary: ${session.course.name}`,`Participant: ${job.employee.name || job.employee.employeeId}`,`Learning: ${completion?.summaryLearning||""}`,`Application: ${completion?.summaryApplication||""}`,`Feedback: ${completion?.summaryFeedback||""}`,`Notes: ${completion?.summaryNotes||""}`, ...participantFields.map(f=>`${f.label}: ${(completion?.evaluation as Record<string,string>|null)?.[f.key]||"Not entered"}`)].join("\n\n") : "";
      const files = hodSummary && Array.isArray(completion?.summaryAttachments) ? completion.summaryAttachments as Array<{name:string;data:string}> : [];
      const hodName=resolvedHodName(job.employee)||"Head of Department";
      const recipientName=hodSummary?hodName:reviewAction?(job.employee.superiorEmail?job.employee.superiorName||"Reviewer":hodName):details.name;
      const content=renderConfiguredTrainingEmail(settings,details,actionUrl,false,summaryText,recipientName);
      const extraPeople=settings.ccEmployeeIds.length?await db.employee.findMany({where:{id:{in:settings.ccEmployeeIds},status:"ACTIVE"},select:{email:true}}):[];
      // Reminder number for this send. The three-month review's first email is the request itself.
      const previousSends = recurring ? await db.trainingEmailEvent.count({ where: { jobId: job.id, outcome: "SENT" } }).catch(() => 0) : 0;
      const escalate = recurring && (reviewAction ? previousSends : previousSends + 1) >= ESCALATE_FROM_REMINDER;
      const extraEmails=[...(escalate?[hodEmail,job.employee.superiorEmail??""]:[]),...extraPeople.flatMap(person=>person.email?[person.email]:[]),...(settings.ccSuperior?[reviewerEmail]:[]),...(settings.ccParticipant&&job.employee.email?[job.employee.email]:[])];
      if(settings.ccEmployeeIds.length&&!(await db.trainingEmailJob.count({where:{...owned,session:{archivedAt:null}}})))continue;
      const copies = trainingEmailCopies(settings,recipient,hodEmail,extraEmails);
      const messageId = `<training-${job.id}${(job.kind==="SUMMARY_REMINDER"||reviewAction)?`-${job.sentAt?.getTime()||0}`:""}@hr-digital.local>`;
      Object.assign(attempt, { recipient, cc: copies.cc ? copies.cc.split(", ") : [], messageId });
      const result = await sendMail({ from: env.smtpFrom, to: recipient, ...copies, replyTo:settings.replyTo||undefined, messageId, subject:content.subject, text:content.text, html:content.html, attachments: [...files.map(file=>({filename:file.name,content:Buffer.from(file.data.split(",")[1],"base64"),contentType:file.data.slice(5,file.data.indexOf(";")),contentDisposition:"attachment" as const})),{ filename: "sugihara-logo.png", content: emailLogo, contentType: "image/png", cid: emailLogoCid, contentDisposition: "inline" }] });
      if (result.rejected?.length) throw new Error("Recipient rejected");
      await recordTrainingEmailEvent(db, job, attempt, "SENT");
      await db.trainingEmailJob.updateMany({ where: owned, data: { status: recurring ? "PENDING" : "SENT", ...(recurring ? {dueAt:nextReminderAt(now),attempts:0} : {}), recipient, sentAt: new Date(), claimToken: null, lockedAt: null, lastError: null } });
      if (job.kind === "FOLLOW_UP") {
        // Never let this fail the delivered email (that would resend it); the sweep re-creates a missing reminder.
        const reminder = { dueAt: nextReminderAt(now), expiresAt: FOREVER, recipient };
        await db.trainingEmailJob.upsert({ where: { sessionId_employeeId_kind: { sessionId: job.sessionId, employeeId: job.employeeId, kind: "SUMMARY_REMINDER" } }, create: { sessionId: job.sessionId, employeeId: job.employeeId, kind: "SUMMARY_REMINDER", ...reminder }, update: { ...reminder, status: "PENDING", attempts: 0, claimToken: null, lockedAt: null, lastError: null } }).catch(() => console.error("Evaluation reminder could not be scheduled; it will be retried."));
      }
    } catch (error) {
      await recordTrainingEmailEvent(db, job, attempt, "FAILED", error instanceof Error ? error.message : "SMTP delivery failed.");
      await db.trainingEmailJob.updateMany({ where: owned, data: { status: job.attempts >= 5 && !["SUMMARY_REMINDER","SUPERIOR_REVIEW"].includes(job.kind) ? "FAILED" : "PENDING", ...(["SUMMARY_REMINDER","SUPERIOR_REVIEW"].includes(job.kind) && job.attempts >= 5 ? {attempts:0} : {}), dueAt: new Date(Date.now() + Math.min(60, 2 ** job.attempts) * 60000), claimToken: null, lockedAt: null, lastError: "SMTP delivery failed. Check connection, sender permissions and provider limits." } });
    }
  }
}

// History must never change delivery state: a logging failure is reported but
// does not turn an accepted message into a retry (which would send a duplicate).
async function recordTrainingEmailEvent(db: typeof prisma, job: { id: string; sessionId: string; employeeId: string; kind: string }, attempt: { recipient: string; cc: string[]; messageId: string | null }, outcome: "SENT" | "FAILED", error?: string) {
  try {
    await db.trainingEmailEvent.create({ data: { jobId: job.id, sessionId: job.sessionId, employeeId: job.employeeId, kind: job.kind, recipient: attempt.recipient, cc: attempt.cc, outcome, messageId: attempt.messageId, error: error?.slice(0, 500) ?? null } });
  } catch {
    console.error("Training email history could not be recorded. Apply the latest database update.");
  }
}

export function startTrainingEmailWorker() {
  if (!env.databaseUrl || !trainingEmailEnabled()) return () => {};
  let busy = false;
  const tick = async () => { if (busy) return; busy = true; try { await ensureEvaluationEmails(); await processTrainingEmails(); } catch { console.error("Training email queue could not be processed. Check database connectivity and schema."); } finally { busy = false; } };
  const timer = setInterval(() => { void tick(); }, 60000); timer.unref(); void tick();
  return () => clearInterval(timer);
}
