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

export function renderTrainingEmail(templateId: EmailTestTemplate, details: TrainingEmailDetails, portalUrl: string, test = true, invitation = false): EmailTestPreview {
  const template = invitation ? { title: "You are invited to training", intro: "You have been selected for the training below. Please review the details and make arrangements to attend. Contact Human Resources if you are unable to join.", action: "Open HR Digital" } : templates[templateId];
  const url = new URL(portalUrl);
  if (!["https:", "http:"].includes(url.protocol)) throw new Error("Email portal URL must use HTTP or HTTPS.");
  const href = escapeHtml(url.origin);
  const subject = `${test ? "[TEST] " : ""}${template.title} — ${details.training}`;
  const rows = [["Training", details.training], ["Date", details.date], ["Time", details.time], ["Venue", details.venue], ["Trainer", details.trainer]];
  const testNote = "Developer preview · Sample details only. No employee records or schedules have been changed.";
  const text = `SUGIHARA GRAND INDUSTRIES SDN. BHD.\nHR Digital · Learning & Development\n\n${template.title}\n\nHello ${details.name},\n\n${template.intro}\n\n${rows.map(([label, value]) => `${label}: ${value}`).join("\n")}\n\n${test ? "Open HR Digital (test only; no action will be submitted)" : template.action}: ${url.origin}\n\nIf you need help, please contact Human Resources.\n\nThank you,\nHuman Resources\nSugihara Grand Industries Sdn. Bhd.\n\n${test ? testNote : "This message was sent by HR Digital."}`;
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${escapeHtml(subject)}</title><style>
:root { color-scheme: light; supported-color-schemes: light; }
.email-white { background-color:#ffffff!important; background-image:linear-gradient(#ffffff,#ffffff)!important; color:#000000!important; -webkit-text-fill-color:#000000; }
.email-white p,.email-white h1,.email-white td,.email-white span { color:#000000!important; }
.email-black { background-color:#000000!important; background-image:linear-gradient(#000000,#000000)!important; color:#ffffff!important; -webkit-text-fill-color:#ffffff; }
.email-white .email-black p,.email-white .email-black a { color:#ffffff!important; -webkit-text-fill-color:#ffffff; }
[data-ogsc] .email-white,[data-ogsb] .email-white { background-color:#ffffff!important; background-image:linear-gradient(#ffffff,#ffffff)!important; color:#000000!important; }
[data-ogsc] .email-white p,[data-ogsc] .email-white h1,[data-ogsc] .email-white td,[data-ogsc] .email-white span { color:#000000!important; -webkit-text-fill-color:#000000; }
[data-ogsc] .email-black,[data-ogsb] .email-black { background-color:#000000!important; background-image:linear-gradient(#000000,#000000)!important; color:#ffffff!important; }
[data-ogsc] .email-black p,[data-ogsc] .email-black a { color:#ffffff!important; -webkit-text-fill-color:#ffffff; }
@media (prefers-color-scheme:dark) {
.email-white { background-color:#ffffff!important; background-image:linear-gradient(#ffffff,#ffffff)!important; color:#000000!important; }
.email-black { background-color:#000000!important; background-image:linear-gradient(#000000,#000000)!important; color:#ffffff!important; }
.email-black p,.email-black a { color:#ffffff!important; -webkit-text-fill-color:#ffffff; }
}
</style></head>
<body class="email-white" bgcolor="#ffffff" style="margin:0;padding:0;background-color:#ffffff;color:#000000;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all">${escapeHtml(template.intro)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#ffffff" class="email-white" style="background-color:#ffffff;background-image:linear-gradient(#ffffff,#ffffff)"><tr><td align="center" style="padding:28px 12px">
<!--[if mso]><table role="presentation" width="600"><tr><td><![endif]-->
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" class="email-white" bgcolor="#ffffff" style="max-width:600px;background-color:#ffffff;background-image:linear-gradient(#ffffff,#ffffff);border:1px solid #000000;border-radius:16px;overflow:hidden">
<tr><td class="email-black" bgcolor="#000000" style="padding:28px 30px;background-color:#000000;background-image:linear-gradient(#000000,#000000);border-bottom:4px solid #000000"><img src="cid:${emailLogoCid}" width="300" alt="Sugihara Grand Industries Sdn. Bhd." style="display:block;width:300px;max-width:100%;height:auto;border:0"><p style="margin:18px 0 0;color:#ffffff;font-size:11px;letter-spacing:2px;font-weight:bold">HR DIGITAL &nbsp; / &nbsp; LEARNING &amp; DEVELOPMENT</p></td></tr>
<tr><td class="email-white" bgcolor="#ffffff" style="padding:30px 30px 12px;background-color:#ffffff;background-image:linear-gradient(#ffffff,#ffffff);color:#000000">${test ? '<p style="margin:0 0 18px;font-size:11px;font-weight:bold;letter-spacing:1px;color:#000000">DEVELOPER TEST EMAIL</p>' : ""}<h1 style="margin:0 0 24px;font-size:27px;line-height:1.25;letter-spacing:-0.5px;color:#000000">${escapeHtml(template.title)}</h1><p style="margin:0 0 14px;font-size:15px;line-height:1.7">Hello ${escapeHtml(details.name)},</p><p style="margin:0 0 22px;font-size:15px;line-height:1.7;color:#000000">${escapeHtml(template.intro)}</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" class="email-white" bgcolor="#ffffff" style="background-color:#ffffff;background-image:linear-gradient(#ffffff,#ffffff);border:1px solid #000000;border-radius:10px">${rows.map(([label, value]) => `<tr><td width="82" valign="top" style="padding:12px 16px;font-size:13px;line-height:1.5;color:#000000;${label !== "Trainer" ? "border-bottom:1px solid #000000" : ""}">${label}</td><td style="padding:12px 16px 12px 0;font-size:14px;line-height:1.5;font-weight:bold;color:#000000;${label !== "Trainer" ? "border-bottom:1px solid #000000" : ""}">${escapeHtml(value)}</td></tr>`).join("")}</table>
<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:24px 0"><tr><td class="email-black" bgcolor="#000000" style="border-radius:8px;background-color:#000000;background-image:linear-gradient(#000000,#000000)"><a class="email-black" href="${href}" style="display:inline-block;padding:15px 24px;border:1px solid #000000;border-radius:8px;font-size:14px;font-weight:bold;line-height:1.3;color:#ffffff;text-decoration:none">${test ? "Open HR Digital" : template.action} &nbsp; &#8594;</a></td></tr></table>
${test ? '<p style="margin:0 0 18px;font-size:12px;line-height:1.6;color:#000000">The button opens the HR Digital home page. This test does not submit a training action.</p>' : ""}
<p style="margin:0 0 22px;font-size:14px;line-height:1.7;color:#000000">If you need help, please contact Human Resources.</p><p style="margin:0 0 20px;font-size:14px;line-height:1.7">Thank you,<br><strong>Human Resources</strong><br><span style="color:#000000">Sugihara Grand Industries Sdn. Bhd.</span></p></td></tr>
<tr><td class="email-white" bgcolor="#ffffff" style="padding:20px 30px;background-color:#ffffff;background-image:linear-gradient(#ffffff,#ffffff);border-top:1px solid #000000"><p style="margin:0;font-size:11px;line-height:1.7;color:#000000">${test ? testNote : "This message was sent by HR Digital."}</p></td></tr></table>
<!--[if mso]></td></tr></table><![endif]-->
<p style="margin:18px 0 0;font-size:11px;color:#000000">SUGIHARA GRAND INDUSTRIES SDN. BHD.</p></td></tr></table></body></html>`;
  return { templateId, subject, text, html };
}

export const previewEmailHtml = (html: string) => html.replace(`cid:${emailLogoCid}`, `data:image/png;base64,${emailLogo.toString("base64")}`);
