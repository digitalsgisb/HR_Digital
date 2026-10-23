import { trainingPortalUrl, escapeHtml } from "./training-portal.js";
import { attendanceUrl } from "./attendance.js";
import { z } from "zod";
import nodemailer, { type SendMailOptions } from "nodemailer";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { env } from "./env.js";
import { prisma } from "./prisma.js";
import { emailLogo, emailLogoCid, renderTrainingEmail } from "./email-template.js";
import { eligibleTrainingEmailRecipient, trainingEmailSchedule } from "./training-email-schedule.js";

export const trainingEmailEnabled = () => process.env.EMAIL_AUTOMATION_ENABLED !== "false";
export const trainingEmailReady = () => trainingEmailEnabled() && env.emailTransport === "smtp" && !!env.smtpHost && (!env.smtpUser || !!env.smtpPassword);

export async function queueTrainingEmails(tx: Prisma.TransactionClient, session: { id: string; dateStart: Date; dateEnd: Date | null }, notify = true, now = new Date()) {
  const participants = await tx.trainingCompletion.findMany({ where: { sessionId: session.id }, include: { employee: true } });
  const recipients = participants.filter(record => eligibleTrainingEmailRecipient(record.employee, record.status));
  const schedule = notify ? trainingEmailSchedule(session.dateStart, session.dateEnd, now) : [];
  const result = await tx.trainingEmailJob.createMany({ data: recipients.flatMap(record => schedule.map(job => ({ ...job, sessionId: session.id, employeeId: record.employeeId, recipient: record.employee.email!.trim().toLowerCase() }))), skipDuplicates: true });
  return { queued: result.count, recipients: recipients.length, withoutEmail: participants.length - recipients.length, enabled: trainingEmailReady(), historical: session.dateStart <= now, requested: notify };
}

