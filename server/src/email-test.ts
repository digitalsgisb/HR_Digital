import nodemailer from "nodemailer";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { emailTestTemplates, type EmailTestPreview, type EmailTestMessage, type EmailTestResult, type EmailTestStatus } from "@hr-training/shared";
import { env } from "./env.js";

export const emailTestInput = z.object({ templateId: z.enum(emailTestTemplates), recipient: z.string().trim().email().max(254).transform(value => value.toLowerCase()) });
const titles = ["Training day reminder", "Notes upload request", "Post-training effectiveness form", "Overdue action follow-up"];
const copy = ["This is a reminder about your upcoming training.", "Please share your notes after completing your training.", "Please review how the training has helped you in your work.", "Please review your outstanding training actions."];
class EmailTestError extends Error { constructor(public status: number, message: string) { super(message); } }

export function createEmailTestService(config = env) {
  const inbox: EmailTestMessage[] = [];
  const mode = config.emailTransport === "smtp" ? "smtp" : "preview";
  const transporter = mode === "preview" ? nodemailer.createTransport({ streamTransport: true, buffer: true, newline: "unix" }) : nodemailer.createTransport({
    host: config.smtpHost, port: config.smtpPort, secure: config.smtpSecure, requireTLS: config.smtpRequireTls,
    auth: config.smtpUser ? { user: config.smtpUser, pass: config.smtpPassword } : undefined,
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
    disableFileAccess: true, disableUrlAccess: true
  });
  const status = (): EmailTestStatus => {
    const issues: string[] = [];
    if (!["smtp", "preview"].includes(config.emailTransport)) issues.push("EMAIL_TRANSPORT must be preview or smtp.");
    if (mode === "smtp") {
      if (!config.smtpHost) issues.push("Set SMTP_HOST on the server.");
      if (!Number.isInteger(config.smtpPort) || config.smtpPort < 1 || config.smtpPort > 65535) issues.push("Set a valid SMTP_PORT.");
      if (config.smtpUser && !config.smtpPassword) issues.push("Set SMTP_PASSWORD on the server.");
      if (!config.smtpTestRecipients.length || config.smtpTestRecipients.some(value => !z.string().email().safeParse(value).success)) issues.push("Set SMTP_TEST_RECIPIENTS to your permitted test email addresses.");
    }
    return { mode, ready: issues.length === 0, from: config.smtpFrom, allowedRecipients: mode === "smtp" ? config.smtpTestRecipients : [], issues };
  };
  const assertReady = () => { const state = status(); if (!state.ready) throw new EmailTestError(503, state.issues.join(" ")); };
  const preview = (templateId: EmailTestPreview["templateId"]): EmailTestPreview => {
    const index = emailTestTemplates.indexOf(templateId);
    const subject = `[TEST] ${titles[index]} — Developer training`;
    const text = `HR Digital developer test\n\nHello Developer,\n\n${copy[index]}\n\nTraining: Developer training\nVenue: Test venue\n\nThis is a test using sample details. No employee records or automated schedules were changed.\n\nHuman Resources · HR Digital`;
    const html = `<!doctype html><html><body style="margin:0;background:#f4f3f1;font-family:Arial,sans-serif;color:#242424"><main style="max-width:560px;margin:24px auto;background:white;padding:32px;border-radius:16px"><p style="font-weight:bold">HR Digital · DEVELOPER TEST</p><h1 style="font-size:24px">${titles[index]}</h1><p>Hello Developer,</p><p>${copy[index]}</p><div style="padding:20px;background:#f4f3f1;border-radius:12px"><strong>Developer training</strong><p>Venue: Test venue</p></div><p>This is a test using sample details. No employee records or automated schedules were changed.</p><p>Human Resources<br>HR Digital</p></main></body></html>`;
    return { templateId, subject, html, text };
  };
  return {
    status, preview, inbox: () => inbox.slice(),
    async verify() {
      assertReady();
      try { if (mode === "smtp") await transporter.verify(); }
      catch { throw new EmailTestError(502, "SMTP connection failed. Check the server host, port, TLS and credentials."); }
      return { mode, message: mode === "preview" ? "Local test inbox is ready. No emails leave this server." : "SMTP connection and authentication succeeded. Delivery still depends on the mail provider." };
    },
    async send(input: z.infer<typeof emailTestInput>): Promise<EmailTestResult> {
      assertReady();
      if (mode === "smtp" && !config.smtpTestRecipients.includes(input.recipient)) throw new EmailTestError(400, "Choose an address listed in SMTP_TEST_RECIPIENTS on the server.");
      const content = preview(input.templateId);
      let messageId: string;
      try {
        const result = await transporter.sendMail({ from: config.smtpFrom, to: input.recipient, subject: content.subject, text: content.text, html: content.html, disableFileAccess: true, disableUrlAccess: true });
        if (mode === "smtp" && result.rejected?.length) throw new Error("Recipient rejected");
        messageId = result.messageId;
      } catch { throw new EmailTestError(502, "Test email was not accepted. Check the SMTP server configuration and recipient, then try again."); }
      const id = randomUUID();
      inbox.unshift({ ...content, id, recipient: input.recipient, mode, messageId, createdAt: new Date().toISOString() });
      inbox.splice(20);
      return { id, recipient: input.recipient, subject: content.subject, mode, status: mode === "preview" ? "captured" : "accepted", messageId };
    }
  };
}

export const emailTestService = createEmailTestService();
