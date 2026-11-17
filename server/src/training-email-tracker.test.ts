import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "./app.js";
import { prisma } from "./prisma.js";
import { emailState, sortTrainings, summarizeTrainingEmails, trainingPhase } from "./training-email-tracker.js";

const now = new Date("2026-11-17T04:00Z");
const at = (iso: string) => new Date(iso);
const person = (employeeId: string, extra: Record<string, unknown> = {}) => ({ employeeId, status: "REQUIRED", summarySubmittedAt: null as Date | null, employee: { status: "ACTIVE", email: `${employeeId}@example.test` }, ...extra });
const job = (employeeId: string, kind: string, status: string, sentAt: Date | null = null) => ({ id: `${employeeId}-${kind}`, employeeId, kind, status, recipient: `${employeeId}@example.test`, dueAt: now, sentAt, lastError: null });

test("training phase follows the session dates", () => {
  assert.equal(trainingPhase({ dateStart: at("2026-11-18T01:00Z"), dateEnd: at("2026-11-18T09:00Z") }, now), "UPCOMING");
  assert.equal(trainingPhase({ dateStart: at("2026-11-17T01:00Z"), dateEnd: at("2026-11-17T09:00Z") }, now), "IN_PROGRESS");
  assert.equal(trainingPhase({ dateStart: at("2026-11-10T01:00Z"), dateEnd: at("2026-11-10T09:00Z") }, now), "FOLLOW_UP");
  assert.equal(trainingPhase({ dateStart: at("2026-11-16T01:00Z"), dateEnd: null }, now), "FOLLOW_UP");
});

test("email state treats recurring and stopped reminders by whether they were sent", () => {
  assert.equal(emailState({ status: "PENDING", sentAt: null }), "SCHEDULED");
  assert.equal(emailState({ status: "PENDING", sentAt: now }), "RECURRING");
  assert.equal(emailState({ status: "SENT", sentAt: now }), "SENT");
  assert.equal(emailState({ status: "FAILED", sentAt: null }), "FAILED");
  assert.equal(emailState({ status: "CANCELLED", sentAt: now }), "SENT");
  assert.equal(emailState({ status: "CANCELLED", sentAt: null }), "CANCELLED");
});

test("summary counts invitations, evaluations and failures per training", () => {
  const session = {
    dateStart: at("2026-11-10T01:00Z"), dateEnd: at("2026-11-10T09:00Z"),
    completions: [person("a", { summarySubmittedAt: now }), person("b"), person("c", { status: "ABSENT" }), person("d", { employee: { status: "ACTIVE", email: null } })],
    emailJobs: [job("a", "INVITATION", "SENT", now), job("b", "INVITATION", "SENT", now), job("b", "SUMMARY_REMINDER", "PENDING", now), job("a", "SUMMARY_REMINDER", "CANCELLED"), job("b", "HOD_SUMMARY", "FAILED")]
  };
  const summary = summarizeTrainingEmails(session, 4, now);
  assert.equal(summary.phase, "FOLLOW_UP");
  assert.equal(summary.participants, 4); assert.equal(summary.withoutEmail, 1);
  assert.deepEqual(summary.evaluations, { eligible: 3, submitted: 1, outstanding: 2 });
  assert.deepEqual(summary.byKind.INVITATION, { sent: 2, scheduled: 0, failed: 0, cancelled: 0 });
  assert.deepEqual(summary.byKind.SUMMARY_REMINDER, { sent: 1, scheduled: 0, failed: 0, cancelled: 1 });
  assert.equal(summary.emails.sent, 3); assert.equal(summary.emails.scheduled, 1); assert.equal(summary.emails.failed, 1); assert.equal(summary.emails.sends, 4);
  assert.equal(summary.emails.lastSentAt?.toISOString(), now.toISOString());
  // Evaluations are not outstanding before training ends.
  assert.equal(summarizeTrainingEmails({ ...session, dateStart: at("2026-11-20T01:00Z"), dateEnd: at("2026-11-20T09:00Z") }, 0, now).evaluations.outstanding, 0);
});

test("current training lists running first, then soonest upcoming, then latest follow-up", () => {
  const rows = [
    { id: "old", phase: "FOLLOW_UP" as const, dateStart: at("2026-11-01") }, { id: "recent", phase: "FOLLOW_UP" as const, dateStart: at("2026-11-12") },
    { id: "later", phase: "UPCOMING" as const, dateStart: at("2026-12-01") }, { id: "soon", phase: "UPCOMING" as const, dateStart: at("2026-11-20") },
    { id: "now", phase: "IN_PROGRESS" as const, dateStart: at("2026-11-17") }
  ];
  assert.deepEqual(sortTrainings(rows).map(row => row.id), ["now", "soon", "later", "recent", "old"]);
});

