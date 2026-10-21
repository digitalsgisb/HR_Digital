import { z } from "zod";

export type TrainingEmailKind = "INVITATION" | "REMINDER" | "FOLLOW_UP";
export function trainingEmailSchedule(start: Date, end: Date | null, now = new Date()): Array<{ kind: TrainingEmailKind; dueAt: Date; expiresAt: Date }> {
  // Never backfill messages for historical/ongoing plans.
  if (start <= now) return [];
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit" }).format(start);
  const eightAm = new Date(`${day}T08:00:00+08:00`);
  const reminder = eightAm < start ? eightAm : new Date(start.getTime() - 30 * 60000);
  const jobs: ReturnType<typeof trainingEmailSchedule> = [{ kind: "INVITATION", dueAt: now, expiresAt: start }];
  // A plan created after reminder time gets one invitation, not two immediate emails.
  if (reminder > now) jobs.push({ kind: "REMINDER", dueAt: reminder, expiresAt: start });
  if (end && end > start) jobs.push({ kind: "FOLLOW_UP", dueAt: new Date(end.getTime() + 2 * 3600000), expiresAt: new Date(end.getTime() + 7 * 86400000) });
  return jobs;
}

export function eligibleTrainingEmailRecipient(person: { email: string | null; status: string }, completionStatus = "REQUIRED") {
  return person.status === "ACTIVE" && ["REQUIRED", "COMPLETED"].includes(completionStatus) && !!person.email && z.string().trim().email().safeParse(person.email).success;
}
