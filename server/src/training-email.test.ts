import test from "node:test";
import assert from "node:assert/strict";
import { trainingEmailSchedule, eligibleTrainingEmailRecipient } from "./training-email-schedule.js";
import { env } from "./env.js";
import { processTrainingEmails } from "./training-email.js";
import type { prisma } from "./prisma.js";

test("training schedule uses Malaysia 08:00 and follows up two hours after end", () => {
  const jobs = trainingEmailSchedule(new Date("2099-01-02T09:00:00+08:00"), new Date("2099-01-02T12:00:00+08:00"), new Date("2099-01-01T00:00:00Z"));
  assert.deepEqual(jobs.map(job => job.kind), ["INVITATION", "REMINDER", "FOLLOW_UP"]);
  assert.equal(jobs[1].dueAt.toISOString(), "2099-01-02T00:00:00.000Z");
  assert.equal(jobs[2].dueAt.toISOString(), "2099-01-02T06:00:00.000Z");
  assert.equal(jobs[0].expiresAt.toISOString(), "2099-01-02T01:00:00.000Z");
});
test("early sessions, late creation, historical plans and invalid recipients", () => {
  const start = new Date("2099-01-02T07:00:00+08:00");
  const jobs = trainingEmailSchedule(start, null, new Date("2099-01-01T00:00:00Z"));
  assert.equal(jobs[1].dueAt.toISOString(), "2099-01-01T22:30:00.000Z");
  assert.deepEqual(trainingEmailSchedule(start, null, new Date("2099-01-02T06:45:00+08:00")).map(job => job.kind), ["INVITATION"]);
  assert.deepEqual(trainingEmailSchedule(start, null, start), []);
  for (const email of [null, "", "bad", "a@example.test,b@example.test", "a@example.test\r\nBcc:b@example.test"]) assert.equal(eligibleTrainingEmailRecipient({ email, status: "ACTIVE" }), false);
  assert.equal(eligibleTrainingEmailRecipient({ email: "person@example.test", status: "ACTIVE" }), true);
  assert.equal(eligibleTrainingEmailRecipient({ email: "person@example.test", status: "INACTIVE" }), false);
  assert.equal(eligibleTrainingEmailRecipient({ email: "person@example.test", status: "ACTIVE" }, "ABSENT"), false);
});

// This fixture models persistent conditional updates. No production database or
// SMTP connection is used by these worker tests.
function fixture() {
  const row = { id: "job-1", employeeId: "employee-1", status: "PENDING", claimToken: null as string | null, lockedAt: null as Date | null, attempts: 0, kind: "INVITATION", expiresAt: new Date("2099-02-01"), dueAt: new Date("2025-01-01"), sentAt: null as Date | null, lastError: null as string | null, employee: { email: "person@example.test", status: "ACTIVE", name: "Person", employeeId: "EMP-1" }, session: { archivedAt: null as Date | null, dateStart: new Date("2099-01-02T01:00Z"), dateEnd: new Date("2099-01-02T04:00Z"), course: { name: "Safety" }, venue: "Training room", trainerName: "Trainer", completions: [{ employeeId: "employee-1", status: "REQUIRED" }] } };
  const matches = (where: any) => (!where.id || where.id === row.id) && (typeof where.status === "string" ? row.status === where.status : !where.status?.in || where.status.in.includes(row.status)) && (!where.claimToken || where.claimToken === row.claimToken) && (!where.expiresAt?.lte || row.expiresAt <= where.expiresAt.lte) && (!where.attempts?.gte || row.attempts >= where.attempts.gte) && (!where.attempts?.lt || row.attempts < where.attempts.lt) && (!where.dueAt?.lte || row.dueAt <= where.dueAt.lte) && (!where.expiresAt?.gt || row.expiresAt > where.expiresAt.gt) && (!where.lockedAt || (!!row.lockedAt && row.lockedAt < where.lockedAt.lt)) && (!where.session || !row.session.archivedAt);
  const db = { trainingEmailJob: {
    async updateMany({ where, data }: any) { if (!matches(where)) return { count: 0 }; const { attempts, ...rest } = data; Object.assign(row, rest); if (attempts?.increment) row.attempts += attempts.increment; return { count: 1 }; },
    async findMany({where}: any) { return matches(where) ? [{id: row.id}] : []; },
    async findUniqueOrThrow() { return { ...row }; },
    async count({where}: any) { return Number(matches(where)); }
  } } as unknown as typeof prisma;
  return { row, db };
}

test("worker claims once across concurrent ticks and renders a real invitation", async () => {
  const old = { ...env }; Object.assign(env, { emailTransport: "smtp", smtpHost: "localhost", smtpUser: "" });
  try {
    const { row, db } = fixture(); const messages: any[] = [];
    const send = async (message: any) => { messages.push(message); await Promise.resolve(); return { rejected: [] }; };
    await Promise.all([processTrainingEmails(new Date(), db, send), processTrainingEmails(new Date(), db, send)]);
    assert.equal(messages.length, 1); assert.equal(row.status, "SENT");
    assert.equal(messages[0].to, "person@example.test");
    assert.match(messages[0].subject, /You are invited to training/);
    assert.doesNotMatch(messages[0].subject, /\[TEST\]/);
    assert.match(messages[0].html, /Training room/);
    assert.ok(messages[0].attachments[0].content.length > 0);
    await processTrainingEmails(new Date(), db, send); assert.equal(messages.length, 1);
  } finally { Object.assign(env, old); }
});

test("worker cancels deleted or absent participants and retains retryable failures", async () => {
  const old = { ...env }; Object.assign(env, { emailTransport: "smtp", smtpHost: "localhost", smtpUser: "" });
  try {
    let sent = 0; const send = async () => { sent++; return { rejected: [] }; };
    const archived = fixture(); archived.row.session.archivedAt = new Date();
    await processTrainingEmails(new Date(), archived.db, send); assert.equal(sent, 0);
    const absent = fixture(); absent.row.session.completions[0].status = "ABSENT";
    await processTrainingEmails(new Date(), absent.db, send); assert.equal(sent, 0); assert.equal(absent.row.status, "CANCELLED");
    const failed = fixture(); await processTrainingEmails(new Date(), failed.db, async () => { throw new Error("No SMTP"); });
    assert.equal(failed.row.status, "PENDING"); assert.equal(failed.row.attempts, 1); assert.ok(failed.row.dueAt > new Date());
    failed.row.attempts = 4; failed.row.dueAt = new Date("2025-01-01"); await processTrainingEmails(new Date(), failed.db, async () => { throw new Error("No SMTP"); });
    assert.equal(failed.row.status, "FAILED");
    const interrupted = fixture(); interrupted.row.status = "SENDING"; interrupted.row.attempts = 1; interrupted.row.lockedAt = new Date("2025-01-01");
    await processTrainingEmails(new Date(), interrupted.db, send); assert.equal(interrupted.row.status, "SENT");
    const inFlight = fixture(); await processTrainingEmails(new Date(), inFlight.db, async () => { inFlight.row.status = "CANCELLED"; inFlight.row.session.archivedAt = new Date(); return {rejected: []}; }); assert.equal(inFlight.row.status, "CANCELLED");
    sent = 0;
    const disabled = fixture(); env.emailTransport = "preview";
    await processTrainingEmails(new Date(), disabled.db, send); assert.equal(sent, 0); assert.equal(disabled.row.status, "PENDING");
  } finally { Object.assign(env, old); }
});
