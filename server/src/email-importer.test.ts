import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseEmployeeEmails } from "./email-importer.js";

const file = (body: string) => Buffer.from(`Display name,User principal name\n${body}`);
describe("employee email matching", () => {
  it("matches unique full names while preserving missing emails and review accounts", async () => {
    const employees = [
      { employeeId: "001", name: "AIMAN BIN ALI", email: null },
      { employeeId: "002", name: "Siti Aminah", email: "existing@example.com" },
      { employeeId: "003", name: "Employee Without Email", email: null }
    ];
    const before = structuredClone(employees);
    const preview = await parseEmployeeEmails(file(' Aiman  Bin Ali ,AIMAN@example.com\nSITI AMINAH,siti@example.com\nAccounts Team,accounts@example.com'), "emails.csv", employees);
    assert.equal(preview.matched, 2);
    assert.equal(preview.needsReview, 1);
    assert.equal(preview.rows[0].employeeId, "001");
    assert.equal(preview.rows[0].email, "aiman@example.com");
    assert.equal(preview.rows[1].existingEmail, "existing@example.com");
    assert.equal(preview.rows[2].employeeId, undefined);
    assert.deepEqual(employees, before);
  });

  it("leaves ambiguous names and duplicate assignments for review", async () => {
    const employees = [{ employeeId: "001", name: "Same Name" }, { employeeId: "002", name: "Same Name" }, { employeeId: "003", name: "Unique Name" }];
    const preview = await parseEmployeeEmails(file('Same Name,same@example.com\nUnique Name,one@example.com\nUnique Name,two@example.com'), "emails.csv", employees);
    assert.equal(preview.rows[0].employeeId, undefined);
    assert.match(preview.rows[0].issue!, /More than one/);
    assert.equal(preview.rows[1].employeeId, "003");
    assert.equal(preview.rows[2].employeeId, undefined);
  });

  it("blocks malformed addresses, repeated addresses and ownership conflicts", async () => {
    const employees = [{ employeeId: "001", name: "Sample Person" }, { employeeId: "002", name: "Other Person", email: "taken@example.com" }];
    const preview = await parseEmployeeEmails(file('Sample Person,invalid\nSample Person,taken@example.com\nUnknown,same@example.com\nAnother,same@example.com'), "emails.csv", employees);
    assert.equal(preview.matched, 0);
    assert.equal(preview.rows[0].invalid, true);
    assert.match(preview.rows[1].issue!, /already assigned/);
    assert.equal(preview.rows[3].invalid, true);
  });

  it("requires the account export headers", async () => {
    await assert.rejects(parseEmployeeEmails(Buffer.from('Name,Email\nSample,sample@example.com'), 'emails.csv', []), /Display name/);
  });
});
