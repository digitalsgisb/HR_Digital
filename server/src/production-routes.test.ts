import assert from "node:assert/strict";
import test from "node:test";
import { createApp } from "./app.js";
import { prisma } from "./prisma.js";

test("roster commit changes assignments only and rejects missing or non-Production employees", async () => {
  const oldTransaction = prisma.$transaction;
  const changes: unknown[] = [];
  (prisma as any).$transaction = async (run: any) => run({ employee: {
    findUnique: async ({where}: any) => where.employeeId === "5000609" ? { id: "existing", department: {name:"Production"} } : where.employeeId === "5000610" ? {id:"other",department:{name:"Maintenance"}} : null,
    update: async (input: any) => { changes.push(input); return input; }
  } });
  const server = createApp().listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  try {
    const address = server.address(); assert.ok(address && typeof address !== "string");
    const post = (rows: unknown[]) => fetch(`http://127.0.0.1:${address.port}/api/employees/production/commit`, {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({rows})});
    const assignment = {employeeId:"5000609",section:"Conversion",line:"FC1",group:"A"};
    const response = await post([{...assignment,name:"Do not overwrite",status:"ACTIVE"}]);
    assert.equal(response.status, 200);
    assert.deepEqual(changes, [{where:{id:"existing"},data:{section:"Conversion",line:"FC1",group:"A"}}]);
    assert.equal((await post([{...assignment,employeeId:"5000610"}])).status,409);
    assert.equal((await post([{...assignment,employeeId:"5999999"}])).status,409);
    assert.equal((await post([assignment,assignment])).status,400);
    assert.equal(changes.length,1);
  } finally {
    prisma.$transaction = oldTransaction;
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
