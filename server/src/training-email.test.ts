import test from "node:test";
import assert from "node:assert/strict";
import { trainingEmailSchedule, eligibleTrainingEmailRecipient } from "./training-email-schedule.js";
import { env } from "./env.js";
import { ensureEvaluationEmails, processTrainingEmails } from "./training-email.js";
import type { prisma } from "./prisma.js";

test("training schedule uses Malaysia 08:00 and leaves evaluation emails to the post-training sweep", () => {
  const jobs = trainingEmailSchedule(new Date("2099-01-02T09:00:00+08:00"), new Date("2099-01-01T00:00:00Z"));
  assert.deepEqual(jobs.map(job => job.kind), ["INVITATION", "REMINDER"]);
  assert.equal(jobs[1].dueAt.toISOString(), "2099-01-02T00:00:00.000Z");
  assert.equal(jobs[0].expiresAt.toISOString(), "2099-01-02T01:00:00.000Z");
});
test("early sessions, late creation, historical plans and invalid recipients", () => {
  const start = new Date("2099-01-02T07:00:00+08:00");
  const jobs = trainingEmailSchedule(start, new Date("2099-01-01T00:00:00Z"));
  assert.equal(jobs[1].dueAt.toISOString(), "2099-01-01T22:30:00.000Z");
  assert.deepEqual(trainingEmailSchedule(start, new Date("2099-01-02T06:45:00+08:00")).map(job => job.kind), ["INVITATION"]);
  assert.deepEqual(trainingEmailSchedule(start, start), []);
  for (const email of [null, "", "bad", "a@example.test,b@example.test", "a@example.test\r\nBcc:b@example.test"]) assert.equal(eligibleTrainingEmailRecipient({ email, status: "ACTIVE" }), false);
  assert.equal(eligibleTrainingEmailRecipient({ email: "person@example.test", status: "ACTIVE" }), true);
  assert.equal(eligibleTrainingEmailRecipient({ email: "person@example.test", status: "INACTIVE" }), false);
  assert.equal(eligibleTrainingEmailRecipient({ email: "person@example.test", status: "ACTIVE" }, "ABSENT"), false);
});

// This fixture models persistent conditional updates. No production database or
// SMTP connection is used by these worker tests.
function fixture() {
  const row = { id: "job-1", sessionId: "session-1", employeeId: "employee-1", status: "PENDING", claimToken: null as string | null, lockedAt: null as Date | null, attempts: 0, kind: "INVITATION", expiresAt: new Date("2099-02-01"), dueAt: new Date("2025-01-01"), sentAt: null as Date | null, lastError: null as string | null, employee: { email: "person@example.test", status: "ACTIVE", name: "Person", employeeId: "EMP-1" }, session: { archivedAt: null as Date | null, dateStart: new Date("2099-01-02T01:00Z"), dateEnd: new Date("2099-01-02T04:00Z"), course: { name: "Safety" }, venue: "Training room", trainerName: "Trainer", detailsToken:"details-token-for-test-123456", attendanceToken:"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", completions: [{ employeeId: "employee-1", status: "REQUIRED",summaryToken:"summary-token-for-test-123456",summarySubmittedAt:null as Date|null }] } };
  const matches = (where: any) => (!where.id || where.id === row.id) && (typeof where.status === "string" ? row.status === where.status : !where.status?.in || where.status.in.includes(row.status)) && (!where.claimToken || where.claimToken === row.claimToken) && (!where.expiresAt?.lte || row.expiresAt <= where.expiresAt.lte) && (!where.attempts?.gte || row.attempts >= where.attempts.gte) && (!where.attempts?.lt || row.attempts < where.attempts.lt) && (!where.dueAt?.lte || row.dueAt <= where.dueAt.lte) && (!where.expiresAt?.gt || row.expiresAt > where.expiresAt.gt) && (!where.lockedAt || (!!row.lockedAt && row.lockedAt < where.lockedAt.lt)) && (!where.session || !row.session.archivedAt);
  const events: any[] = []; const upserts: any[] = [];
  const db = { trainingEmailTemplate:{findUnique:async()=>null}, trainingEmailEvent:{async create({data}:any){events.push(data);return data;}, async count({where}:any){return events.filter(event=>event.jobId===where.jobId&&event.outcome===where.outcome).length;}}, trainingEmailJob: {
    async upsert(args: any) { upserts.push(args); return {}; },
    async updateMany({ where, data }: any) { if (!matches(where)) return { count: 0 }; const { attempts, ...rest } = data; Object.assign(row, rest); if (attempts?.increment) row.attempts += attempts.increment; else if (typeof attempts === "number") row.attempts = attempts; return { count: 1 }; },
    async findMany({where}: any) { return matches(where) ? [{id: row.id}] : []; },
    async findUniqueOrThrow() { return { ...row }; },
    async count({where}: any) { return Number(matches(where)); }
  } } as unknown as typeof prisma;
  return { row, db, events, upserts };
}

