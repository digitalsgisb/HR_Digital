import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "./app.js";
import { env } from "./env.js";
import { installTrainingFixture } from "./training-fixture.js";

test("plan API queues eligible participants, supports opt-out and archives training with pending mail cancellation", async () => {
  const previousMode = env.emailTransport; env.emailTransport = "preview";
  const fixture = installTrainingFixture();
  const server = createApp().listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  try {
    const address = server.address(); assert.ok(address && typeof address !== "string");
    const root = `http://127.0.0.1:${address.port}/api`;
    const input = { title: "QA Training", category: "Safety", dateStart: "2099-01-02T01:00:00.000Z", dateEnd: "2099-01-02T04:00:00.000Z", trainerName: "QA Trainer", venue: "QA Room", capacity: 2, deliveryMethod: "Instructor-led", participantEmployeeIds: fixture.employees.map(person => person.id) };
    const post = async (body: any) => { const response = await fetch(`${root}/training-plans`, { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify(body) }); assert.equal(response.status, 201); return response.json() as Promise<any>; };
    const plan = await post(input);
    assert.equal(plan.emailDelivery.queued, 4); assert.equal(plan.emailDelivery.withoutEmail, 1);
    assert.equal(fixture.jobs.length, 4); assert.ok(fixture.jobs.every(job => job.recipient === "qa@example.test"));
    assert.equal((await post({...input,notifyParticipants:false})).emailDelivery.queued, 0);
    assert.equal((await post({...input,dateStart:"2020-01-02T01:00:00.000Z",dateEnd:"2020-01-02T04:00:00.000Z"})).emailDelivery.queued, 0);
    fixture.sessions[0].completions[0].status = "COMPLETED";
    fixture.sessions[0].completions[0].hours = 3;
    fixture.sessions[0].completions[0].completedAt = new Date();
    let summary = await (await fetch(`${root}/dashboard/summary`)).json() as any;
    assert.equal(summary.stats.totalTrainingHours, 3);
    assert.equal((await fetch(`${root}/training-sessions/${plan.id}`, {method:"DELETE"})).status, 200);
    assert.ok(fixture.sessions[0].archivedAt); assert.equal(fixture.sessions[0].completions.length, 2);
    assert.ok(fixture.jobs.every(job => job.status === "CANCELLED"));
    assert.equal((await fetch(`${root}/training-sessions/${plan.id}`)).status, 404);
    const visible = await (await fetch(`${root}/training-sessions`)).json() as any[];
    assert.equal(visible.length, 2); assert.ok(visible.every(session => session.id !== plan.id));
    summary = await (await fetch(`${root}/dashboard/summary`)).json() as any;
    assert.equal(summary.stats.totalTrainingHours, 0); assert.equal(summary.stats.sessions, 2);
    const pastPlan = fixture.sessions[2];
    assert.equal((await fetch(`${root}/training-sessions/${pastPlan.id}`, {method:"DELETE"})).status, 200);
    assert.ok(pastPlan.archivedAt); assert.equal(pastPlan.completions.length, 2);
    assert.equal((await fetch(`${root}/training-sessions/missing`, {method:"DELETE"})).status, 404);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); fixture.restore(); env.emailTransport = previousMode; }
});