const transport = nodemailer.createTransport({ host: env.smtpHost, port: env.smtpPort, secure: env.smtpSecure, requireTLS: env.smtpRequireTls,
  auth: env.smtpUser ? { user: env.smtpUser, pass: env.smtpPassword } : undefined,
  connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000, disableFileAccess: true, disableUrlAccess: true });

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
    const job = await db.trainingEmailJob.findUniqueOrThrow({ where: { id: candidate.id }, include: { employee: true, session: { include: { course: true, completions: true } } } });
    const completion = job.session.completions.find(record => record.employeeId === job.employeeId);
    const owned = { id: job.id, status: "SENDING", claimToken };
    if (job.session.archivedAt || job.expiresAt <= new Date() || !completion || !(job.kind === "HOD_SUMMARY" ? !!completion.summarySubmittedAt : eligibleTrainingEmailRecipient(job.employee, completion.status))) {
      await db.trainingEmailJob.updateMany({ where: owned, data: { status: "CANCELLED", claimToken: null, lockedAt: null, lastError: "Training or participant is no longer eligible." } }); continue;
    }
    const summaryAction = ["FOLLOW_UP","SUMMARY_REMINDER"].includes(job.kind);
    if (summaryAction && (completion?.summarySubmittedAt || (job.kind === "FOLLOW_UP" && job.session.dateEnd && now.getTime() >= job.session.dateEnd.getTime()+3*86400000))) { await db.trainingEmailJob.updateMany({where:owned,data:{status:"CANCELLED",claimToken:null,lockedAt:null}}); continue; }
    if (job.kind === "HOD_SUMMARY" && !z.string().email().safeParse(job.employee.hodEmail).success) {
      await db.trainingEmailJob.updateMany({where:owned,data:{status:"PENDING",attempts:0,dueAt:new Date(now.getTime()+86400000),claimToken:null,lockedAt:null,lastError:"Missing HOD email. Update the employee profile; delivery will retry automatically."}}); continue;
    }
    try {
      const dateFormat = new Intl.DateTimeFormat("en-MY", { timeZone: "Asia/Kuala_Lumpur", day: "numeric", month: "long", year: "numeric" });
      const timeFormat = new Intl.DateTimeFormat("en-MY", { timeZone: "Asia/Kuala_Lumpur", hour: "2-digit", minute: "2-digit", hour12: false });
      const session = job.session;
      const content = renderTrainingEmail(job.kind === "FOLLOW_UP" ? "email-2" : "email-1", { name: job.employee.name || job.employee.employeeId, training: session.course.name, date: dateFormat.format(session.dateStart), time: `${timeFormat.format(session.dateStart)}${session.dateEnd ? `–${timeFormat.format(session.dateEnd)}` : ""} · Malaysia time`, venue: session.venue || "Contact HR for the venue", trainer: session.trainerName || "Human Resources" }, job.kind === "INVITATION" ? trainingPortalUrl(`/training/details/${session.detailsToken}`) : job.kind === "REMINDER" ? attendanceUrl(session.attendanceToken || "closed") : trainingPortalUrl(`/training/summary/${completion!.summaryToken}`), false, job.kind === "INVITATION", job.kind === "INVITATION" ? {title:"You are invited to training",intro:"Please click below to review your training details and make arrangements to attend.",action:"View training details"} : job.kind === "REMINDER" ? {title:"Register your training attendance",intro:"Your training is today. Please click the button and enter your attendance during the check-in window.",action:"Register attendance"} : {title:job.kind === "SUMMARY_REMINDER" ? "Reminder: complete your training summary" : "Complete your training summary",intro:"Please complete your training summary, add your notes and useful materials, and submit it for your HOD. Reminders are sent every three days until submission.",action:"Complete training summary"});
      // Recheck cancellation immediately before handing the message to SMTP.
      if (!(await db.trainingEmailJob.count({ where: { ...owned, session: { archivedAt: null } } }))) continue;
      const recipient = (job.kind === "HOD_SUMMARY" ? job.employee.hodEmail! : job.employee.email!).trim().toLowerCase();
      if (summaryAction && !(await db.trainingEmailJob.count({where:{...owned,session:{archivedAt:null,completions:{some:{employeeId:job.employeeId,summarySubmittedAt:null}}}}}))) continue;
      const hodSummary = job.kind === "HOD_SUMMARY";
      const summaryText = hodSummary ? [`Training summary: ${session.course.name}`,`Participant: ${job.employee.name || job.employee.employeeId}`,`Learning: ${completion?.summaryLearning||""}`,`Application: ${completion?.summaryApplication||""}`,`Feedback: ${completion?.summaryFeedback||""}`,`Notes: ${completion?.summaryNotes||""}`].join("\n\n") : "";
      const files = hodSummary && Array.isArray(completion?.summaryAttachments) ? completion.summaryAttachments as Array<{name:string;data:string}> : [];
      const result = await sendMail({ from: env.smtpFrom, to: recipient, cc: ["INVITATION","REMINDER"].includes(job.kind) && z.string().email().safeParse(job.employee.hodEmail).success ? job.employee.hodEmail! : undefined, messageId: `<training-${job.id}${job.kind==="SUMMARY_REMINDER"?`-${job.sentAt?.getTime()||0}`:""}@hr-digital.local>`, subject: hodSummary ? `Training summary — ${session.course.name} — ${job.employee.name || job.employee.employeeId}` : content.subject, text: hodSummary ? summaryText : content.text, html: hodSummary ? `<div style="white-space:pre-wrap;font-family:Arial">${escapeHtml(summaryText)}</div>` : content.html, attachments: [...files.map(file=>({filename:file.name,content:Buffer.from(file.data.split(",")[1],"base64"),contentType:file.data.slice(5,file.data.indexOf(";")),contentDisposition:"attachment" as const})),{ filename: "sugihara-logo.png", content: emailLogo, contentType: "image/png", cid: emailLogoCid, contentDisposition: "inline" }] });
      if (result.rejected?.length) throw new Error("Recipient rejected");
      await db.trainingEmailJob.updateMany({ where: owned, data: { status: job.kind === "SUMMARY_REMINDER" ? "PENDING" : "SENT", ...(job.kind === "SUMMARY_REMINDER" ? {dueAt:nextSummaryReminder(session.dateEnd!,now),attempts:0} : {}), recipient, sentAt: new Date(), claimToken: null, lockedAt: null, lastError: null } });
    } catch {
      await db.trainingEmailJob.updateMany({ where: owned, data: { status: job.attempts >= 5 && job.kind !== "SUMMARY_REMINDER" ? "FAILED" : "PENDING", ...(job.kind === "SUMMARY_REMINDER" && job.attempts >= 5 ? {attempts:0} : {}), dueAt: new Date(Date.now() + Math.min(60, 2 ** job.attempts) * 60000), claimToken: null, lockedAt: null, lastError: "SMTP delivery failed. Check connection, sender permissions and provider limits." } });
    }
  }
}

export function startTrainingEmailWorker() {
  if (!env.databaseUrl || !trainingEmailEnabled()) return () => {};
  let busy = false;
  const tick = async () => { if (busy) return; busy = true; try { await processTrainingEmails(); } catch { console.error("Training email queue could not be processed. Check database connectivity and schema."); } finally { busy = false; } };
  const timer = setInterval(() => { void tick(); }, 60000); timer.unref(); void tick();
  return () => clearInterval(timer);
}

 export function nextSummaryReminder(end: Date, now: Date) {
 const interval = 3 * 86400000;
 return new Date(end.getTime() + (Math.floor(Math.max(0, now.getTime()-end.getTime())/interval)+1)*interval);
}
