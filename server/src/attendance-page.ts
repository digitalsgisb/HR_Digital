import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { AttendanceError, attendanceTokenSchema, checkInSchema, publicAttendanceSession, registerAttendance } from "./attendance.js";
import { emailLogo } from "./email-template.js";

const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[char]!);
const format = (date: Date) => new Intl.DateTimeFormat("en-MY", { timeZone:"Asia/Kuala_Lumpur", dateStyle:"medium", timeStyle:"short" }).format(date);
const shell = (content: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Training attendance · HR Digital</title><style>*{box-sizing:border-box}body{margin:0;background:#fff;color:#000;font:16px Arial,sans-serif;line-height:1.55}main{max-width:540px;margin:24px auto;padding:0 16px}header{background:#000;color:#fff;padding:24px;border-radius:16px 16px 0 0}header img{display:block;width:280px;max-width:100%;height:auto}header p{font-size:12px;letter-spacing:2px;margin:16px 0 0}section{padding:24px;border:1px solid #000;border-radius:0 0 16px 16px}h1{font-size:26px;line-height:1.25;margin:0 0 20px}dl{margin:0 0 24px}dt{font-size:12px;margin-top:12px}dd{margin:2px 0 0;font-weight:bold;overflow-wrap:anywhere}label{display:block;font-weight:bold;margin:20px 0 8px}input[type=text]{display:block;width:100%;font:inherit;padding:14px;border:1px solid #000;border-radius:8px;margin-top:8px}input[type=checkbox]{width:20px;height:20px;flex-shrink:0;accent-color:#000}.consent{display:flex;gap:10px;align-items:start;font-size:14px;font-weight:normal}button{width:100%;padding:16px;font:700 16px Arial;background:#000;color:#fff;border:1px solid #000;border-radius:8px;margin:20px 0 0}button:disabled{opacity:.5}small{font-size:13px}#message{white-space:pre-line;overflow-wrap:anywhere}#message:not(:empty){border:1px solid #000;padding:16px;margin-top:20px}footer{text-align:center;font-size:12px;margin:20px 0}noscript{display:block;padding:16px;border:1px solid #000}</style></head><body><main><header><img src="data:image/png;base64,${emailLogo.toString("base64")}" alt="Sugihara Grand Industries"><p>HR DIGITAL / TRAINING ATTENDANCE</p></header><section>${content}</section><footer>Sugihara Grand Industries Sdn. Bhd.</footer></main><script src="/attendance/client.js" defer></script></body></html>`;

const clientScript = String.raw`const form=document.querySelector('form');
if(form) form.addEventListener('submit',async event=>{
  event.preventDefault(); if(!form.reportValidity()) return;
  const button=form.querySelector('button'), output=document.querySelector('#message');
  button.disabled=true; output.textContent='Saving attendance…';
  try {
    const response=await fetch(form.action,{method:'POST',headers:{'Content-Type':'application/json'},credentials:'omit',body:JSON.stringify({employeeId:form.elements.employeeId.value,name:form.elements.name.value,confirmed:form.elements.confirmed.checked})});
    const data=await response.json(); if(!response.ok) throw new Error(data.message||'Attendance could not be saved.');
    output.textContent=[data.message,data.name,data.training,'Recorded: '+new Intl.DateTimeFormat('en-MY',{timeZone:'Asia/Kuala_Lumpur',dateStyle:'medium',timeStyle:'short'}).format(new Date(data.checkedInAt))].join(String.fromCharCode(10));
    form.hidden=true; output.focus();
  } catch(error) { output.textContent=error.message||'Connection failed. Please try again.'; button.disabled=false; }
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
      res.type("html").send(shell(`<h1>${escape(session.course.name)}</h1><dl><dt>When · Malaysia time</dt><dd>${escape(format(session.dateStart))} – ${escape(format(session.dateEnd!))}</dd><dt>Venue</dt><dd>${escape(session.venue || "Please ask HR")}</dd><dt>Trainer</dt><dd>${escape(session.trainerName || "Human Resources")}</dd></dl>${early ? `<p>Check-in opens ${escape(format(opensAt))}. Please scan this QR again then.</p>` : `<p>Register your own attendance using your employee ID and full name as recorded by HR. No email address is needed.</p><form action="/attendance/${escape(String(req.params.token))}/check-in" method="post"><label>Employee ID<input name="employeeId" type="text" required maxlength="100" autocomplete="off" spellcheck="false" placeholder="Your employee ID"></label><label>Full name<input name="name" type="text" required minlength="2" maxlength="200" autocomplete="name" placeholder="Your name as recorded by HR"></label><label class="consent"><input type="checkbox" name="confirmed" required><span>I am registering my own attendance for this training.</span></label><button type="submit">Register attendance</button></form><div id="message" role="status" tabindex="-1" aria-live="polite"></div><noscript>Please enable JavaScript to register your attendance.</noscript>`}<p><small>Check-in closes ${escape(format(closesAt))}. Only selected participants can register. Contact HR if your details do not match.</small></p>`));
    } catch(error) { if (error instanceof AttendanceError) res.status(error.status).type("html").send(shell(`<h1>Attendance unavailable</h1><p>${escape(error.message)}</p>`)); else next(error); }
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
  router.use((_req,res) => { res.status(404).type("html").send(shell("<h1>Attendance unavailable</h1><p>Please scan the QR code supplied by HR.</p>")); });
  router.use((error: unknown,_req: Request,res: Response,_next: NextFunction) => {
    if(error instanceof AttendanceError) { res.status(error.status).json({message:error.message}); return; }
    if(error instanceof z.ZodError) { res.status(400).json({message:"Enter your employee ID, full name, and confirm that this is your own attendance."}); return; }
    res.status(503).json({message:"Attendance is temporarily unavailable. Please contact HR or try again later."});
  });
  return router;
}
