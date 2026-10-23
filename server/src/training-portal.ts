import { Router } from "express";
import { z } from "zod";
import { prisma } from "./prisma.js";
import { attendanceUrl, AttendanceError } from "./attendance.js";
export const escapeHtml = (v: string) => v.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
export const attachmentSchema = z.object({ name: z.string().trim().min(1).max(180), data: z.string().max(2800000).regex(/^data:(application\/pdf|image\/png|image\/jpeg|text\/plain|application\/vnd.openxmlformats-officedocument.wordprocessingml.document);base64,[A-Za-z0-9+/=]+$/) });
export const summarySchema = z.object({ learning: z.string().trim().max(20000).default(""), application: z.string().trim().max(20000).default(""), feedback: z.string().trim().max(20000).default(""), notes: z.string().max(50000).default(""), attachments: z.array(attachmentSchema).max(3).default([]), submit: z.boolean().default(false) }).superRefine((v, ctx) => { if (v.submit && (!v.learning || !v.application))
    ctx.addIssue({ code: "custom", message: "Please describe what you learned and how you will apply it." }); });
export const trainingPortalUrl = (path: string) => new URL(path, attendanceUrl("placeholder")).toString();
export function createTrainingReviewRouter() { const router = Router(); router.get("/training-summaries", async (_req, res, next) => { try {
    const records = await prisma.trainingCompletion.findMany({ where: { session: { archivedAt: null } }, include: { employee: true, session: { include: { course: true, emailJobs: { where: { kind: "HOD_SUMMARY" }, select: { employeeId: true, status: true, lastError: true } } } } }, orderBy: { session: { dateStart: "desc" } } });
    res.json(records.map(r => ({ id: r.id, employeeId: r.employee.employeeId, name: r.employee.name || r.employee.employeeId, hodEmail: r.employee.hodEmail, training: r.session.course.name, dateEnd: r.session.dateEnd, attendance: r.status, submittedAt: r.summarySubmittedAt, learning: r.summaryLearning, application: r.summaryApplication, feedback: r.summaryFeedback, notes: r.summaryNotes, attachments: r.summaryAttachments || [], delivery: r.session.emailJobs.find(j => j.employeeId === r.employeeId) || null, url: trainingPortalUrl(`/training/summary/${r.summaryToken}`) })));
}
catch (e) {
    next(e);
} }); return router; }
const shell = (body: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Training · HR Digital</title><link rel="stylesheet" href="/training/portal.css"></head><body><main><header>SGI · HR Digital</header><section>${body}</section></main><script src="/training/portal.js" defer></script></body></html>`;
const token = (value: unknown) => z.string().regex(/^[A-Za-z0-9_-]{20,64}$/).parse(value);
const details = (s: {
    course: {
        name: string;
    };
    dateStart: Date;
    dateEnd: Date | null;
    venue: string | null;
    trainerName: string | null;
    deliveryMethod: string | null;
    notes: string | null;
}) => `<h1>${escapeHtml(s.course.name)}</h1><dl>${[["Starts", s.dateStart.toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur" })], ["Ends", s.dateEnd?.toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur" }) || "Ask HR"], ["Venue", s.venue || "Ask HR"], ["Trainer", s.trainerName || "Human Resources"], ["Delivery", s.deliveryMethod || "Ask HR"]].map(([a, b]) => `<dt>${a}</dt><dd>${escapeHtml(b)}</dd>`).join("")}</dl><p>All times are Malaysia time.</p>${s.notes ? `<p class="notes">${escapeHtml(s.notes)}</p>` : ""}`;
export function createTrainingPortalRouter() {
    const router = Router();
    router.get("/portal.css", (_q, r) => r.type("css").send(`*{box-sizing:border-box}body{font:16px/1.6 Arial;background:#f4f4f4;margin:0;color:#171717}main{max-width:700px;margin:24px auto;padding:12px}header{background:#111;color:white;padding:24px;border-radius:12px 12px 0 0}section{padding:24px;background:white}h1{line-height:1.25}dt{font-size:13px;color:#555;margin-top:12px}dd{margin:0;font-weight:bold}label{display:block;margin:20px 0}textarea{display:block;width:100%;min-height:130px;padding:12px;font:inherit}button,a.button{display:inline-block;background:#111;color:white;padding:14px 20px;border:0;border-radius:6px;margin:8px 8px 8px 0;font:inherit;cursor:pointer}button:disabled{opacity:.5}.notes{white-space:pre-wrap;overflow-wrap:anywhere}#message{white-space:pre-wrap}input{max-width:100%}`));
    router.get("/portal.js", (_q, r) => r.type("js").send(`const form=document.querySelector('form');if(form) form.addEventListener('submit',async event=>{event.preventDefault();const output=document.querySelector('#message');const buttons=[...form.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);try{const data=Object.fromEntries(new FormData(form));const attachments=JSON.parse(document.querySelector('#saved-files').textContent);const files=[...form.querySelector('[type=file]').files];if(attachments.length+files.length>3)throw Error('Attach up to three files.');for(const file of files){if(file.size>2000000)throw Error('Each attachment must be 2 MB or smaller.');const value=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file);});attachments.push({name:file.name,data:value});}delete data.files;data.attachments=attachments;data.submit=event.submitter.value==='submit';const response=await fetch(location.pathname,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const result=await response.json();if(!response.ok)throw Error(result.message||'Could not save.');output.textContent=result.message;location.href=location.pathname+(data.submit?'':'?saved=draft');}catch(e){output.textContent=e.message||'Could not save. Please retry.';}finally{buttons.forEach(b=>b.disabled=false);}});`));
    router.get("/details/:token", async (req, res, next) => { try {
        const session = await prisma.trainingSession.findFirst({ where: { detailsToken: token(req.params.token), archivedAt: null }, include: { course: true } });
        if (!session)
            throw new AttendanceError(404, "Training was not found. Contact HR.");
        res.type("html").send(shell(details(session)));
    }
    catch (e) {
        next(e);
    } });
    const load = async (value: unknown) => { const record = await prisma.trainingCompletion.findUnique({ where: { summaryToken: token(value) }, include: { employee: true, session: { include: { course: true } } } }); if (!record || record.session.archivedAt || !["REQUIRED", "COMPLETED"].includes(record.status) || record.employee.status !== "ACTIVE")
        throw new AttendanceError(404, "This training summary is unavailable. Contact HR."); if (!record.session.dateEnd || record.session.dateEnd > new Date())
        throw new AttendanceError(409, "The summary opens after training ends."); return record; };
    router.get("/summary/:token", async (req, res, next) => { try {
        const record = await load(req.params.token);
        const files = Array.isArray(record.summaryAttachments) ? record.summaryAttachments : [];
        res.set("Cache-Control", "no-store").type("html").send(shell(`${details(record.session)}<p>Participant: <strong>${escapeHtml(record.employee.name || record.employee.employeeId)}</strong></p>${record.summarySubmittedAt ? "<h2>Summary submitted</h2><p>Thank you. Your completed summary is available to HR and queued for delivery to your HOD.</p>" : `<h2>Training summary</h2><p>Save a draft as you work. Submit when finished. Reminders arrive every three days after training until submission.</p><form><label>What did you learn? *<textarea name="learning" maxlength="20000">${escapeHtml(record.summaryLearning || "")}</textarea></label><label>How will you apply it? *<textarea name="application" maxlength="20000">${escapeHtml(record.summaryApplication || "")}</textarea></label><label>Feedback or support needed<textarea name="feedback" maxlength="20000">${escapeHtml(record.summaryFeedback || "")}</textarea></label><label>Your notes and useful materials<textarea name="notes" maxlength="50000">${escapeHtml(record.summaryNotes || "")}</textarea></label><label>Attachments (up to 3 files, 2 MB each; PDF, Word, text, PNG or JPEG)<input type="file" name="files" multiple accept=".pdf,.docx,.txt,.png,.jpg,.jpeg"></label><p>${files.length} saved attachment(s). Saving a draft retains them.</p><script type="application/json" id="saved-files">${JSON.stringify(files).replace(/</g, "\\u003c")}</script><button value="draft">Save draft</button><button value="submit">Submit summary</button></form>`}<p id="message" role="status" tabindex="-1">${req.query.saved === "draft" ? "Draft saved. You can return using the same link." : ""}</p>`));
    }
    catch (e) {
        next(e);
    } });
    router.post("/summary/:token", async (req, res, next) => { try {
        const input = summarySchema.parse(req.body);
        const record = await load(req.params.token);
        if (record.summarySubmittedAt) {
            res.json({ message: "Your summary has already been submitted." });
            return;
        }
        await prisma.$transaction(async (tx) => { const saved = await tx.trainingCompletion.updateMany({ where: { id: record.id, summarySubmittedAt: null, session: { archivedAt: null }, status: { in: ["REQUIRED", "COMPLETED"] } }, data: { summaryLearning: input.learning, summaryApplication: input.application, summaryFeedback: input.feedback, summaryNotes: input.notes, summaryAttachments: input.attachments, ...(input.submit ? { summarySubmittedAt: new Date() } : {}) } }); if (!saved.count)
            throw new AttendanceError(409, "Summary changed. Please reload."); if (input.submit) {
            await tx.trainingEmailJob.updateMany({ where: { sessionId: record.sessionId, employeeId: record.employeeId, kind: { in: ["FOLLOW_UP", "SUMMARY_REMINDER"] }, status: { in: ["PENDING", "FAILED"] } }, data: { status: "CANCELLED" } });
            await tx.trainingEmailJob.upsert({ where: { sessionId_employeeId_kind: { sessionId: record.sessionId, employeeId: record.employeeId, kind: "HOD_SUMMARY" } }, create: { sessionId: record.sessionId, employeeId: record.employeeId, kind: "HOD_SUMMARY", recipient: record.employee.hodEmail || "", dueAt: new Date(), expiresAt: new Date("9999-12-31") }, update: {} });
        } });
        res.json({ message: input.submit ? "Summary submitted. Thank you!" : "Draft saved. You can return using the same link." });
    }
    catch (e) {
        next(e);
    } });
    return router;
}