test("worker keeps a history row for every send attempt, including recurring reminders", async () => {
  const old = { ...env }; Object.assign(env, { emailTransport: "smtp", smtpHost: "localhost", smtpUser: "" });
  try {
    const sent = fixture();
    await processTrainingEmails(new Date(), sent.db, async () => ({ rejected: [] }));
    assert.equal(sent.events.length, 1);
    assert.deepEqual({ ...sent.events[0], messageId: undefined }, { jobId: "job-1", sessionId: "session-1", employeeId: "employee-1", kind: "INVITATION", recipient: "person@example.test", cc: [], outcome: "SENT", messageId: undefined, error: null });
    assert.match(sent.events[0].messageId, /^<training-job-1@hr-digital\.local>$/);

    const failed = fixture();
    await processTrainingEmails(new Date(), failed.db, async () => { throw new Error("Connection refused"); });
    assert.equal(failed.events.length, 1); assert.equal(failed.events[0].outcome, "FAILED"); assert.equal(failed.events[0].error, "Connection refused");
    assert.equal(failed.row.status, "PENDING");

    // Recurring reminders reuse one job; each send must still be logged.
    const recurring = fixture(); recurring.row.kind = "SUMMARY_REMINDER";
    recurring.row.session.dateStart = new Date("2025-01-01T01:00Z"); recurring.row.session.dateEnd = new Date("2025-01-01T04:00Z");
    await processTrainingEmails(new Date(), recurring.db, async () => ({ rejected: [] }));
    recurring.row.dueAt = new Date("2025-01-01");
    await processTrainingEmails(new Date(), recurring.db, async () => ({ rejected: [] }));
    assert.equal(recurring.row.status, "PENDING");
    assert.equal(recurring.events.filter(event => event.outcome === "SENT").length, 2);
  } finally { Object.assign(env, old); }
});

test("a history write failure never turns an accepted email into a retry", async () => {
  const old = { ...env }; Object.assign(env, { emailTransport: "smtp", smtpHost: "localhost", smtpUser: "" });
  const originalError = console.error; console.error = () => {};
  try {
    const { row, db } = fixture(); (db as any).trainingEmailEvent.create = async () => { throw new Error("table missing"); };
    let sends = 0;
    await processTrainingEmails(new Date(), db, async () => { sends++; return { rejected: [] }; });
    await processTrainingEmails(new Date(), db, async () => { sends++; return { rejected: [] }; });
    assert.equal(sends, 1); assert.equal(row.status, "SENT");
  } finally { Object.assign(env, old); console.error = originalError; }
});

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

test("stage-specific buttons, HOD CC and recurring summary reminders retain the correct destinations",async()=>{
 const old={...env};Object.assign(env,{emailTransport:"smtp",smtpHost:"localhost",smtpUser:""});
 try{
  const invitation=fixture();(invitation.row.employee as any).hodEmail="hod@example.test";const messages:any[]=[];const send=async(message:any)=>{messages.push(message);return {rejected:[]};};
  await processTrainingEmails(new Date(),invitation.db,send);assert.equal(messages[0].cc,"hod@example.test");assert.match(messages[0].html,/\/training\/details\/details-token-for-test-123456/);
  const reminder=fixture();reminder.row.kind="REMINDER";await processTrainingEmails(new Date(),reminder.db,send);assert.match(messages[1].html,/\/attendance\/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/);assert.match(messages[1].html,/Register attendance/);
  const repeated=fixture();repeated.row.kind="SUMMARY_REMINDER";repeated.row.session.dateEnd=new Date("2026-01-01T04:00Z");await processTrainingEmails(new Date("2026-01-05T04:00Z"),repeated.db,send);assert.equal(repeated.row.status,"PENDING");assert.equal(repeated.row.dueAt.toISOString(),"2026-01-08T01:00:00.000Z");assert.match(messages[2].html,/\/training\/summary\/summary-token-for-test-123456/);assert.equal(messages[2].cc,undefined);
  repeated.row.session.completions[0].summarySubmittedAt=new Date();repeated.row.dueAt=new Date("2020-01-01");await processTrainingEmails(new Date(),repeated.db,send);assert.equal(repeated.row.status,"CANCELLED");assert.equal(messages.length,3);
 }finally{Object.assign(env,old);}
});

