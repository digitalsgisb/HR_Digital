import { z } from "zod";

// FR-HR-002, revision 2, effective 15 September 2024.
export type EvaluationField = { key: string; label: string; options?: string[]; multiple?: boolean };
export const participantFields: EvaluationField[] = [
  { key: "company", label: "Company", options: ["Machinery & Industrial Supplies Sdn Bhd", "Sanyco Grand Industries Sdn Bhd", "Grand Carpet Industries Sdn Bhd", "Sugihara Grand Industries Sdn Bhd", "PT Grand Surya Techno"] },
  { key: "superior", label: "Immediate superior" }, { key: "vendor", label: "Training vendor" },
  { key: "briefing", label: "1. Did your immediate superior conduct a pre-course briefing?", options: ["Yes", "No"] },
  { key: "briefingFeeling", label: "If yes, how did you feel about the briefing?" },
  { key: "relevance", label: "2. Was the course relevant to your job? (1 = Not relevant; 4 = Very relevant)", options: ["1", "2", "3", "4"] },
  { key: "opportunity", label: "4. Do you have opportunities to apply the newly learnt skills in your job?", options: ["Yes", "No"] },
  { key: "opportunityReason", label: "If no, why?" },
  { key: "confidence", label: "6. How confident are you in applying these skills? (1 = Not confident at all; 4 = Very confident)", options: ["1", "2", "3", "4"] },
  { key: "confidenceReason", label: "If not confident, why?" },
  { key: "assistance", label: "7. What assistance do you require from your immediate superior?" },
];
export const reviewerFields: EvaluationField[] = [
  { key: "demonstrated", label: "B.I.1. Has the employee demonstrated successful application of the skills?", options: ["Yes", "No"] },
  { key: "applicationExamples", label: "Specific situations / examples" },
  { key: "applied", label: "B.I.2. How effectively were the outcomes applied? (1 = Not effective; 4 = Exceptionally effective)", options: ["1", "2", "3", "4"] },
  { key: "impact", label: "B.II.1. Impact on overall job performance (1 = No impact; 4 = Exceptional impact)", options: ["1", "2", "3", "4"] },
  { key: "improvements", label: "B.II.2. Areas of improvement (select all that apply)", multiple:true, options:["Quality of work","Productivity","Problem-solving abilities","Communication skills","Team collaboration","Other","No improvements observed"] },
  { key: "improvementOther", label: "Other improvement — please specify" },
  { key: "effectiveness", label: "B.III.1. Effectiveness in addressing the employee's needs and challenges (1 = Not effective; 4 = Extremely effective)", options: ["1", "2", "3", "4"] },
  { key: "objectives", label: "B.III.2. Were the objectives clear and achieved? (1 = Not clear / achieved; 4 = Extremely clear and achieved)", options: ["1", "2", "3", "4"] },
  { key: "improvement", label: "B.III.3. Overall skill improvement (1 = No improvement; 4 = Significant improvement)", options: ["1", "2", "3", "4"] },
  { key: "reviewer", label: "B. Completed by — name / typed acknowledgement" }, { key: "reviewDate", label: "B. Review date (YYYY-MM-DD)" },
  { key: "discussionDate", label: "C. Feedback discussion date (YYYY-MM-DD)" }, { key: "conductedBy", label: "C. Discussion conducted by" },
  { key: "employeeAcknowledgement", label: "C. Employee acknowledgement — recorded name" },
  { key: "hodAcknowledgement", label: "C. Reviewed by HOD — recorded name" }, { key: "hodDate", label: "C. HOD review date (YYYY-MM-DD)" },
  { key: "skillsUpdatedBy", label: "D. Skills map updated by" }, { key: "skillsUpdatedDate", label: "D. Skills map update date (YYYY-MM-DD)" },
];
const fieldsSchema = (fields: EvaluationField[]) => z.object(Object.fromEntries(fields.map(f => [f.key, f.options && !f.multiple ? z.union([z.enum(f.options as [string, ...string[]]), z.literal("")]).default("") : z.string().trim().max(20000).default("")])));
export const evaluationSchema = fieldsSchema(participantFields);
export const reviewSchema = fieldsSchema(reviewerFields);
export function missingFields(data: Record<string, string>, review = false) {
  const required = review ? reviewerFields.filter(f => !["applicationExamples","improvementOther"].includes(f.key)).map(f => f.key) : ["company", "superior", "vendor", "briefing", "relevance", "opportunity", "confidence", "assistance"];
  if(review && data.improvements?.split(" | ").includes("Other")) required.push("improvementOther");
  if (!review && data.briefing === "Yes") required.push("briefingFeeling");
  if (!review && data.opportunity === "No") required.push("opportunityReason");
  if (!review && data.confidence === "1") required.push("confidenceReason");
  return required.filter(key => !data[key]);
}
export function reviewDueDate(end: Date) {
  // Calendar months in Malaysia time, clamped to the destination month's last day.
  const local = new Date(end.getTime() + 8 * 3600000), day = local.getUTCDate();
  local.setUTCDate(1); local.setUTCMonth(local.getUTCMonth() + 3);
  const last = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + 1, 0)).getUTCDate();
  local.setUTCDate(Math.min(day, last)); return new Date(local.getTime() - 8 * 3600000);
}
export function resolvedHod(person: { hodEmail?: string | null; department?: { hodEmail?: string | null } | null }) {
  return person.hodEmail?.trim() || person.department?.hodEmail?.trim() || "";
}
