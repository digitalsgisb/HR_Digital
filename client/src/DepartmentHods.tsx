import { useEffect, useState } from "react";
import { workflowRequest } from "./FleetAccess";
import { api } from "./api";
import type { Department, Employee } from "./types";

export function departmentHodLabel(department:Department){
 const person=department.hodEmployee;
 if(department.hodEmployeeId) return person ? `${person.name||person.employeeId}${person.status!=="ACTIVE"?" (inactive — reassign HOD)":""}` : "Assigned employee unavailable";
 return department.hodName||department.hodEmail||"Not assigned";
}
export function DepartmentHodAssignment({department,employees,onSaved,onBusyChange}:{department:Department;employees:Employee[];onSaved:(row:Department)=>Promise<void>|void;onBusyChange?:(value:boolean)=>void}){
 const [selected,setSelected]=useState(department.hodEmployeeId||""),[query,setQuery]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const person=employees.find(row=>row.id===selected)|| (department.hodEmployee?.id===selected?department.hodEmployee:undefined);
 const choices=employees.filter(row=>row.status==="ACTIVE"||row.id===selected).filter(row=>row.id===selected||`${row.name||""} ${row.employeeId} ${row.department.name} ${row.email||""}`.toLowerCase().includes(query.toLowerCase())).sort((a,b)=>(a.name||a.employeeId).localeCompare(b.name||b.employeeId));
 return <form className="department-hod-form" onSubmit={async e=>{e.preventDefault();setBusy(true);onBusyChange?.(true);setError("");try{const row=await workflowRequest<Department>(`/departments/${department.id}/hod`,{hodEmployeeId:selected||null},"PUT");await onSaved(row);}catch(cause){setError(cause instanceof Error?cause.message:"Could not assign the HOD.");}finally{setBusy(false);onBusyChange?.(false);}}}>
 <p>Choose an employee from any department. The same person can be HOD for several departments. Their name and email come from their employee profile.</p>
 <fieldset disabled={busy}><label className="field">Find an employee<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search name, employee ID or department"/></label>
 <label className="field">Head of department<select value={selected} onChange={e=>setSelected(e.target.value)}><option value="">No HOD assigned</option>{selected&&!choices.some(row=>row.id===selected)&&<option value={selected}>{departmentHodLabel(department)}</option>}{choices.map(row=><option key={row.id} value={row.id}>{row.name||row.employeeId} · {row.employeeId} · {row.department.name}{!row.email?" · No email recorded":""}{row.status!=="ACTIVE"?" · Inactive":""}</option>)}</select></label>
 {query&&!choices.length&&<p role="status">No matching employees. Search another name or employee ID.</p>}
 {person&&<div className="hod-contact-preview"><strong>{person.name||person.employeeId}</strong><span>{person.email||"No email recorded — update this employee’s profile to enable HOD emails."}</span>{person.status!=="ACTIVE"&&<span className="form-error">This employee is inactive. Choose an active employee.</span>}</div>}
 {!department.hodEmployeeId&&(department.hodEmail||department.hodName)&&<p className="field-help">Existing manual HOD contact: {department.hodName} {department.hodEmail}. Saving replaces this with the chosen employee, or clears it if no HOD is selected.</p>}
 <p className="field-help">Employee-specific HOD email overrides still take priority. Leave an employee’s override blank to follow this department’s HOD.</p>
 {error&&<p className="form-error" role="alert">{error}</p>}<button className="button button-primary" disabled={busy||!!person&&person.status!=="ACTIVE"}>{busy?"Saving…":"Save HOD assignment"}</button></fieldset></form>;
}
export function DepartmentHods(){
 const [rows,setRows]=useState<Department[]>([]),[employees,setEmployees]=useState<Employee[]>([]),[error,setError]=useState(""),[message,setMessage]=useState(""),[loading,setLoading]=useState(true);
 const load=async()=>{setLoading(true);setError("");try{const [departments,people]=await Promise.all([workflowRequest<Department[]>("/departments"),api.getEmployees()]);setRows(departments);setEmployees(people);}catch(e){setError(e instanceof Error?e.message:"Could not load departments.");}finally{setLoading(false);}};
 useEffect(()=>{void load();},[]);
 return <section className="page-stack"><div className="module-intro"><div><span className="module-kicker">People & training</span><h2>Department HODs</h2><p>Assign HODs from the employee directory. You can also do this directly from each department card under Employees. One employee can lead multiple departments.</p></div></div>{loading&&<p role="status">Loading departments…</p>}{error&&<p className="form-error" role="alert">{error}<button onClick={()=>void load()}>Retry</button></p>}{message&&<p role="status">{message}</p>}{!loading&&!error&&!rows.length&&<p>No departments yet. Add or import employees first.</p>}{rows.map(row=><section key={`${row.id}-${row.hodEmployeeId||"none"}`} className="card fleet-form"><h3>{row.name}</h3><p>Current HOD: <strong>{departmentHodLabel(row)}</strong></p><DepartmentHodAssignment department={row} employees={employees} onSaved={saved=>{setRows(all=>all.map(item=>item.id===saved.id?saved:item));setMessage(`${saved.name} HOD updated.`);}}/></section>)}</section>;
}
