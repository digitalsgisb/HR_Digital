import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "./app.js";
import { prisma } from "./prisma.js";
import { resolvedHod, resolvedHodName } from "./training-evaluation.js";

test("linked HOD contacts follow employee edits and stop routing to inactive or email-less HODs",()=>{
 const person={name:"Test HOD",employeeId:"TEST-HOD",email:"hod@example.test" as string|null,status:"ACTIVE"};
 const employee={department:{hodEmployeeId:"hod",hodEmployee:person,hodEmail:"old@example.test"}};
 assert.equal(resolvedHod(employee),"hod@example.test");assert.equal(resolvedHodName(employee),"Test HOD");
 person.email="new@example.test";person.name="Updated HOD";assert.equal(resolvedHod(employee),"new@example.test");assert.equal(resolvedHodName(employee),"Updated HOD");
 person.status="INACTIVE";assert.equal(resolvedHod(employee),"");person.status="ACTIVE";person.email=null;assert.equal(resolvedHod(employee),"");
 assert.equal(resolvedHod({...employee,hodEmail:"override@example.test"}),"override@example.test");
 assert.equal(resolvedHod({department:{hodEmail:"legacy@example.test"}}),"legacy@example.test");
});

test("HR assigns one employee across departments, changes or clears assignments and rejects invalid employees",async t=>{
 const departments:any[]=[{id:"dept-a",name:"Test Accounts",code:"A",hodName:"Legacy",hodEmail:"old@example.test",hodEmployeeId:null},{id:"dept-b",name:"Test Operations",code:"B",hodEmployeeId:null}];
 const people:any[]=[{id:"hod",employeeId:"TEST-HOD",name:"Shared HOD",email:"hod@example.test",status:"ACTIVE",departmentId:"management"},{id:"inactive",employeeId:"TEST-OFF",name:"Former HOD",email:"off@example.test",status:"INACTIVE"},{id:"no-email",employeeId:"TEST-NO",name:"HOD pending email",email:null,status:"ACTIVE"}];
 const restore:Array<()=>void>=[];const replace=(target:any,key:string,fn:any)=>{const old=target[key];target[key]=fn;restore.push(()=>target[key]=old);};t.after(()=>restore.reverse().forEach(fn=>fn()));
 const withHod=(row:any)=>({...row,hodEmployee:people.find(person=>person.id===row.hodEmployeeId)||null});
 replace(prisma.department,"findUnique",async({where}:any)=>departments.find(row=>row.id===where.id)||null);
 replace(prisma.department,"findMany",async()=>departments.map(withHod));
 replace(prisma.department,"update",async({where,data}:any)=>{const row=departments.find(row=>row.id===where.id);Object.assign(row,data);return withHod(row);});
 replace(prisma.employee,"findUnique",async({where}:any)=>people.find(row=>row.id===where.id)||null);
 const server=createApp().listen(0,"127.0.0.1");await new Promise<void>(r=>server.once("listening",r));t.after(()=>new Promise<void>(r=>server.close(()=>r())));
 const address=server.address();assert.ok(address&&typeof address!=="string");const root=`http://127.0.0.1:${address.port}/api/departments`;
 const save=(department:string,id:string|null)=>fetch(`${root}/${department}/hod`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({hodEmployeeId:id})});
 assert.equal((await save("dept-a","hod")).status,200);assert.equal((await save("dept-b","hod")).status,200);assert.ok(departments.every(row=>row.hodEmployeeId==="hod"));assert.equal(departments[0].hodEmail,null);
 people[0].email="changed@example.test";const list:any=await(await fetch(root)).json();assert.ok(list.every((row:any)=>row.hodEmployee.email==="changed@example.test"));
 assert.equal((await save("dept-a","inactive")).status,409);assert.equal(departments[0].hodEmployeeId,"hod");
 assert.equal((await save("dept-a","missing")).status,404);assert.equal((await save("missing-dept","hod")).status,404);assert.equal((await save("dept-a","")).status,400);
 assert.equal((await save("dept-a","no-email")).status,200);assert.equal(resolvedHod({department:withHod(departments[0])}),"");
 assert.equal((await save("dept-a",null)).status,200);assert.equal(departments[0].hodEmployeeId,null);assert.equal(resolvedHod({department:withHod(departments[0])}),"");assert.equal(departments[1].hodEmployeeId,"hod");
});
