import { participantFields, reviewerFields, evaluationSchema, reviewSchema, missingFields, reviewDueDate, resolvedHod, type EvaluationField } from "./training-evaluation.js";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "./prisma.js";
import { attendanceUrl, AttendanceError } from "./attendance.js";
export const escapeHtml = (v: string) => v.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
export const attachmentSchema = z.object({ name: z.string().trim().min(1).max(180), data: z.string().max(2800000).regex(/^data:(application\/pdf|image\/png|image\/jpeg|text\/plain|application\/vnd.openxmlformats-officedocument.wordprocessingml.document);base64,[A-Za-z0-9+/=]+$/) });
export const summarySchema = z.object({ learning: z.string().trim().max(20000).default(""), application: z.string().trim().max(20000).default(""), feedback: z.string().trim().max(20000).default(""), notes: z.string().max(50000).default(""), attachments: z.array(attachmentSchema).max(3).default([]), evaluation: evaluationSchema.optional(), submit: z.boolean().default(false) }).superRefine((v, ctx) => { if (v.submit && (!v.learning || !v.application))
    ctx.addIssue({ code: "custom", message: "Please describe what you learned and how you will apply it." }); if(v.submit && (!v.evaluation || missingFields(v.evaluation).length)) ctx.addIssue({code:"custom",message:"Please complete all Section A questions, including applicable explanations."}); });
