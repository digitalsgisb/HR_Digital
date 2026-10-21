import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:net";
import { createEmailTestService, emailTestInput } from "./email-test.js";
import { env } from "./env.js";
import { renderTrainingEmail, developerTrainingDetails, emailLogoCid } from "./email-template.js";

test("local test inbox renders all templates and captures without SMTP", async () => {
  const service = createEmailTestService({ ...env, emailTransport: "preview", smtpHost: "unreachable.invalid" });
  assert.equal(service.status().ready, true);
  await service.verify();
  for (const templateId of ["email-1", "email-2", "email-3", "email-4"] as const) {
    const content = service.preview(templateId);
    assert.match(content.subject, /^\[TEST\]/);
    assert.match(content.html, /Developer training/);
    assert.match(content.html, /data:image\/png;base64,/);
    assert.match(content.html, /Sugihara Grand Industries/);
    assert.doesNotMatch(content.html, /src="https?:/);
    const result = await service.send({ templateId, recipient: "developer@example.test" });
    assert.equal(result.status, "captured");
    assert.ok(result.messageId);
  }
  assert.equal(service.inbox().length, 4);
  assert.equal(service.inbox()[0].templateId, "email-4");
});

test("branded template escapes dynamic details and embeds the logo using CID for mail", () => {
  const message = renderTrainingEmail("email-1", { ...developerTrainingDetails, name: '<script>alert("test")</script>', training: 'Safety & Health' }, "https://hr.sugidigital.org");
  assert.ok(message.html.includes(`src="cid:${emailLogoCid}"`));
  assert.match(message.html, /&lt;script&gt;/);
  assert.match(message.html, /Safety &amp; Health/);
  assert.doesNotMatch(message.html, /<script>/);
  assert.match(message.html, /href="https:\/\/hr.sugidigital.org"/);
  assert.throws(() => renderTrainingEmail("email-1", developerTrainingDetails, "javascript:alert(1)"), /HTTP/);
});

test("reject invalid and unapproved recipients and missing SMTP settings", async () => {
  assert.equal(emailTestInput.safeParse({ templateId: "email-1", recipient: "one@example.test,two@example.test" }).success, false);
  assert.equal(emailTestInput.safeParse({ templateId: "email-1", recipient: "one@example.test\r\nBcc:two@example.test" }).success, false);
  assert.equal(emailTestInput.safeParse({ templateId: "unknown", recipient: "one@example.test" }).success, false);
  const service = createEmailTestService({ ...env, emailTransport: "smtp", smtpHost: "localhost", smtpUser: "", smtpPassword: "", smtpTestRecipients: ["developer@example.test"] });
  await assert.rejects(service.send({ templateId: "email-1", recipient: "employee@example.test" }), /SMTP_TEST_RECIPIENTS/);
  const unconfigured = createEmailTestService({ ...env, emailTransport: "smtp", smtpHost: "", smtpTestRecipients: [] });
  assert.equal(unconfigured.status().ready, false);
  await assert.rejects(unconfigured.verify(), /SMTP_HOST/);
});

test("SMTP verifies and submits multipart mail to a local SMTP fixture", async () => {
  let captured = "";
  const server = createServer(socket => {
    socket.setEncoding("utf8"); socket.write("220 localhost test SMTP\r\n");
    let buffer = ""; let data = false;
    socket.on("data", chunk => {
      buffer += chunk;
      while (buffer.includes("\r\n")) {
        const end = buffer.indexOf("\r\n"); const line = buffer.slice(0, end); buffer = buffer.slice(end + 2);
        if (data) { if (line === ".") { data = false; socket.write("250 queued\r\n"); } else captured += line + "\r\n"; }
        else if (/^EHLO/.test(line)) socket.write("250 localhost\r\n");
        else if (line === "DATA") { data = true; socket.write("354 end with dot\r\n"); }
        else if (line === "QUIT") { socket.end("221 bye\r\n"); }
        else socket.write("250 ok\r\n");
      }
    });
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address(); assert.ok(address && typeof address !== "string");
    const service = createEmailTestService({ ...env, emailTransport: "smtp", smtpHost: "127.0.0.1", smtpPort: address.port, smtpSecure: false, smtpRequireTls: false, smtpUser: "", smtpTestRecipients: ["developer@example.test"] });
    await service.verify();
    const result = await service.send({ templateId: "email-1", recipient: "developer@example.test" });
    assert.equal(result.status, "accepted");
    assert.match(captured, /To: developer@example.test/);
    assert.match(captured, /Content-Type: multipart\/alternative/);
    assert.match(captured, /Content-Type: image\/png/);
    assert.ok(captured.includes(`Content-ID: <${emailLogoCid}>`));
    assert.equal(service.inbox().length, 1);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});