test("submitted summaries go to the HOD with notes and attachments; missing HODs remain retryable",async()=>{
 const old={...env};Object.assign(env,{emailTransport:"smtp",smtpHost:"localhost",smtpUser:""});
 try{
  const value=fixture();value.row.kind="HOD_SUMMARY";Object.assign(value.row.session.completions[0],{summarySubmittedAt:new Date(),summaryLearning:"Learning",summaryApplication:"Application",summaryNotes:"My notes <script>",summaryAttachments:[{name:"notes.txt",data:"data:text/plain;base64,bm90ZXM="}]});
  let message:any;await processTrainingEmails(new Date(),value.db,async m=>{message=m;return {};});assert.equal(message,undefined);assert.equal(value.row.status,"PENDING");assert.match(value.row.lastError!,/Missing HOD/);
  (value.row.employee as any).hodEmail="hod@example.test";value.row.dueAt=new Date("2020-01-01");await processTrainingEmails(new Date(),value.db,async m=>{message=m;return {};});assert.equal((message as any).to,"hod@example.test");assert.match((message as any).text,/My notes/);assert.match((message as any).html,/&lt;script&gt;/);assert.equal((message as any).attachments[0].filename,"notes.txt");assert.equal((message as any).attachments[0].content.toString(),"notes");assert.equal(value.row.status,"SENT");
 }finally{Object.assign(env,old);}
});

test("department HOD is used at send time; superior reviews repeat and stop on submission",async()=>{
 const old={...env};Object.assign(env,{emailTransport:"smtp",smtpHost:"localhost",smtpUser:""});
 try{
  const invitation=fixture();Object.assign(invitation.row.employee,{department:{hodEmail:"department@example.test"}});const messages:any[]=[];
  const send=async(m:any)=>{messages.push(m);return {};};
  await processTrainingEmails(new Date(),invitation.db,send);assert.equal(messages[0].cc,"department@example.test");
  const review=fixture();review.row.kind="SUPERIOR_REVIEW";review.row.session.dateEnd=new Date("2026-01-01");Object.assign(review.row.employee,{department:{hodEmail:"department@example.test"},superiorEmail:"superior@example.test"});Object.assign(review.row.session.completions[0],{summarySubmittedAt:new Date(),reviewToken:"review-token-test-123456789"});
  await processTrainingEmails(new Date(),review.db,send);assert.equal(messages[1].to,"superior@example.test");assert.match(messages[1].html,/\/training\/review\/review-token-test-123456789/);assert.equal(review.row.status,"PENDING");assert.ok(review.row.dueAt>new Date());
  Object.assign(review.row.session.completions[0],{reviewSubmittedAt:new Date()});review.row.dueAt=new Date("2020-01-01");await processTrainingEmails(new Date(),review.db,send);assert.equal(review.row.status,"CANCELLED");assert.equal(messages.length,2);
 }finally{Object.assign(env,old);}
});

test("scheduled emails use HR's latest template, CC/BCC, HOD choice and reply-to",async()=>{
 const old={...env};Object.assign(env,{emailTransport:"smtp",smtpHost:"localhost",smtpUser:""});
 try{
  const value=fixture();value.row.kind="REMINDER";Object.assign(value.row.employee,{hodEmail:"hod@example.test"});
  (value.db.trainingEmailTemplate as any).findUnique=async()=>({subject:"Attendance: {{training_name}}",title:"HR attendance reminder",body:"Please register today, {{employee_name}}.",buttonLabel:"Check in",cc:["hr@example.test","person@example.test"],bcc:["archive@example.test"],ccHod:false,replyTo:"replies@example.test"});
  let message:any;await processTrainingEmails(new Date(),value.db,async m=>{message=m;return {};});
  assert.equal(message.to,"person@example.test");assert.equal(message.cc,"hr@example.test");assert.equal(message.bcc,"archive@example.test");assert.equal(message.replyTo,"replies@example.test");assert.equal(message.subject,"Attendance: Safety");assert.match(message.text,/Please register today, Person/);assert.match(message.html,/Check in/);assert.match(message.html,/\/attendance\/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/);
 }finally{Object.assign(env,old);}
});

