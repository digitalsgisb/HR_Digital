import { readFileSync } from "node:fs";
import type { EmailTestTemplate, EmailTestPreview } from "@hr-training/shared";

// Read our bundled asset once. Mail uses an inline attachment so the logo does
// not depend on a public website or the recipient downloading a remote image.
export const emailLogo = readFileSync(new URL("../../client/public/sgi-logo.png", import.meta.url));
export const emailLogoCid = "sugihara-logo@hr-digital";

const templates: Record<EmailTestTemplate, { title: string; intro: string; action: string }> = {
  "email-1": { title: "Your training is coming up", intro: "A quick reminder about your upcoming training. Please review the details below and arrive a few minutes before the session begins.", action: "View training details" },
  "email-2": { title: "Share your training notes", intro: "Thank you for attending your training. Please upload your notes and any useful materials so your team can refer to them later.", action: "Open training records" },
  "email-3": { title: "How has your training helped?", intro: "We would like to understand how you have applied what you learned. Please review your training record and share your feedback with HR.", action: "Review training record" },
  "email-4": { title: "A training action needs your attention", intro: "There is a training follow-up waiting for your attention. Please open HR Digital to review the outstanding action, or contact HR if you need help.", action: "Review outstanding action" }
};

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);

export type TrainingEmailDetails = { name: string; training: string; date: string; time: string; venue: string; trainer: string };
export const developerTrainingDetails: TrainingEmailDetails = { name: "Developer", training: "Developer training", date: "Sample training date", time: "09:00–12:00 · Malaysia time", venue: "Sample training room", trainer: "HR Learning & Development" };

export function renderTrainingEmail(templateId: EmailTestTemplate, details: TrainingEmailDetails, portalUrl: string, test = true): EmailTestPreview {
  const template = templates[templateId];
  const url = new URL(portalUrl);
  if (!["https:", "http:"].includes(url.protocol)) throw new Error("Email portal URL must use HTTP or HTTPS.");
  const href = escapeHtml(url.origin);
  const subject = `${test ? "[TEST] " : ""}${template.title} — ${details.training}`;
  const rows = [["Training", details.training], ["Date", details.date], ["Time", details.time], ["Venue", details.venue], ["Trainer", details.trainer]];
  const testNote = "Developer preview · Sample details only. No employee records or schedules have been changed.";
  const text = `SUGIHARA GRAND INDUSTRIES SDN. BHD.\nHR Digital · Learning & Development\n\n${template.title}\n\nHello ${details.name},\n\n${template.intro}\n\n${rows.map(([label, value]) => `${label}: ${value}`).join("\n")}\n\n${test ? "Open HR Digital (test only; no action will be submitted)" : template.action}: ${url.origin}\n\nIf you need help, please contact Human Resources.\n\nThank you,\nHuman Resources\nSugihara Grand Industries Sdn. Bhd.\n\n${test ? testNote : "This message was sent by HR Digital."}`;
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background-color:#f2f1ef;color:#272525;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all">${escapeHtml(template.intro)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f2f1ef"><tr><td align="center" style="padding:28px 12px">
<!--[if mso]><table role="presentation" width="600"><tr><td><![endif]-->
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;background-color:#ffffff;border:1px solid #e3dfdb;border-radius:16px;overflow:hidden">
<tr><td bgcolor="#171819" style="padding:28px 30px;background-color:#171819;border-bottom:4px solid #9d1d28"><img src="cid:${emailLogoCid}" width="300" alt="Sugihara Grand Industries Sdn. Bhd." style="display:block;width:300px;max-width:100%;height:auto;border:0"><p style="margin:18px 0 0;color:#d0d0d0;font-size:11px;letter-spacing:2px;font-weight:bold">HR DIGITAL &nbsp; / &nbsp; LEARNING &amp; DEVELOPMENT</p></td></tr>
<tr><td style="padding:30px 30px 12px">${test ? '<p style="margin:0 0 18px;font-size:11px;font-weight:bold;letter-spacing:1px;color:#9d1d28">DEVELOPER TEST EMAIL</p>' : ""}<h1 style="margin:0 0 24px;font-size:27px;line-height:1.25;letter-spacing:-0.5px;color:#202122">${escapeHtml(template.title)}</h1><p style="margin:0 0 14px;font-size:15px;line-height:1.7">Hello ${escapeHtml(details.name)},</p><p style="margin:0 0 22px;font-size:15px;line-height:1.7;color:#625c59">${escapeHtml(template.intro)}</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f7f6f4;border:1px solid #e9e5e1;border-radius:10px">${rows.map(([label, value]) => `<tr><td width="82" valign="top" style="padding:12px 16px;font-size:13px;line-height:1.5;color:#79716c;${label !== "Trainer" ? "border-bottom:1px solid #e9e5e1" : ""}">${label}</td><td style="padding:12px 16px 12px 0;font-size:14px;line-height:1.5;font-weight:bold;color:#292524;${label !== "Trainer" ? "border-bottom:1px solid #e9e5e1" : ""}">${escapeHtml(value)}</td></tr>`).join("")}</table>
<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:24px 0"><tr><td bgcolor="#98212b" style="border-radius:8px;background-color:#98212b"><a href="${href}" style="display:inline-block;padding:15px 24px;border:1px solid #98212b;border-radius:8px;font-size:14px;font-weight:bold;line-height:1.3;color:#ffffff;text-decoration:none">${test ? "Open HR Digital" : template.action} &nbsp; &#8594;</a></td></tr></table>
${test ? '<p style="margin:0 0 18px;font-size:12px;line-height:1.6;color:#79716c">The button opens the HR Digital home page. This test does not submit a training action.</p>' : ""}
<p style="margin:0 0 22px;font-size:14px;line-height:1.7;color:#625c59">If you need help, please contact Human Resources.</p><p style="margin:0 0 20px;font-size:14px;line-height:1.7">Thank you,<br><strong>Human Resources</strong><br><span style="color:#79716c">Sugihara Grand Industries Sdn. Bhd.</span></p></td></tr>
<tr><td style="padding:20px 30px;background-color:#faf9f8;border-top:1px solid #e9e5e1"><p style="margin:0;font-size:11px;line-height:1.7;color:#8b827c">${test ? testNote : "This message was sent by HR Digital."}</p></td></tr></table>
<!--[if mso]></td></tr></table><![endif]-->
<p style="margin:18px 0 0;font-size:11px;color:#958d87">SUGIHARA GRAND INDUSTRIES SDN. BHD.</p></td></tr></table></body></html>`;
  return { templateId, subject, text, html };
}

export const previewEmailHtml = (html: string) => html.replace(`cid:${emailLogoCid}`, `data:image/png;base64,${emailLogo.toString("base64")}`);
