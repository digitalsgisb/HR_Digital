import { useEffect, useState } from "react";
import { workflowRequest } from "./FleetAccess";
import { api } from "./api";
import type { EmailTestStatus } from "@hr-training/shared";

type Values={subject:string;title:string;body:string;buttonLabel:string;cc:string[];bcc:string[];ccHod:boolean;replyTo:string|null};
type Template=Values&{kind:string;label:string;updatedAt:string|null;defaults:Values};
type Draft=Omit<Values,"cc"|"bcc">&{ccText:string;bccText:string};
type Preview={subject:string;html:string;kind:string};
const draftOf=(template:Values):Draft=>({subject:template.subject,title:template.title,body:template.body,buttonLabel:template.buttonLabel,ccHod:template.ccHod,replyTo:template.replyTo,ccText:template.cc.join(", "),bccText:template.bcc.join(", ")});
const addresses=(value:string)=>[...new Set(value.split(/[,;\s]+/).map(v=>v.trim().toLowerCase()).filter(Boolean))];
const payloadOf=(draft:Draft):Values=>({subject:draft.subject,title:draft.title,body:draft.body,buttonLabel:draft.buttonLabel,ccHod:draft.ccHod,replyTo:draft.replyTo,cc:addresses(draft.ccText),bcc:addresses(draft.bccText)});