test("queued HOD emails resolve the linked employee's current email at delivery",async()=>{
 const old={...env};Object.assign(env,{emailTransport:"smtp",smtpHost:"localhost",smtpUser:""});
 try{
  const value=fixture();value.row.kind="HOD_SUMMARY";Object.assign(value.row.session.completions[0],{summarySubmittedAt:new Date()});
  const hod={employeeId:"HOD-1",name:"Linked HOD",email:"old@example.test",status:"ACTIVE"};Object.assign(value.row.employee,{department:{hodEmployeeId:"hod-1",hodEmployee:hod}});hod.email="current@example.test";
  let message:any;await processTrainingEmails(new Date(),value.db,async m=>{message=m;return {};});assert.equal(message.to,"current@example.test");assert.match(message.text,/Hello Linked HOD/);
  const inactive=fixture();inactive.row.kind="HOD_SUMMARY";Object.assign(inactive.row.session.completions[0],{summarySubmittedAt:new Date()});hod.status="INACTIVE";Object.assign(inactive.row.employee,{department:{hodEmployeeId:"hod-1",hodEmployee:hod,hodEmail:"stale@example.test"}});
  let sent=false;await processTrainingEmails(new Date(),inactive.db,async()=>{sent=true;return {};});assert.equal(sent,false);assert.equal(inactive.row.status,"PENDING");
 }finally{Object.assign(env,old);}
});

test("friendly Cc choices resolve superior, participant and selected employees at send time",async()=>{
 const old={...env};Object.assign(env,{emailTransport:"smtp",smtpHost:"localhost",smtpUser:""});
 try{
  const value=fixture();value.row.kind="HOD_SUMMARY";Object.assign(value.row.session.completions[0],{summarySubmittedAt:new Date()});Object.assign(value.row.employee,{hodEmail:"hod@example.test",superiorEmail:"superior@example.test"});
  (value.db.trainingEmailTemplate as any).findUnique=async()=>({ccHod:true,ccSuperior:true,ccParticipant:true,ccEmployeeIds:["chosen"],cc:["superior@example.test"],bcc:[]});
  (value.db as any).employee={findMany:async({where}:any)=>{assert.deepEqual(where,{id:{in:["chosen"]},status:"ACTIVE"});return [{email:"current-colleague@example.test"}];}};
  let message:any;await processTrainingEmails(new Date(),value.db,async m=>{message=m;return {};});assert.equal(message.to,"hod@example.test");assert.equal(message.cc,"superior@example.test, current-colleague@example.test, person@example.test");
 }finally{Object.assign(env,old);}
});

test("the evaluation request schedules reminders from its own send time, at 09:00 on a weekday",async()=>{
 const old={...env};Object.assign(env,{emailTransport:"smtp",smtpHost:"localhost",smtpUser:""});
 try{
  // A training that ended long ago still gets its evaluation request (no expiry window).
  const value=fixture();value.row.kind="FOLLOW_UP";value.row.session.dateEnd=new Date("2020-01-01");const messages:any[]=[];
  // Fri 6 Nov 2026 15:00 MYT + 3 days = Mon 9 Nov 09:00 MYT.
  await processTrainingEmails(new Date("2026-11-06T07:00:00Z"),value.db,async m=>{messages.push(m);return {};});
  assert.equal(messages.length,1);assert.match(messages[0].html,/\/training\/summary\/summary-token-for-test-123456/);assert.equal(value.row.status,"SENT");assert.equal(messages[0].cc,undefined);
  assert.equal(value.upserts.length,1);const reminder=value.upserts[0];
  assert.equal(reminder.create.kind,"SUMMARY_REMINDER");assert.equal(reminder.create.dueAt.toISOString(),"2026-11-09T01:00:00.000Z");assert.equal(reminder.update.status,"PENDING");
 }finally{Object.assign(env,old);}
});

