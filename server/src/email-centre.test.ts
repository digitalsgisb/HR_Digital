import test from "node:test";
import assert from "node:assert/strict";
import {participantStage,reviewStage} from "../../client/src/evaluation-status.js";
import {createApp} from "./app.js";
import {prisma} from "./prisma.js";

test("evaluation status separates future training, outstanding forms and three-month reviews",()=>{
 const now=new Date("2026-10-28T04:00Z").getTime();const row={dateEnd:"2026-10-27T04:00Z",attendance:"COMPLETED",submittedAt:null,reviewDueAt:"2027-01-27T04:00Z",reviewSubmittedAt:null};
 assert.equal(participantStage(row,now),"Outstanding");assert.equal(participantStage({...row,employeeStatus:"INACTIVE"},now),"Employee inactive");assert.equal(participantStage({...row,dateEnd:"2026-10-29T04:00Z"},now),"Not open yet");assert.equal(participantStage({...row,dateEnd:null},now),"Training end date needed");assert.equal(participantStage({...row,attendance:"ABSENT"},now),"Not required");
 assert.equal(participantStage({...row,evaluation:{briefing:"No"}},now),"Draft");assert.equal(participantStage({...row,submittedAt:"2026-10-27T05:00Z"},now),"Submitted");
 assert.equal(reviewStage(row,now),"Waiting for participant");assert.equal(reviewStage({...row,submittedAt:"2026-10-27T05:00Z"},now),"Scheduled");assert.equal(reviewStage({...row,submittedAt:"2026-10-27T05:00Z",reviewDueAt:"2026-10-01T04:00Z"},now),"Outstanding");assert.equal(reviewStage({...row,reviewSubmittedAt:"2026-10-27T05:00Z"},now),"Submitted to HR");
});

test("delivery records filter status, page results, and omit archived training",async t=>{
 const jobs=Array.from({length:30},(_,index)=>({id:`job-${index}`,kind:"INVITATION",recipient:`person${index}@example.test`,status:index<27?"FAILED":"SENT",dueAt:new Date(),sentAt:null,lastError:null,employee:{name:`Person ${index}`,employeeId:`EMP${index}`},session:{archivedAt:index===0?new Date():null,course:{name:"Test training"}}}));
 const originalFind=prisma.trainingEmailJob.findMany,originalCount=prisma.trainingEmailJob.count;
 const matching=(where:any)=>jobs.filter(job=>job.session.archivedAt===null&&(!where.status||job.status===where.status));
 (prisma.trainingEmailJob as any).findMany=async({where,skip,take}:any)=>matching(where).slice(skip,skip+take);
 (prisma.trainingEmailJob as any).count=async({where}:any)=>matching(where).length;
 t.after(()=>{prisma.trainingEmailJob.findMany=originalFind;prisma.trainingEmailJob.count=originalCount;});
 const server=createApp().listen(0,"127.0.0.1");await new Promise<void>(resolve=>server.once("listening",resolve));t.after(()=>new Promise<void>(resolve=>server.close(()=>resolve())));const address=server.address();assert.ok(address&&typeof address!=="string");const url=`http://127.0.0.1:${address.port}/api/training-email/deliveries`;
 const first:any=await(await fetch(url+"?status=FAILED")).json();assert.equal(first.total,26);assert.equal(first.rows.length,25);assert.ok(first.rows.every((row:any)=>row.status==="FAILED"&&row.id!=="job-0"));
 const second:any=await(await fetch(url+"?status=FAILED&page=1")).json();assert.equal(second.rows.length,1);assert.ok(!first.rows.some((row:any)=>row.id===second.rows[0].id));
 assert.equal((await fetch(url+"?status=unknown")).status,400);assert.equal((await fetch(url+"?page=-1")).status,400);
});