export const trainingPortalUrl = (path: string) => new URL(path, attendanceUrl("placeholder")).toString();
export function createTrainingReviewRouter() { const router = Router();
router.put("/training-summaries/:id/comments",async(req,res,next)=>{try{const input=z.object({hrComments:z.string().max(20000)}).parse(req.body);await prisma.trainingCompletion.update({where:{id:String(req.params.id)},data:input});res.json({message:"HR comments saved."});}catch(e){next(e);}});
 router.get("/training-summaries", async (_req, res, next) => { try {
    const records = await prisma.trainingCompletion.findMany({ where: { session: { archivedAt: null } }, include: { employee: {include:{department:true}}, session: { include: { course: true, emailJobs: { where: { kind: "HOD_SUMMARY" }, select: { employeeId: true, status: true, lastError: true } } } } }, orderBy: { session: { dateStart: "desc" } } });
    res.json(records.map(r => ({ id: r.id, employeeId: r.employee.employeeId, name: r.employee.name || r.employee.employeeId, hodEmail: resolvedHod(r.employee), evaluation: r.evaluation, evaluationLabels:Object.fromEntries(participantFields.map(f=>[f.key,f.label])), reviewLabels:Object.fromEntries(reviewerFields.map(f=>[f.key,f.label])), review: r.review, reviewSubmittedAt:r.reviewSubmittedAt, reviewDueAt:r.session.dateEnd?reviewDueDate(r.session.dateEnd):null, hrComments:r.hrComments, training: r.session.course.name, dateEnd: r.session.dateEnd, attendance: r.status, submittedAt: r.summarySubmittedAt, learning: r.summaryLearning, application: r.summaryApplication, feedback: r.summaryFeedback, notes: r.summaryNotes, attachments: r.summaryAttachments || [], delivery: r.session.emailJobs.find(j => j.employeeId === r.employeeId) || null, url: trainingPortalUrl(`/training/summary/${r.summaryToken}`) })));
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
    router.get("/portal.css", (_q, r) => r.type("css").send(`*{box-sizing:border-box}body{font:16px/1.6 Arial;background:#f4f4f4;margin:0;color:#171717}main{max-width:700px;margin:24px auto;padding:12px}header{background:#111;color:white;padding:24px;border-radius:12px 12px 0 0}section{padding:24px;background:white}h1{line-height:1.25}dt{font-size:13px;color:#555;margin-top:12px}dd{margin:0;font-weight:bold}label{display:block;margin:20px 0}textarea{display:block;width:100%;min-height:130px;padding:12px;font:inherit}button,a.button{display:inline-block;background:#111;color:white;padding:14px 20px;border:0;border-radius:6px;margin:8px 8px 8px 0;font:inherit;cursor:pointer}button:disabled{opacity:.5}.notes{white-space:pre-wrap;overflow-wrap:anywhere}#message{white-space:pre-wrap}input,select{max-width:100%;font:inherit}input:not([type=checkbox]):not([type=file]){display:block;width:100%;padding:12px}.check{margin:8px 0}fieldset{border:1px solid #ddd;padding:16px}select{display:block;width:100%;padding:12px}textarea{min-height:90px}`));
    router.get("/portal.js", (_q, r) => r.type("js").send(`const form=document.querySelector('form');if(form) form.addEventListener('submit',async event=>{event.preventDefault();const output=document.querySelector('#message');const buttons=[...form.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);try{const formData=new FormData(form);const data=Object.fromEntries(formData);const attachments=JSON.parse(document.querySelector('#saved-files')?.textContent||'[]');const files=[...(form.querySelector('[type=file]')?.files||[])];if(attachments.length+files.length>3)throw Error('Attach up to three files.');for(const file of files){if(file.size>2000000)throw Error('Each attachment must be 2 MB or smaller.');const value=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file);});attachments.push({name:file.name,data:value});}delete data.files;data.attachments=attachments;const evaluation={};for(const key of Object.keys(data))if(key.startsWith("eval_")){evaluation[key.slice(5)]=key==="eval_improvements"?formData.getAll(key).join(" | "):data[key];delete data[key];}data.evaluation=evaluation;data.submit=event.submitter.value==='submit';const response=await fetch(location.pathname,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const result=await response.json();if(!response.ok)throw Error(result.message||'Could not save.');output.textContent=result.message;location.href=location.pathname+(data.submit?'':'?saved=draft');}catch(e){output.textContent=e.message||'Could not save. Please retry.';}finally{buttons.forEach(b=>b.disabled=false);}});`));
    router.get("/details/:token", async (req, res, next) => { try {
        const session = await prisma.trainingSession.findFirst({ where: { detailsToken: token(req.params.token), archivedAt: null }, include: { course: true } });
        if (!session)
            throw new AttendanceError(404, "Training was not found. Contact HR.");
        res.type("html").send(shell(details(session)));
    }
    catch (e) {
        next(e);
    } });
    const load = async (value: unknown) => { const record = await prisma.trainingCompletion.findUnique({ where: { summaryToken: token(value) }, include: { employee: {include:{department:true}}, session: { include: { course: true } } } }); if (!record || record.session.archivedAt || !["REQUIRED", "COMPLETED"].includes(record.status) || record.employee.status !== "ACTIVE")
        throw new AttendanceError(404, "This training summary is unavailable. Contact HR."); if (!record.session.dateEnd || record.session.dateEnd > new Date())
        throw new AttendanceError(409, "The summary opens after training ends."); return record; };
    router.get("/summary/:token", async (req, res, next) => { try {
        const record = await load(req.params.token);
        const files = Array.isArray(record.summaryAttachments) ? record.summaryAttachments : [];
        res.set("Cache-Control", "no-store").type("html").send(shell(`${details(record.session)}<p>Participant: <strong>${escapeHtml(record.employee.name || record.employee.employeeId)}</strong></p>${record.summarySubmittedAt ? "<h2>Summary submitted</h2><p>Thank you. Your completed summary is available to HR and queued for delivery to your HOD.</p>" : `<h2>Training Evaluation Questionnaire — Section A</h2><p>FR-HR-002 · Revision 2 · Effective 15-09-2024</p><p>Complete and return to HR within one week of training completion (due ${escapeHtml(new Date(record.session.dateEnd!.getTime()+7*86400000).toLocaleDateString("en-MY",{timeZone:"Asia/Kuala_Lumpur"}))}). Reminders continue every three days until submission. Save a draft as you work.</p><p>Employee no.: ${escapeHtml(record.employee.employeeId)} · Department: ${escapeHtml(record.employee.department?.name||"")} · HOD: ${escapeHtml(record.employee.hodName||record.employee.department?.hodName||resolvedHod(record.employee)||"Not assigned — contact HR")}</p><form>${renderParticipantFields(record.evaluation || {company:record.employee.company||"",superior:record.employee.superiorName||""},record.summaryLearning,record.summaryApplication)}<label>Feedback or support needed<textarea name="feedback" maxlength="20000">${escapeHtml(record.summaryFeedback || "")}</textarea></label><label>Your notes and useful materials<textarea name="notes" maxlength="50000">${escapeHtml(record.summaryNotes || "")}</textarea></label><label>Attachments (up to 3 files, 2 MB each; PDF, Word, text, PNG or JPEG)<input type="file" name="files" multiple accept=".pdf,.docx,.txt,.png,.jpg,.jpeg"></label><p>${files.length} saved attachment(s). Saving a draft retains them.</p><script type="application/json" id="saved-files">${JSON.stringify(files).replace(/</g, "\\u003c")}</script><button value="draft">Save draft</button><button value="submit">Submit evaluation</button></form>`}<p id="message" role="status" tabindex="-1">${req.query.saved === "draft" ? "Draft saved. You can return using the same link." : ""}</p>`));
    }
    catch (e) {
        next(e);
    } });
    router.post("/summary/:token", async (req, res, next) => { try {
        const record = await load(req.params.token);
        if (record.summarySubmittedAt) {
            res.json({ message: "Your summary has already been submitted." });
            return;
        }
        const input = summarySchema.parse(req.body);
        await prisma.$transaction(async (tx) => { const saved = await tx.trainingCompletion.updateMany({ where: { id: record.id, summarySubmittedAt: null, session: { archivedAt: null }, status: { in: ["REQUIRED", "COMPLETED"] } }, data: { summaryLearning: input.learning, summaryApplication: input.application, summaryFeedback: input.feedback, summaryNotes: input.notes, summaryAttachments: input.attachments, ...(input.evaluation?{evaluation: input.evaluation}:{}), ...(input.submit ? { summarySubmittedAt: new Date() } : {}) } }); if (!saved.count)
            throw new AttendanceError(409, "Summary changed. Please reload."); if (input.submit) {
            await tx.trainingEmailJob.updateMany({ where: { sessionId: record.sessionId, employeeId: record.employeeId, kind: { in: ["FOLLOW_UP", "SUMMARY_REMINDER"] }, status: { in: ["PENDING", "FAILED"] } }, data: { status: "CANCELLED" } });
            await tx.trainingEmailJob.upsert({where:{sessionId_employeeId_kind:{sessionId:record.sessionId,employeeId:record.employeeId,kind:"SUPERIOR_REVIEW"}},create:{sessionId:record.sessionId,employeeId:record.employeeId,kind:"SUPERIOR_REVIEW",recipient:record.employee.superiorEmail||resolvedHod(record.employee),dueAt:reviewDueDate(record.session.dateEnd!),expiresAt:new Date("9999-12-31")},update:{}});
            await tx.trainingEmailJob.upsert({ where: { sessionId_employeeId_kind: { sessionId: record.sessionId, employeeId: record.employeeId, kind: "HOD_SUMMARY" } }, create: { sessionId: record.sessionId, employeeId: record.employeeId, kind: "HOD_SUMMARY", recipient: resolvedHod(record.employee), dueAt: new Date(), expiresAt: new Date("9999-12-31") }, update: {} });
        } });
        res.json({ message: input.submit ? "Summary submitted. Thank you!" : "Draft saved. You can return using the same link." });
    }
    catch (e) {
        next(e);
    } });
    router.get("/review/:token", async (req,res,next)=>{try {
      const record=await loadReview(req.params.token);
      const due=reviewDueDate(record.session.dateEnd!);
      res.set("Cache-Control","no-store").type("html").send(shell(`${details(record.session)}<h2>Training Evaluation — Sections B, C &amp; D</h2><p>FR-HR-002 · Revision 2. Immediate-superior review due ${escapeHtml(due.toLocaleDateString("en-MY",{timeZone:"Asia/Kuala_Lumpur"}))} (three months after training). Complete C after the feedback session and D after updating the skills map. Names record acknowledgements; they are not verified digital signatures.</p><p>Participant: ${escapeHtml(record.employee.name||record.employee.employeeId)}</p><h3>Participant evaluation</h3>${renderAnswers(participantFields,record.evaluation)}<p class="notes">Learning: ${escapeHtml(record.summaryLearning||"")}
Application: ${escapeHtml(record.summaryApplication||"")}
Notes: ${escapeHtml(record.summaryNotes||"")}</p>${record.reviewSubmittedAt?"<h3>Review submitted to HR</h3>" : !record.summarySubmittedAt?"<p>The participant must submit Section A first.</p>":new Date()<due?"<p>The review opens three months after training.</p>":`<form>${renderFields(reviewerFields,record.review)}<p>Save a draft between stages. Submit after the review, feedback and skills-map update are complete.</p><button value="draft">Save draft</button><button value="submit">Submit review to HR</button></form>`}<p id="message" role="status">${req.query.saved==="draft"?"Draft saved.":""}</p>`));
    }catch(e){next(e);}});
    router.post("/review/:token", async(req,res,next)=>{try{
      const input=z.object({evaluation:reviewSchema,submit:z.boolean().default(false)}).parse(req.body);
      const record=await loadReview(req.params.token);
      if(record.reviewSubmittedAt){res.json({message:"Review already submitted."});return;}
      if(!record.summarySubmittedAt || new Date()<reviewDueDate(record.session.dateEnd!)) throw new AttendanceError(409,"Review opens three months after training, after Section A is submitted.");
      if(input.submit && missingFields(input.evaluation,true).length) throw new AttendanceError(400,"Complete all review, feedback and skills-map fields before submission.");
      const areas=input.evaluation.improvements.split(" | ").filter(Boolean);
      const allowed=reviewerFields.find(f=>f.key==="improvements")!.options!;
      if(areas.some(area=>!allowed.includes(area)) || (areas.includes("No improvements observed")&&areas.length>1)) throw new AttendanceError(400,"Select valid improvement areas, or select no improvements on its own.");
      for(const [key,value] of Object.entries(input.evaluation)) if(key.endsWith("Date")&&value&&(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value||value>new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Kuala_Lumpur",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date()))) throw new AttendanceError(400,"Enter a valid review date that is not in the future.");
      if(input.submit){const a=input.evaluation;const earliest=reviewDueDate(record.session.dateEnd!).toLocaleDateString("en-CA",{timeZone:"Asia/Kuala_Lumpur"});if(a.reviewDate<earliest||a.discussionDate<a.reviewDate||a.hodDate<a.discussionDate||a.skillsUpdatedDate<a.reviewDate)throw new AttendanceError(400,"Review dates must follow the three-month due date; feedback and HOD review must follow the review in order.");}
      const result=await prisma.trainingCompletion.updateMany({where:{id:record.id,reviewSubmittedAt:null,session:{archivedAt:null}},data:{review:input.evaluation,...(input.submit?{reviewSubmittedAt:new Date()}:{})}});
      if(!result.count) throw new AttendanceError(409,"Review changed. Reload the page.");
      res.json({message:input.submit?"Review submitted to HR.":"Draft saved."});
    }catch(e){next(e);}});
    return router;
}
async function loadReview(value:unknown){
 const record=await prisma.trainingCompletion.findUnique({where:{reviewToken:token(value)},include:{employee:true,session:{include:{course:true}}}});
 if(!record||record.session.archivedAt||!record.session.dateEnd||!["REQUIRED","COMPLETED"].includes(record.status)||record.employee.status!=="ACTIVE") throw new AttendanceError(404,"This review is unavailable. Contact HR.");
 return record;
}
function renderFields(fields:EvaluationField[],value:unknown){
 const data=(value||{}) as Record<string,string>;
 return fields.map(f=>{
  const name=`eval_${f.key}`, saved=data[f.key]||"", label=escapeHtml(f.label);
  if(f.multiple)return `<fieldset><legend>${label}</legend>${f.options!.map(o=>`<label class="check"><input type="checkbox" name="${name}" value="${escapeHtml(o)}"${saved.split(" | ").includes(o)?" checked":""}> ${escapeHtml(o)}</label>`).join("")}</fieldset>`;
  const control=f.options?`<select name="${name}"><option value="">Select an answer</option>${f.options.map(o=>`<option${saved===o?' selected':''}>${escapeHtml(o)}</option>`).join("")}</select>`:f.key.endsWith("Date")?`<input type="date" name="${name}" value="${escapeHtml(saved)}">`:["superior","vendor","reviewer","conductedBy","employeeAcknowledgement","hodAcknowledgement","skillsUpdatedBy"].includes(f.key)?`<input name="${name}" maxlength="20000" value="${escapeHtml(saved)}">`:`<textarea name="${name}" maxlength="20000">${escapeHtml(saved)}</textarea>`;
  return `<label>${label}${control}</label>`;
 }).join("");
}
export function renderAnswers(fields:EvaluationField[],value:unknown){const data=(value||{}) as Record<string,string>;return fields.map(f=>`<p><strong>${escapeHtml(f.label)}</strong><br>${escapeHtml(data[f.key]||"Not entered")}</p>`).join("");}

function renderParticipantFields(value:unknown, learning:string|null, application:string|null){
 return renderFields(participantFields.slice(0,6),value)+`<label>3. What skills / knowledge did you learn? *<textarea name="learning" maxlength="20000">${escapeHtml(learning||"")}</textarea></label>`+renderFields(participantFields.slice(6,8),value)+`<label>5. In which areas of your job will you apply the skills? *<textarea name="application" maxlength="20000">${escapeHtml(application||"")}</textarea></label>`+renderFields(participantFields.slice(8),value);
}