export function EmailTemplateEditor({showNotice}:{showNotice:(value:string)=>void}){
 const [templates,setTemplates]=useState<Template[]>([]),[variables,setVariables]=useState<Record<string,string>>({}),[selected,setSelected]=useState("INVITATION"),[drafts,setDrafts]=useState<Record<string,Draft>>({});
 const [preview,setPreview]=useState<Preview>(),[status,setStatus]=useState<EmailTestStatus>(),[recipient,setRecipient]=useState(""),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(""),[message,setMessage]=useState("");
 const load=async()=>{setLoading(true);setError("");try{
   const result=await workflowRequest<{templates:Template[];variables:Record<string,string>}>("/training-email/templates");
   setTemplates(result.templates);setVariables(result.variables);setDrafts(Object.fromEntries(result.templates.map(row=>[row.kind,draftOf(row)])));
 }catch(e){setError(e instanceof Error?e.message:"Could not load email templates.");}finally{setLoading(false);}};
 useEffect(()=>{void load();void api.emailTestStatus().then(value=>{setStatus(value);setRecipient(value.allowedRecipients[0]||"");}).catch(()=>{});},[]);
 const current=templates.find(row=>row.kind===selected),draft=drafts[selected];
 const update=(changes:Partial<Draft>)=>{setDrafts(all=>({...all,[selected]:{...all[selected],...changes}}));setPreview(undefined);setMessage("");};
 const dirty=current&&draft&&JSON.stringify(payloadOf(draft))!==JSON.stringify(payloadOf(draftOf(current)));
 const run=async(action:"save"|"preview"|"test")=>{if(!draft)return;setBusy(true);setError("");setMessage("");try{
   const template=payloadOf(draft);
   if(action==="save"){
     const saved=await workflowRequest<Template>(`/training-email/templates/${selected}`,template,"PUT");
     setTemplates(rows=>rows.map(row=>row.kind===selected?saved:row));setDrafts(all=>({...all,[selected]:draftOf(saved)}));
     setMessage("Saved. Emails that have not been sent will use these settings; sent emails are not resent.");showNotice(`${saved.label} settings saved.`);
   }else if(action==="preview"){
     const rendered=await workflowRequest<{subject:string;html:string}>("/training-email/templates/preview",{kind:selected,template});setPreview({...rendered,kind:selected});
   }else{
     const result=await workflowRequest<{status:string}>("/training-email/templates/test",{kind:selected,template,recipient});
     setMessage(result.status==="captured"?"Test captured in the local test inbox. No external email was sent.":`SMTP accepted the test for ${recipient}. CC and BCC were not used for this test.`);
   }
 }catch(e){setError(e instanceof Error?e.message:"Could not update the email template.");}finally{setBusy(false);}};
 return <section className="card email-template-editor"><header><span className="module-kicker">HR email controls</span><h2>Edit automated emails</h2><p>Choose an email type, edit its wording and recipients, then preview and save. Training details, evaluation answers, attachments and each employee’s form link are added automatically.</p><p>Saved changes apply to emails that have not been sent. Test emails use sample details and go only to the test recipient.</p></header>{loading&&<p role="status">Loading templates…</p>}{!loading&&!templates.length&&<button className="button button-secondary" onClick={()=>void load()}>Reload templates</button>}
 <div className="template-editor-layout"><nav aria-label="Automated email types">{templates.map(row=><button type="button" disabled={busy} key={row.kind} aria-pressed={selected===row.kind} className={selected===row.kind?"selected":""} onClick={()=>{setSelected(row.kind);setPreview(undefined);setMessage("");setError("");}}><strong>{row.label}</strong><small>{row.updatedAt?"Customised":"Default template"}{drafts[row.kind]&&JSON.stringify(payloadOf(drafts[row.kind]))!==JSON.stringify(payloadOf(draftOf(row)))?" · Unsaved":""}</small></button>)}</nav>
 {draft&&current&&<div className="template-editor-fields"><form onSubmit={e=>{e.preventDefault();void run("save");}}><fieldset disabled={busy} className="template-edit-fieldset"><h3>{current.label}</h3><label className="field">Email subject<input required maxLength={250} value={draft.subject} onChange={e=>update({subject:e.target.value})}/></label><label className="field">Email heading<input required maxLength={180} value={draft.title} onChange={e=>update({title:e.target.value})}/></label><label className="field">Message<textarea required maxLength={12000} rows={7} value={draft.body} onChange={e=>update({body:e.target.value})}/></label><label className="field">Button label<input required maxLength={80} value={draft.buttonLabel} onChange={e=>update({buttonLabel:e.target.value})}/><small>The system keeps the correct attendance, evaluation or training-details link.</small></label>
 <details className="template-variables"><summary>Personalise with placeholders</summary><p>Type these into the subject, heading, message or button label. They are replaced for each recipient.</p>{Object.entries(variables).map(([key,label])=><span key={key}><code>{`{{${key}}}`}</code> {label}</span>)}</details>
 <div className="form-grid"><label className="field">CC recipients<textarea rows={3} value={draft.ccText} onChange={e=>update({ccText:e.target.value})} placeholder="hr@company.com, manager@company.com"/></label><label className="field">BCC recipients<textarea rows={3} value={draft.bccText} onChange={e=>update({bccText:e.target.value})} placeholder="archive@company.com"/></label><label className="field span-2">Reply-to address (optional)<input type="email" value={draft.replyTo||""} onChange={e=>update({replyTo:e.target.value})} placeholder="hr@company.com"/></label></div>
 <label className="template-hod-option"><input type="checkbox" checked={draft.ccHod} onChange={e=>update({ccHod:e.target.checked})}/> Also CC the participant’s HOD</label><p className="field-help">Separate addresses with commas, semicolons or new lines; up to 20 per list. CC is visible to recipients; BCC is hidden. Copies receive the full email, including evaluation answers and attachments when present. Duplicate addresses receive one copy. The main participant, HOD or superior recipient is selected automatically.</p>
 {error&&<p className="form-error" role="alert">{error}</p>}{message&&<p role="status">{message}</p>}<div className="template-editor-actions"><button className="button button-primary" disabled={busy}>{busy?"Working…":"Save email settings"}</button><button type="button" className="button button-secondary" disabled={busy} onClick={()=>void run("preview")}>Preview email</button><button type="button" className="button button-secondary" disabled={busy} onClick={()=>{setDrafts(all=>({...all,[selected]:draftOf(current.defaults)}));setPreview(undefined);setMessage("Defaults loaded into the editor. Save to apply them.");}}>Restore defaults</button><small>{dirty?"Unsaved changes":"Saved settings"}</small></div></fieldset></form>
 <section className="template-test"><h4>Test this email</h4><p>Tests use the current editor wording. CC/BCC are excluded. In SMTP mode, choose a permitted test address.</p><label className="field">Test email recipient<input type="email" value={recipient} onChange={e=>setRecipient(e.target.value)} list="hr-template-test-recipients"/></label><datalist id="hr-template-test-recipients">{status?.allowedRecipients.map(address=><option key={address} value={address}/>)}</datalist><button className="button button-secondary" type="button" disabled={busy||!recipient||!status?.ready} onClick={()=>void run("test")}>{status?.mode==="smtp"?"Send test email":"Capture test email"}</button>{status&&!status.ready&&<p>Use the connection controls below to check the email service.</p>}</section>
 {preview?.kind===selected&&<section className="template-preview"><h4>{preview.subject}</h4><p>Sample preview — no message has been sent.</p><iframe title="Edited training email preview" sandbox="" srcDoc={preview.html}/></section>}</div>}</div>{error&&!draft&&<p role="alert">{error}</p>}</section>;
}
