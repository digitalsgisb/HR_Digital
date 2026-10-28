import { z } from "zod";
import { renderTrainingEmail, type TrainingEmailDetails } from "./email-template.js";

export const trainingEmailKinds = ["INVITATION", "REMINDER", "FOLLOW_UP", "SUMMARY_REMINDER", "HOD_SUMMARY", "SUPERIOR_REVIEW"] as const;
export type TrainingEmailTemplateKind = typeof trainingEmailKinds[number];
export const emailVariables = {
  employee_name: "Employee name", training_name: "Training title", training_date: "Training date",
  training_time: "Training time", venue: "Venue", trainer: "Trainer",
};
const emailAddress = z.string().trim().max(254).email().transform(v => v.toLowerCase());
const addresses = z.array(emailAddress).max(20).transform(values => [...new Set(values)]);
const templateText = (max: number, singleLine = false) => z.string().trim().min(1).max(max).superRefine((value, ctx) => {
  if (singleLine && /[\r\n]/.test(value)) ctx.addIssue({code:"custom", message:"Use a single line for the subject, heading and button label."});
  const remainder = value.replace(/\{\{([a-z_]+)\}\}/g, (match, key: string) => {
    if (!(Object.prototype.hasOwnProperty.call(emailVariables,key))) ctx.addIssue({code:"custom",message:`Unknown placeholder ${match}. Use one of the listed placeholders.`});
    return "";
  });
  if (remainder.includes("{{") || remainder.includes("}}")) ctx.addIssue({code:"custom",message:"Use placeholders in the format {{training_name}}."});
});
export const trainingEmailTemplateSchema = z.object({
  subject: templateText(250, true), title: templateText(180, true), body: templateText(12000), buttonLabel: templateText(80, true),
  cc: addresses.default([]), bcc: addresses.default([]), ccHod: z.boolean().default(false),
  replyTo: z.union([emailAddress, z.literal(""), z.null()]).optional().transform(v => v || null),
});
export type TrainingEmailTemplateInput = z.infer<typeof trainingEmailTemplateSchema>;
export type TrainingEmailTemplateSettings = TrainingEmailTemplateInput & { kind: TrainingEmailTemplateKind; label: string };
const base = { cc: [] as string[], bcc: [] as string[], replyTo: null, ccHod: false };
export const defaultTrainingEmailTemplates: TrainingEmailTemplateSettings[] = [
  { ...base, kind:"INVITATION", label:"Training invitation", ccHod:true, subject:"You are invited to training — {{training_name}}", title:"You are invited to training", body:"Please review your training details below and make arrangements to attend.", buttonLabel:"View training details" },
  { ...base, kind:"REMINDER", label:"Training-day attendance reminder", ccHod:true, subject:"Register your training attendance — {{training_name}}", title:"Register your training attendance", body:"Your training is today. Please click the button and enter your attendance during the check-in window.", buttonLabel:"Register attendance" },
  { ...base, kind:"FOLLOW_UP", label:"Participant evaluation request", subject:"Complete your training evaluation — {{training_name}}", title:"Complete your training evaluation", body:"Thank you for attending. Please complete Section A of the training evaluation within one week, add your notes and useful materials, and submit it to HR and your HOD. Reminders are sent every three days until submission.", buttonLabel:"Complete training evaluation" },
  { ...base, kind:"SUMMARY_REMINDER", label:"Outstanding evaluation reminder", subject:"Reminder: complete your training evaluation — {{training_name}}", title:"Reminder: complete your training evaluation", body:"We have not yet received your completed training evaluation. Please fill in Section A, add any notes or materials, and submit it. Reminders continue every three days until submission.", buttonLabel:"Complete training evaluation" },
  { ...base, kind:"HOD_SUMMARY", label:"Submitted evaluation to HOD", subject:"Training evaluation — {{training_name}} — {{employee_name}}", title:"A participant submitted their evaluation", body:"Please review the completed evaluation and materials from {{employee_name}} below. HR can also view this record in HR Digital.", buttonLabel:"View training details" },
  { ...base, kind:"SUPERIOR_REVIEW", label:"Three-month superior review", subject:"Three-month evaluation — {{training_name}} — {{employee_name}}", title:"Complete the three-month training review", body:"Please complete Section B for {{employee_name}}, record the feedback session in Section C, and the skills-map update in Section D. Save drafts between stages. Reminders continue every three days until the review is submitted.", buttonLabel:"Complete three-month evaluation" },
];
export function trainingEmailTemplate(kind: string, saved?: Partial<TrainingEmailTemplateInput> | null): TrainingEmailTemplateSettings {
  const defaults = defaultTrainingEmailTemplates.find(template => template.kind === kind);
  if (!defaults) throw new Error("Unknown training email type.");
  return { ...defaults, ...saved };
}
export function renderConfiguredTrainingEmail(settings: TrainingEmailTemplateSettings, details: TrainingEmailDetails, url: string, test = false, additionalText = "", recipientName = details.name) {
  const values: Record<keyof typeof emailVariables, string> = { employee_name: details.name, training_name: details.training, training_date: details.date, training_time: details.time, venue: details.venue, trainer: details.trainer };
  const expand = (value: string) => value.replace(/\{\{([a-z_]+)\}\}/g, (_match, key: keyof typeof emailVariables) => values[key]);
  return renderTrainingEmail("email-1", {...details,name:recipientName}, url, test, false, {
    subject: expand(settings.subject).replace(/[\r\n]/g, " "), title: expand(settings.title), intro: expand(settings.body), action: expand(settings.buttonLabel), additionalText,
  });
}
export function trainingEmailCopies(settings: Pick<TrainingEmailTemplateInput,"cc"|"bcc"|"ccHod">, recipient: string, hodEmail: string) {
  const to = recipient.trim().toLowerCase();
  const cc = [...new Set([...settings.cc, ...(settings.ccHod && emailAddress.safeParse(hodEmail).success ? [hodEmail] : [])].map(v => v.trim().toLowerCase()))].filter(v => v !== to);
  const bcc = [...new Set(settings.bcc.map(v=>v.trim().toLowerCase()))].filter(v => v !== to && !cc.includes(v));
  return { cc: cc.length ? cc.join(", ") : undefined, bcc: bcc.length ? bcc.join(", ") : undefined };
}