test("tracker routes return per-participant email status and only retry failed emails", async t => {
  const session = {
    id: "session-1", dateStart: at("2026-11-10T01:00Z"), dateEnd: at("2026-11-10T09:00Z"), venue: "Room A", trainerName: "Trainer", archivedAt: null,
    course: { name: "Forklift safety", code: "TRN-1", category: "Safety" },
    completions: [{ ...person("emp-1"), checkedInAt: null, reviewSubmittedAt: null, employee: { employeeId: "S001", name: "Aina", email: "aina@example.test", status: "ACTIVE", department: { name: "Production" } } }],
    emailJobs: [job("emp-1", "INVITATION", "SENT", now), job("emp-1", "FOLLOW_UP", "FAILED")]
  };
  const events = [{ id: "e1", jobId: "emp-1-INVITATION", employeeId: "emp-1", kind: "INVITATION", recipient: "aina@example.test", cc: [], outcome: "SENT", error: null, createdAt: now }];
  const originals = { findMany: prisma.trainingSession.findMany, findFirst: prisma.trainingSession.findFirst, groupBy: prisma.trainingEmailEvent.groupBy, events: prisma.trainingEmailEvent.findMany, retry: prisma.trainingEmailJob.updateMany };
  let retryWhere: any;
  (prisma.trainingSession as any).findMany = async () => [session];
  (prisma.trainingSession as any).findFirst = async ({ where }: any) => (where.id === session.id ? session : null);
  (prisma.trainingEmailEvent as any).groupBy = async () => [{ sessionId: "session-1", _count: 1 }];
  (prisma.trainingEmailEvent as any).findMany = async () => events;
  (prisma.trainingEmailJob as any).updateMany = async ({ where }: any) => { retryWhere ??= where; return { count: where.id === "emp-1-FOLLOW_UP" ? 1 : 0 }; };
  t.after(() => { Object.assign(prisma.trainingSession, { findMany: originals.findMany, findFirst: originals.findFirst }); Object.assign(prisma.trainingEmailEvent, { groupBy: originals.groupBy, findMany: originals.events }); prisma.trainingEmailJob.updateMany = originals.retry; });
  const server = createApp().listen(0, "127.0.0.1"); await new Promise<void>(resolve => server.once("listening", resolve));
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const address = server.address(); assert.ok(address && typeof address !== "string"); const base = `http://127.0.0.1:${address.port}/api/training-email`;

  const list: any = await (await fetch(`${base}/trainings`)).json();
  assert.equal(list.trainings.length, 1); assert.equal(list.trainings[0].title, "Forklift safety"); assert.equal(list.trainings[0].emails.sends, 1); assert.equal(list.trainings[0].emails.failed, 1);
  assert.equal((await fetch(`${base}/trainings?scope=bad`)).status, 400);

  const detail: any = await (await fetch(`${base}/trainings/session-1`)).json();
  const [row] = detail.participants;
  assert.equal(row.name, "Aina"); assert.equal(row.department, "Production");
  assert.equal(row.emails.INVITATION.state, "SENT"); assert.equal(row.emails.INVITATION.sends, 1);
  assert.equal(row.emails.FOLLOW_UP.state, "FAILED"); assert.equal(row.history.length, 1);
  assert.equal((await fetch(`${base}/trainings/missing`)).status, 404);

  const { env } = await import("./env.js"); const old = { ...env };
  Object.assign(env, { emailTransport: "smtp", smtpHost: "", smtpUser: "" });
  t.after(() => { Object.assign(env, old); });
  assert.equal((await fetch(`${base}/jobs/emp-1-FOLLOW_UP/retry`, { method: "POST" })).status, 503);
  Object.assign(env, { smtpHost: "localhost" });
  const originalProcess = prisma.trainingEmailJob.findMany; (prisma.trainingEmailJob as any).findMany = async () => [];
  t.after(() => { prisma.trainingEmailJob.findMany = originalProcess; });
  assert.equal((await fetch(`${base}/jobs/emp-1-FOLLOW_UP/retry`, { method: "POST" })).status, 200);
  assert.equal(retryWhere.status, "FAILED");
  assert.equal((await fetch(`${base}/jobs/emp-1-INVITATION/retry`, { method: "POST" })).status, 409);
});
