export type EvaluationProgress={dateEnd:string|null;attendance:string;employeeStatus?:string;submittedAt:string|null;learning?:string|null;notes?:string|null;evaluation?:Record<string,string>|null;review?:Record<string,string>|null;reviewDueAt:string|null;reviewSubmittedAt:string|null};
export function participantStage(row:EvaluationProgress,now=Date.now()){
 if(row.submittedAt)return "Submitted";
 if(row.employeeStatus&&row.employeeStatus!=="ACTIVE")return "Employee inactive";
 if(!["REQUIRED","COMPLETED"].includes(row.attendance))return "Not required";
 if(!row.dateEnd)return "Training end date needed";
 if(new Date(row.dateEnd).getTime()>now)return "Not open yet";
 if(row.learning||row.notes||Object.values(row.evaluation||{}).some(value=>value.trim()))return "Draft";
 return "Outstanding";
}
export function reviewStage(row:EvaluationProgress,now=Date.now()){
 if(row.reviewSubmittedAt)return "Submitted to HR";
 if(row.employeeStatus&&row.employeeStatus!=="ACTIVE")return "Employee inactive";
 if(!["REQUIRED","COMPLETED"].includes(row.attendance))return "Not required";
 if(!row.submittedAt)return "Waiting for participant";
 if(!row.reviewDueAt)return "Training end date needed";
 if(new Date(row.reviewDueAt).getTime()>now)return "Scheduled";
 return Object.values(row.review||{}).some(value=>value.trim())?"Draft":"Outstanding";
}
