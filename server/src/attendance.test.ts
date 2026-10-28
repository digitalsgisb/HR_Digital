import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "./app.js";
import { env } from "./env.js";
import { attendanceWindow, finalizeTrainingAttendance, normalizeAttendanceName, publicAttendanceSession, sessionHours } from "./attendance.js";
import { installTrainingFixture } from "./training-fixture.js";

test("attendance timing and name comparison use stable employee details", () => {
  const start=new Date("2026-10-22T01:00Z"),end=new Date("2026-10-22T04:00Z");
  const window=attendanceWindow({dateStart:start,dateEnd:end});
  assert.equal(window.opensAt.toISOString(),"2026-10-22T00:30:00.000Z");
  assert.equal(window.closesAt.toISOString(),"2026-10-22T06:00:00.000Z");
  assert.equal(sessionHours(start,end),3);
  assert.equal(normalizeAttendanceName("  QA   Participant "),normalizeAttendanceName("qa participant"));
  assert.throws(()=>attendanceWindow({dateStart:start,dateEnd:null}),/end time/);
});

test("internal/OJT QR check-in is private, repeatable, closes correctly, and counts hours after end", async () => {
  const previous=env.emailTransport; env.emailTransport="preview";
  const fixture=installTrainingFixture(); const server=createApp().listen(0,"127.0.0.1");
  await new Promise<void>(resolve=>server.once("listening",resolve));
  try {
    const address=server.address();assert.ok(address&&typeof address!=="string");const origin=`http://127.0.0.1:${address.port}`;
    const now=new Date(),start=new Date(now.getTime()-10*60000),end=new Date(now.getTime()+50*60000);
    const body={title:"QA Training",category:"Safety",dateStart:start.toISOString(),dateEnd:end.toISOString(),trainerName:"QA Trainer",venue:"QA Room",capacity:2,deliveryMethod:"Internal training / OJT",notifyParticipants:false,participantEmployeeIds:fixture.employees.map(person=>person.id)};
    const post=async(path:string,input:unknown)=>fetch(origin+path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(input)});
    const planned=await post("/api/training-plans",body);assert.equal(planned.status,201);const session=await planned.json() as any;
    assert.equal(session.attendanceEnabled,true);assert.equal(session.attendanceToken.length,32);
    const hrPath=`/api/training-sessions/${session.id}/attendance`;
    let details=await (await fetch(origin+hrPath)).json() as any;
    assert.equal(details.participants.length,2);assert.ok(details.url.includes("/attendance/"));
    const guestPath=new URL(details.url).pathname;
    const page=await fetch(origin+guestPath);const html=await page.text();assert.equal(page.status,200);
    assert.match(html,/\/training\/portal.css\?v=[a-f0-9]+/);assert.match(html,/data:image\/png;base64/);assert.match(html,/Employee ID/);assert.match(html,/Full name/);assert.doesNotMatch(html,/QA Without Email|qa@example.test|Primary navigation/);
    assert.match(page.headers.get("cache-control")||"",/no-store/);
    const script=await fetch(origin+"/attendance/client.js");const clientScript=await script.text();assert.match(clientScript,/Register|Saving attendance/);
    const input={employeeId:"qa-002",name:"qa without email",confirmed:true};
    assert.equal((await post(guestPath+"/check-in",{...input,name:"Wrong person"})).status,400);
    assert.equal((await post(guestPath+"/check-in",{...input,employeeId:"not-assigned"})).status,400);
    assert.equal((await post(guestPath+"/check-in",{...input,confirmed:false})).status,400);
    const responses=await Promise.all([post(guestPath+"/check-in",input),post(guestPath+"/check-in",input)]);assert.ok(responses.every(response=>response.status===200));
    const first=await responses[0].json() as any;assert.ok(first.checkedInAt);
    // Execute the exact served form script against the running API as well as
    // checking raw requests. This verifies receipt rendering and duplicate UX.
    let submit: ((event: {preventDefault:()=>void})=>Promise<void>) | undefined;
    const button={disabled:false};
    const output={textContent:"",dataset:{} as Record<string,string>,focus:()=>{}};
    const form={action:origin+guestPath+"/check-in",hidden:false,reportValidity:()=>true,querySelector:()=>button,elements:{employeeId:{value:input.employeeId},name:{value:input.name},confirmed:{checked:true}},addEventListener:(_name:string,callback:typeof submit)=>{submit=callback;}};
    new Function("document","fetch","Intl",clientScript)({querySelector:(selector:string)=>selector==="form"?form:output},fetch,Intl);
    assert.ok(submit);await submit({preventDefault:()=>{}});
    assert.equal(form.hidden,true);assert.equal(output.dataset.state,"success");assert.match(output.textContent,/already registered/);assert.match(output.textContent,/QA Without Email/);assert.ok(output.textContent.includes("\n"));
    details=await (await fetch(origin+hrPath)).json() as any;
    assert.equal(details.participants.filter((person:any)=>person.checkedInAt).length,1);
    assert.equal(details.participants.find((person:any)=>person.employeeId==="QA-002").status,"REQUIRED");
    let summary=await (await fetch(origin+"/api/dashboard/summary")).json() as any;assert.equal(summary.stats.totalTrainingHours,0);
    await finalizeTrainingAttendance(new Date(end.getTime()+1000));
    details=await (await fetch(origin+hrPath)).json() as any;const trainee=details.participants.find((person:any)=>person.employeeId==="QA-002");
    assert.equal(trainee.status,"COMPLETED");assert.equal(trainee.hours,1);assert.equal(trainee.source,"QR");
    summary=await (await fetch(origin+"/api/dashboard/summary")).json() as any;assert.equal(summary.stats.totalTrainingHours,1);
    await finalizeTrainingAttendance(new Date(end.getTime()+2000));
    summary=await (await fetch(origin+"/api/dashboard/summary")).json() as any;assert.equal(summary.stats.totalTrainingHours,1);
    await assert.rejects(publicAttendanceSession(session.attendanceToken,new Date(end.getTime()+2*3600000+1)),/closed/);
    const rotated=await post(hrPath+"/qr",{rotate:true});assert.equal(rotated.status,200);const newDetails=await rotated.json() as any;
    assert.notEqual(newDetails.url,details.url);assert.equal((await fetch(origin+guestPath)).status,404);
    assert.equal((await fetch(origin+hrPath+"/qr",{method:"DELETE"})).status,200);
    assert.equal((await fetch(origin+new URL(newDetails.url).pathname)).status,404);
    assert.equal((await fetch(origin+hrPath)).status,200);
    assert.equal((await fetch(origin+`/api/training-sessions/${session.id}`,{method:"DELETE"})).status,200);
    assert.equal((await fetch(origin+hrPath)).status,404);
    assert.equal((await fetch(origin+"/attendance/invalid")).status,404);
    assert.equal((await fetch(origin+"/attendance/unmatched/route")).status,404);
  } finally {await new Promise<void>(resolve=>server.close(()=>resolve()));fixture.restore();env.emailTransport=previous;}
});
