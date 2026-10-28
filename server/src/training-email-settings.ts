import { Router } from "express";
import { z } from "zod";
import { prisma } from "./prisma.js";
import { env } from "./env.js";
import { developerTrainingDetails, previewEmailHtml } from "./email-template.js";
import { emailTestInput, emailTestService } from "./email-test.js";
import { defaultTrainingEmailTemplates, emailVariables, trainingEmailKinds, trainingEmailTemplate, trainingEmailTemplateSchema, renderConfiguredTrainingEmail } from "./training-email-templates.js";

const sampleDetails={...developerTrainingDetails,name:"Sample participant",training:"Sample training course"};
const inputSchema = z.object({kind:z.enum(trainingEmailKinds),template:trainingEmailTemplateSchema});
function sampleEmail(input:z.infer<typeof inputSchema>){
  return renderConfiguredTrainingEmail(trainingEmailTemplate(input.kind,input.template),sampleDetails,env.clientOrigin,true,input.kind==="HOD_SUMMARY"?"Sample completed evaluation\nLearning: Safe working methods\nApplication: Daily safety checks\nNotes: Participant notes and attachments appear in the real email.":"",input.kind==="HOD_SUMMARY"?"Head of Department":input.kind==="SUPERIOR_REVIEW"?"Immediate Superior":sampleDetails.name);
}
export function createTrainingEmailSettingsRouter(){
  const router=Router();
  router.get("/training-email/templates",async(_req,res,next)=>{try{
    const rows=await prisma.trainingEmailTemplate.findMany();
    res.json({variables:emailVariables,templates:defaultTrainingEmailTemplates.map(defaults=>{
      const saved=rows.find(row=>row.kind===defaults.kind);
      return {...trainingEmailTemplate(defaults.kind,saved),updatedAt:saved?.updatedAt||null,defaults};
    })});
  }catch(e){next(e);}});
  router.post("/training-email/templates/preview",(req,res,next)=>{try{
    const content=sampleEmail(inputSchema.parse(req.body));res.json({...content,html:previewEmailHtml(content.html)});
  }catch(e){next(e);}});
  router.post("/training-email/templates/test",async(req,res,next)=>{try{
    const input=inputSchema.extend({recipient:z.string()}).parse(req.body);
    const recipient=emailTestInput.parse({templateId:"email-1",recipient:input.recipient});
    // Test delivery deliberately uses only its explicit, allowlisted test recipient.
    // The saved/draft CC and BCC lists are used by actual scheduled emails only.
    res.json(await emailTestService.send(recipient,sampleEmail(input)));
  }catch(e){next(e);}});
  router.put("/training-email/templates/:kind",async(req,res,next)=>{try{
    const kind=z.enum(trainingEmailKinds).parse(req.params.kind),data=trainingEmailTemplateSchema.parse(req.body);
    if(data.ccEmployeeIds.length){
      const people=await prisma.employee.findMany({where:{id:{in:data.ccEmployeeIds}},select:{id:true,status:true,email:true}});
      if(data.ccEmployeeIds.some(id=>!people.some(person=>person.id===id&&person.status==="ACTIVE"&&z.string().email().safeParse(person.email).success))){res.status(400).json({message:"Choose active employees with a saved email address. Update missing emails in Employees first."});return;}
    }
    const saved=await prisma.trainingEmailTemplate.upsert({where:{kind},create:{kind,...data},update:data});
    res.json({...trainingEmailTemplate(kind,saved),updatedAt:saved.updatedAt,defaults:defaultTrainingEmailTemplates.find(row=>row.kind===kind)});
  }catch(e){next(e);}});
  return router;
}
