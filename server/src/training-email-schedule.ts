import { z } from "zod";

export type TrainingEmailKind = "INVITATION" | "REMINDER";
// Pre-training emails only. The evaluation request and its reminders are not
// pre-queued: ensureEvaluationEmails creates them once training has ended, so
// backdated plans, late participants and changed end dates are all covered.
export function trainingEmailSchedule(start: Date, now = new Date()): Array<{ kind: TrainingEmailKind; dueAt: Date; expiresAt: Date }> {
  // Never backfill invitations for historical/ongoing plans.
  if (start <= now) return [];
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit" }).format(start);
  const eightAm = new Date(`${day}T08:00:00+08:00`);
  const reminder = eightAm < start ? eightAm : new Date(start.getTime() - 30 * 60000);
  const jobs: ReturnType<typeof trainingEmailSchedule> = [{ kind: "INVITATION", dueAt: now, expiresAt: start }];
  // A plan created after reminder time gets one invitation, not two immediate emails.
  if (reminder > now) jobs.push({ kind: "REMINDER", dueAt: reminder, expiresAt: start });
  return jobs;
}

export function eligibleTrainingEmailRecipient(person: { email: string | null; status: string }, completionStatus = "REQUIRED") {
  return person.status === "ACTIVE" && ["REQUIRED", "COMPLETED"].includes(completionStatus) && !!person.email && z.string().trim().email().safeParse(person.email).success;
}

const MYT = 8 * 3600000, DAY = 86400000;
export const REMINDER_INTERVAL_DAYS = 3;
// From this reminder onwards the HOD and immediate superior are copied.
export const ESCALATE_FROM_REMINDER = 5;

// 09:00 Malaysia time on the calendar day `days` after `from`, moved to Monday
// when it falls on a weekend. Public holidays are not considered.
function morningAfter(from: Date, days: number) {
  const local = new Date(from.getTime() + MYT);
  let at = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + days, 9) - MYT;
  const weekday = new Date(at + MYT).getUTCDay();
  if (weekday === 6) at += 2 * DAY; else if (weekday === 0) at += DAY;
  return new Date(at);
}

// Next reminder: three calendar days after the previous send, at 09:00 on a weekday.
export function nextReminderAt(previousSend: Date) {
  return morningAfter(previousSend, REMINDER_INTERVAL_DAYS);
}

// How far a recurring email has gone. The participant's first evaluation email is a
// separate job, so every SUMMARY_REMINDER send is a reminder; the three-month review's
// first send is the request itself.
export function reminderProgress(kind: string, sends: number) {
  const reminders = kind === "SUMMARY_REMINDER" ? sends : kind === "SUPERIOR_REVIEW" ? Math.max(0, sends - 1) : 0;
  return { reminders, escalated: reminders >= ESCALATE_FROM_REMINDER };
}

// The first weekday 09:00 at or after `at` (used for the three-month review start).
export function workingMorningFrom(at: Date) {
  const sameDay = morningAfter(at, 0);
  return sameDay >= at ? sameDay : morningAfter(at, 1);
}
