import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { AttendanceError, attendanceTokenSchema, checkInSchema, publicAttendanceSession, registerAttendance } from "./attendance.js";
import {publicTrainingPage,portalIcon,portalInfo} from "./public-training-ui.js";

const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[char]!);
const format = (date: Date) => new Intl.DateTimeFormat("en-MY", { timeZone:"Asia/Kuala_Lumpur", dateStyle:"medium", timeStyle:"short" }).format(date);
const shell = (content:string) => publicTrainingPage(content,{title:"Training attendance",section:"Training attendance",script:"/attendance/client.js",variant:"attendance"});

const clientScript = String.raw`const form=document.querySelector('form');
if(form) form.addEventListener('submit',async event=>{
  event.preventDefault(); if(!form.reportValidity()) return;
  const button=form.querySelector('button'), output=document.querySelector('#message');
  button.disabled=true; output.dataset.state='loading'; output.textContent='Saving attendance…';
  try {
    const response=await fetch(form.action,{method:'POST',headers:{'Content-Type':'application/json'},credentials:'omit',body:JSON.stringify({employeeId:form.elements.employeeId.value,name:form.elements.name.value,confirmed:form.elements.confirmed.checked})});
    const data=await response.json(); if(!response.ok) throw new Error(data.message||'Attendance could not be saved.');
    output.textContent=[data.message,data.name,data.training,'Recorded: '+new Intl.DateTimeFormat('en-MY',{timeZone:'Asia/Kuala_Lumpur',dateStyle:'medium',timeStyle:'short'}).format(new Date(data.checkedInAt))].join(String.fromCharCode(10));
    output.dataset.state='success'; form.hidden=true; output.focus();
  } catch(error) { output.dataset.state='error'; output.textContent=error.message||'Connection failed. Please try again.'; button.disabled=false; }
});`;

// One deliberately narrow guest path, separate from the HR application and API.
// No SPA bundles, public roster, email address or third-party script is needed.
export function createAttendancePageRouter() {
  const router = Router();
  const attempts = new Map<string, { count:number; until:number }>();
  router.use((_req,res,next) => { res.set({"Cache-Control":"no-store", "Referrer-Policy":"no-referrer", "X-Robots-Tag":"noindex, nofollow"}); next(); });
  router.get("/client.js", (_req,res) => { res.type("application/javascript").send(clientScript); });
  router.get("/:token", async (req,res,next) => {
    try {
      const {session,opensAt,closesAt} = await publicAttendanceSession(String(req.params.token));
      const early = new Date() < opensAt;
      const when=new Intl.DateTimeFormat("en-MY",{timeZone:"Asia/Kuala_Lumpur",dateStyle:"long"}).format(session.dateStart);
      const heading=`<div class="portal-heading"><span class="eyebrow">Training attendance</span><h1>${escape(session.course.name)}</h1><p class="lead">You’re here to learn. Let’s get your attendance recorded.</p><div class="hero-tags"><span class="status-pill ${early?"waiting":"open"}">${portalIcon(early?"clock":"check")}${early?"Check-in opens soon":"Check-in is open"}</span><span>${portalIcon("calendar")}${escape(when)} · Malaysia time</span></div></div>`;
      const sessionDetails=`<aside class="attendance-session"><section class="portal-card"><div class="session-title"><span class="round-icon">${portalIcon("calendar")}</span><h2>Your session</h2></div><dl>${portalInfo("clock","When · Malaysia time",`${format(session.dateStart)} – ${format(session.dateEnd!)}`)}${portalInfo("pin","Venue",session.venue||"Please ask HR")}${portalInfo("person","Trainer",session.trainerName||"Human Resources")}</dl><p class="attendance-window">Check-in closes ${escape(format(closesAt))}. Only selected participants can register.</p></section><section class="portal-card"><h2>A quick check-in</h2><ol class="journey"><li><div><strong>Enter your details</strong><p>Use the employee ID and full name recorded by HR.</p></div></li><li><div><strong>Confirm it’s you</strong><p>Register only your own attendance.</p></div></li><li><div><strong>You’re all set</strong><p>A confirmation appears here once your attendance is saved.</p></div></li></ol></section></aside>`;
      const form=early?`<section class="waiting-card attendance-form-card"><span class="round-icon">${portalIcon("clock")}</span><h2>We’ll see you soon</h2><p>Check-in opens ${escape(format(opensAt))}, 30 minutes before the training.</p><p>Open this same link again when check-in starts. The email button and attendance QR both bring you here.</p></section>`:`<section class="portal-card attendance-form-card"><div class="form-heading"><span>JUST A QUICK CHECK-IN</span><h2>Your details</h2><p>Enter your employee ID and full name as recorded by HR. No email address is needed.</p></div><form action="/attendance/${escape(String(req.params.token))}/check-in" method="post"><label>Employee ID<input name="employeeId" type="text" required maxlength="100" autocomplete="off" spellcheck="false" placeholder="e.g. 5000928" autocapitalize="characters"><small class="field-hint">Use your company employee number.</small></label><label>Full name<input name="name" type="text" required minlength="2" maxlength="200" autocomplete="name" placeholder="Your full name as recorded by HR"></label><label class="consent"><input type="checkbox" name="confirmed" required><span>I am registering my own attendance for this training.</span></label><button type="submit" class="attendance-submit">Register attendance ${portalIcon("arrow")}</button></form><div id="message" role="status" tabindex="-1" aria-live="polite"></div><p class="attendance-privacy">${portalIcon("shield")}Your details are checked against this training’s participant list.</p><noscript>Please enable JavaScript to register your attendance.</noscript></section>`;
      res.type("html").send(shell(`${heading}<div class="attendance-layout">${sessionDetails}${form}</div>`));
    } catch(error) { if (error instanceof AttendanceError) res.status(error.status).type("html").send(shell(`<section class="portal-card error-card"><span class="round-icon">${portalIcon("shield")}</span><h1>Attendance unavailable</h1><p>${escape(error.message)}</p><p>Contact Human Resources for help with your training attendance.</p></section>`)); else next(error); }
  });
  router.post("/:token/check-in", async (req,res,next) => {
    try {
      if (!attendanceTokenSchema.safeParse(req.params.token).success) throw new AttendanceError(404,"Attendance link is invalid or closed.");
      const key = `${req.ip}:${req.params.token}`;
      const now = Date.now(); const prior = attempts.get(key); const bucket = !prior || prior.until < now ? {count:0,until:now+10*60000} : prior;
      if (++bucket.count > 1000) { res.set("Retry-After",String(Math.max(1,Math.ceil((bucket.until-now)/1000)))); throw new AttendanceError(429,"Too many attempts. Please wait a few minutes or contact HR."); }
      if (attempts.size >= 10000 && !attempts.has(key)) attempts.delete(attempts.keys().next().value!);
      attempts.set(key,bucket);
      res.json(await registerAttendance(String(req.params.token),checkInSchema.parse(req.body)));
    } catch(error) { next(error); }
  });
  router.use((_req,res) => { res.status(404).type("html").send(shell('<section class="portal-card error-card"><h1>Attendance unavailable</h1><p>Please use the attendance link or QR code supplied by HR.</p></section>')); });
  router.use((error: unknown,_req: Request,res: Response,_next: NextFunction) => {
    if(error instanceof AttendanceError) { res.status(error.status).json({message:error.message}); return; }
    if(error instanceof z.ZodError) { res.status(400).json({message:"Enter your employee ID, full name, and confirm that this is your own attendance."}); return; }
    res.status(503).json({message:"Attendance is temporarily unavailable. Please contact HR or try again later."});
  });
  return router;
}
