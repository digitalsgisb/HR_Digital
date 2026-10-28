import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "./app.js";
import { prisma } from "./prisma.js";
import { developerTrainingDetails } from "./email-template.js";
import { trainingEmailTemplateSchema, trainingEmailTemplate, trainingEmailCopies, renderConfiguredTrainingEmail } from "./training-email-templates.js";

test("HR templates validate recipients, headers and placeholders; copies are deduplicated",()=>{
 const defaults=trainingEmailTemplate("INVITATION");
 const saved=trainingEmailTemplateSchema.parse({...defaults,cc:["HR@example.test","hr@example.test"],bcc:["audit@example.test"],replyTo:" HR@example.test "});
 assert.deepEqual(saved.cc,["hr@example.test"]);assert.equal(saved.replyTo,"hr@example.test");
 for(const changes of [{subject:"Subject\r\nBcc:bad@example.test"},{cc:["hr@example.test\r\nBcc:bad@example.test"]},{bcc:["invalid"]},{subject:"{{unsupported}}"},{title:"{{constructor}}"},{body:"Missing {{training_name"},{replyTo:"bad"}]) assert.equal(trainingEmailTemplateSchema.safeParse({...defaults,...changes}).success,false);
 const copies=trainingEmailCopies({...saved,cc:["person@example.test","hr@example.test"],bcc:["hr@example.test","audit@example.test","audit@example.test"]},"person@example.test","hod@example.test");
 assert.deepEqual(copies,{cc:"hr@example.test, hod@example.test",bcc:"audit@example.test"});
 assert.equal(trainingEmailCopies({...saved,ccHod:false},"person@example.test","hod@example.test").cc,"hr@example.test");
});

test("edited wording keeps the employee action URL, branded layout and full evaluation answers",()=>{
 const settings=trainingEmailTemplate("HOD_SUMMARY",{subject:"Evaluation: {{training_name}} / {{employee_name}}",title:"Hello {{employee_name}}",body:"Please review {{training_name}}.\nThank you <script>.",buttonLabel:"Open <details>"});
 const content=renderConfiguredTrainingEmail(settings,{...developerTrainingDetails,name:"Test <employee>",training:"Safe\nwork"},"https://hr.example.test/training/details/private-token",false,"Learning: <script>\nNotes: Test notes");
 assert.equal(content.subject,"Evaluation: Safe work / Test <employee>");
 assert.match(content.html,/Test &lt;employee&gt;/);assert.match(content.html,/Thank you &lt;script&gt;/);assert.match(content.html,/Open &lt;details&gt;/);
 assert.match(content.html,/Learning: &lt;script&gt;/);assert.match(content.html,/Notes: Test notes/);assert.doesNotMatch(content.html,/<script>/);
 assert.match(content.html,/href="https:\/\/hr.example.test\/training\/details\/private-token"/);assert.match(content.html,/cid:sugihara-logo/);
 assert.match(content.text,/Learning: <script>/);
});

test("HR can save templates and preview drafts without changing the saved template or sending email",async t=>{
 const rows=new Map<string,any>(),originalFind=prisma.trainingEmailTemplate.findMany,originalUpsert=prisma.trainingEmailTemplate.upsert;
 (prisma.trainingEmailTemplate as any).findMany=async()=>[...rows.values()];
 (prisma.trainingEmailTemplate as any).upsert=async({where,create,update}:any)=>{const row={...(rows.get(where.kind)?{...rows.get(where.kind),...update}:create),updatedAt:new Date()};rows.set(where.kind,row);return row;};
 t.after(()=>{prisma.trainingEmailTemplate.findMany=originalFind;prisma.trainingEmailTemplate.upsert=originalUpsert;});
 const server=createApp().listen(0,"127.0.0.1");await new Promise<void>(resolve=>server.once("listening",resolve));t.after(()=>new Promise<void>(resolve=>server.close(()=>resolve())));
 const address=server.address();assert.ok(address&&typeof address!=="string");const root=`http://127.0.0.1:${address.port}/api/training-email/templates`;
 const list:any=await(await fetch(root)).json();assert.equal(list.templates.length,6);assert.equal(list.templates[0].ccHod,true);
 const template={...trainingEmailTemplate("REMINDER"),subject:"HR reminder — {{training_name}}",cc:["hr@example.test"],bcc:["archive@example.test"],ccHod:false,replyTo:"hr@example.test"};
 const save=(value:unknown)=>fetch(`${root}/REMINDER`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(value)});
 assert.equal((await save({...template,cc:["invalid"]})).status,400);assert.equal(rows.size,0);
 assert.equal((await save(template)).status,200);assert.equal(rows.get("REMINDER").ccHod,false);
 const preview=await fetch(`${root}/preview`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({kind:"REMINDER",template:{...template,subject:"Draft preview"}})});
 assert.equal(preview.status,200);const body:any=await preview.json();assert.equal(body.subject,"[TEST] Draft preview");assert.match(body.html,/data:image\/png;base64/);assert.doesNotMatch(body.html,/\/attendance\/|\/training\/summary\//);
 assert.equal(rows.get("REMINDER").subject,template.subject);const after:any=await(await fetch(root)).json();assert.deepEqual(after.templates.find((row:any)=>row.kind==="REMINDER").bcc,["archive@example.test"]);
});