test("from the fifth evaluation reminder the HOD and superior are copied",async()=>{
 const old={...env};Object.assign(env,{emailTransport:"smtp",smtpHost:"localhost",smtpUser:""});
 try{
  const value=fixture();value.row.kind="SUMMARY_REMINDER";Object.assign(value.row.employee,{hodEmail:"hod@example.test",superiorEmail:"superior@example.test"});const messages:any[]=[];
  for(let n=1;n<=5;n++){value.row.dueAt=new Date("2020-01-01");await processTrainingEmails(new Date(),value.db,async m=>{messages.push(m);return {};});}
  assert.equal(messages.length,5);
  for(const message of messages.slice(0,4))assert.equal(message.cc,undefined);
  assert.equal(messages[4].cc,"hod@example.test, superior@example.test");
  // Three-month review: request + 4 reminders plain; the 5th reminder (6th send) escalates. The superior is the recipient.
  const review=fixture();review.row.kind="SUPERIOR_REVIEW";Object.assign(review.row.employee,{hodEmail:"hod@example.test",superiorEmail:"superior@example.test"});Object.assign(review.row.session.completions[0],{summarySubmittedAt:new Date(),reviewToken:"review-token-test-123456789"});const reviews:any[]=[];
  for(let n=1;n<=6;n++){review.row.dueAt=new Date("2020-01-01");await processTrainingEmails(new Date(),review.db,async m=>{reviews.push(m);return {};});}
  assert.equal(reviews.length,6);assert.equal(reviews[4].cc,undefined);assert.equal(reviews[5].to,"superior@example.test");assert.equal(reviews[5].cc,"hod@example.test");
 }finally{Object.assign(env,old);}
});

test("sweep asks every non-excluded participant of ended training, regardless of check-in or notify",async()=>{
 const now=new Date("2026-11-23T02:00:00Z");
 const completion=(employeeId:string,status="REQUIRED",email:string|null=`${employeeId}@example.test`)=>({sessionId:"s1",employeeId,status,employee:{email,status:"ACTIVE"}});
 let where:any;const upserts:any[]=[];
 const jobs=[{sessionId:"s1",employeeId:"pending",kind:"FOLLOW_UP",status:"PENDING"},{sessionId:"s1",employeeId:"cancelled",kind:"FOLLOW_UP",status:"CANCELLED"},{sessionId:"s1",employeeId:"restored",kind:"FOLLOW_UP",status:"SENT"},{sessionId:"s1",employeeId:"restored",kind:"SUMMARY_REMINDER",status:"CANCELLED"},{sessionId:"s1",employeeId:"reminding",kind:"FOLLOW_UP",status:"SENT"},{sessionId:"s1",employeeId:"reminding",kind:"SUMMARY_REMINDER",status:"PENDING"}];
 const db={trainingCompletion:{async findMany(args:any){where=args.where;return [completion("new"),completion("never-checked-in","REQUIRED"),completion("bad-email","REQUIRED","not-an-email"),completion("pending"),completion("cancelled"),completion("restored","COMPLETED"),completion("reminding")];}},
  trainingEmailJob:{async findMany(){return jobs;},async upsert(args:any){upserts.push(args);return {};}}} as unknown as typeof prisma;
 const queued=await ensureEvaluationEmails(db,now);
 assert.deepEqual(where.status,{in:["REQUIRED","COMPLETED"]});assert.equal(where.summarySubmittedAt,null);assert.deepEqual(where.session,{archivedAt:null,dateEnd:{lte:now}});
 assert.equal(queued,4);
 const byEmployee=Object.fromEntries(upserts.map(u=>[u.where.sessionId_employeeId_kind.employeeId,u]));
 assert.deepEqual(Object.keys(byEmployee).sort(),["cancelled","never-checked-in","new","restored"]);
 assert.equal(byEmployee.new.create.kind,"FOLLOW_UP");assert.equal(byEmployee.new.create.dueAt,now);assert.equal(byEmployee.new.create.recipient,"new@example.test");
 assert.equal(byEmployee.cancelled.update.status,"PENDING");assert.equal(byEmployee.cancelled.where.sessionId_employeeId_kind.kind,"FOLLOW_UP");
 // Already asked once: resume reminders rather than re-sending the request. Mon 23 Nov + 3 = Thu 26 Nov 09:00 MYT.
 assert.equal(byEmployee.restored.where.sessionId_employeeId_kind.kind,"SUMMARY_REMINDER");assert.equal(byEmployee.restored.update.dueAt.toISOString(),"2026-11-26T01:00:00.000Z");
});
