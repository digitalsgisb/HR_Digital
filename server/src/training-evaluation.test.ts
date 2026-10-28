import test from "node:test";
import assert from "node:assert/strict";
import { evaluationSchema, missingFields, reviewDueDate, resolvedHod, reviewerFields } from "./training-evaluation.js";
import { createApp } from "./app.js";
import { prisma } from "./prisma.js";

test("department HOD fallback, employee overrides and Malaysia calendar-month review dates",()=>{
 assert.equal(resolvedHod({department:{hodEmail:"department@example.test"}}),"department@example.test");
 assert.equal(resolvedHod({hodEmail:" override@example.test ",department:{hodEmail:"department@example.test"}}),"override@example.test");
 assert.equal(reviewDueDate(new Date("2026-11-30T16:30:00Z")).toISOString(),"2027-02-28T16:30:00.000Z"); // December 1 in Malaysia -> March 1.
 assert.equal(reviewDueDate(new Date("2026-11-30T04:00:00Z")).toISOString(),"2027-02-28T04:00:00.000Z");
 const data=evaluationSchema.parse({briefing:"Yes",opportunity:"No",confidence:"1"});
 assert.ok(missingFields(data).includes("briefingFeeling"));assert.ok(missingFields(data).includes("opportunityReason"));assert.ok(missingFields(data).includes("confidenceReason"));
 assert.equal(evaluationSchema.safeParse({relevance:"5"}).success,false);
});

test("superior review gates three-month stage, retains drafts, validates dates and submits once", async t=>{
 const row:any={id:"completion",reviewToken:"review-token-test-123456789",status:"COMPLETED",summarySubmittedAt:new Date(),reviewSubmittedAt:null,employee:{name:"Test Employee",employeeId:"TEST1",status:"ACTIVE"},session:{dateStart:new Date("2020-01-01"),dateEnd:new Date("2020-01-02"),archivedAt:null,course:{name:"Test training"},notes:null,venue:null,trainerName:null,deliveryMethod:null}};
 const originalFind=prisma.trainingCompletion.findUnique,originalUpdate=prisma.trainingCompletion.updateMany;
 (prisma.trainingCompletion as any).findUnique=async({where}:any)=>where.reviewToken===row.reviewToken?row:null;
 (prisma.trainingCompletion as any).updateMany=async({data}:any)=>{Object.assign(row,data);return {count:1};};
 t.after(()=>{prisma.trainingCompletion.findUnique=originalFind;prisma.trainingCompletion.updateMany=originalUpdate;});
 const server=createApp().listen(0,"127.0.0.1");await new Promise<void>(r=>server.once("listening",r));t.after(()=>new Promise<void>(r=>server.close(()=>r())));const address=server.address();assert.ok(address&&typeof address!=="string");
 const url=`http://127.0.0.1:${address.port}/training/review/${row.reviewToken}`;
 const save=(data:any)=>fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(data)});
 assert.match(await(await fetch(url)).text(),/Sections B, C &amp; D/);
 assert.equal((await save({evaluation:{reviewer:"Draft reviewer"}})).status,200);assert.equal(row.review.reviewer,"Draft reviewer");assert.equal(row.reviewSubmittedAt,null);
 assert.equal((await save({evaluation:{},submit:true})).status,400);
 const answers=Object.fromEntries(reviewerFields.map(f=>[f.key,f.options?.[0]|| (f.key.endsWith("Date")?"2020-04-05":"Test acknowledgement")]));
 assert.equal((await save({evaluation:{...answers,reviewDate:"2020-02-31"},submit:true})).status,400);
 row.session.dateEnd=new Date("2099-01-01");assert.equal((await save({evaluation:answers,submit:true})).status,409);row.session.dateEnd=new Date("2020-01-02");
 assert.equal((await save({evaluation:answers,submit:true})).status,200);assert.ok(row.reviewSubmittedAt);
 assert.equal((await save({evaluation:{reviewer:"Overwrite"},submit:true})).status,200);assert.equal(row.review.reviewer,answers.reviewer);
 row.session.archivedAt=new Date();assert.equal((await fetch(url)).status,404);
});
