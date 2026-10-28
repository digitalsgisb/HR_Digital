import { useEffect, useState } from "react";
import type { Vehicle } from "@hr-training/shared";
import { workflowRequest } from "./FleetAccess";
type FileAttachment = {
    name: string;
    data: string;
};
type Maintenance = {
    id: string;
    type: string;
    servicedAt: string;
    odometer: number;
    workshop: string;
    workCompleted: string;
    cost: string;
    attachment?: FileAttachment;
    nextServiceAt?: number;
    nextServiceDate?: string;
};
export async function readAttachment(file: File): Promise<FileAttachment> { if (file.size > 2000000)
    throw Error("The file must be 2 MB or smaller."); return { name: file.name, data: await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(Error("Could not read this file.")); reader.readAsDataURL(file); }) }; }
export function MaintenancePanel({ vehicles, onChanged, initialVehicleId = "" }: {
    initialVehicleId?: string;
    vehicles: Vehicle[];
    onChanged: () => Promise<void>;
}) {
    const [id, setId] = useState(initialVehicleId);
    const [rows, setRows] = useState<Maintenance[]>([]);
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState("");
    const load = async () => { if (id)
        setRows(await workflowRequest<Maintenance[]>(`/vehicles/${id}/maintenance`));
    else
        setRows([]); };
    useEffect(() => { let active = true; setRows([]); setError(""); if (id)
        void workflowRequest<Maintenance[]>(`/vehicles/${id}/maintenance`).then(data => { if (active)
            setRows(data); }).catch(e => { if (active)
            setError(e.message); }); return () => { active = false; }; }, [id]);
    return <section className="card maintenance-panel"><h2>Maintenance records and servicing</h2><div className="fleet-form"><p>Record servicing, repairs, workshop invoices and the next service date or mileage. Use Edit details on a car to mark it Out of service while maintenance is underway.</p><label className="field">Car<select value={id} onChange={e => { setId(e.target.value); setMessage(""); }}><option value="">Select a car</option>{vehicles.map(v => <option key={v.id} value={v.id}>{v.plate} · {v.model}</option>)}</select></label>{error && <p className="form-error" role="alert">{error}</p>}{message && <p role="status">{message}</p>}{id && <><form key={id} onSubmit={async (event) => { event.preventDefault(); const form = event.currentTarget; const values = new FormData(form); setBusy(true); setError(""); try {
        const file = values.get("attachment") as File;
        await workflowRequest(`/vehicles/${id}/maintenance`, { type: values.get("type"), servicedAt: new Date(String(values.get("date")) + "T12:00:00+08:00").toISOString(), odometer: Number(values.get("odometer")), workshop: values.get("workshop"), workCompleted: values.get("work"), cost: Number(values.get("cost")), attachment: file.size ? await readAttachment(file) : null, nextServiceAt: values.get("nextMileage") ? Number(values.get("nextMileage")) : null, nextServiceDate: values.get("nextDate") ? new Date(String(values.get("nextDate")) + "T23:59:59+08:00").toISOString() : null, releaseVehicle: values.get("release") === "on" });
        await load();
        await onChanged();
        form.reset();
        setMessage("Maintenance saved.");
    }
    catch (e) {
        setError(e instanceof Error ? e.message : "Could not save maintenance.");
    }
    finally {
        setBusy(false);
    } }}><div className="form-grid"><label className="field">Maintenance type<select name="type"><option>Scheduled service</option><option>Repair</option><option>Tyres</option><option>Inspection</option><option>Other</option></select></label><label className="field">Date<input name="date" required type="date"/></label><label className="field">Odometer (km)<input name="odometer" required type="number" min="0"/></label><label className="field">Workshop<input name="workshop" required minLength={2}/></label><label className="field">Cost (RM)<input name="cost" required type="number" min="0" step="0.01"/></label><label className="field">Next service mileage<input name="nextMileage" type="number" min="0"/></label><label className="field">Next service date<input name="nextDate" type="date"/></label><label className="field">Invoice / receipt (PDF, JPEG, PNG; 2 MB)<input name="attachment" type="file" accept=".pdf,.jpg,.jpeg,.png"/></label><label className="field span-2">Work completed<textarea name="work" required minLength={2}/></label></div><label><input type="checkbox" name="release"/> Maintenance completed; clear the car for use if its service targets are current</label><p><button disabled={busy} className="button button-primary">{busy ? "Saving…" : "Save maintenance record"}</button></p></form><h3>Maintenance history</h3>{!rows.length && <p>No maintenance records yet.</p>}{rows.map(row => <article key={row.id} className="maintenance-record"><h4>{row.type} · {new Date(row.servicedAt).toLocaleDateString("en-MY", { timeZone: "Asia/Kuala_Lumpur" })}</h4><p>{row.workshop} · {row.odometer.toLocaleString()} km · RM {Number(row.cost).toFixed(2)}</p><p className="saved-notes">{row.workCompleted}</p>{row.nextServiceAt != null && <p>Next service: {row.nextServiceAt.toLocaleString()} km</p>}{row.nextServiceDate && <p>Next service date: {new Date(row.nextServiceDate).toLocaleDateString("en-MY", { timeZone: "Asia/Kuala_Lumpur" })}</p>}{row.attachment && <a href={row.attachment.data} download={row.attachment.name}>Download {row.attachment.name}</a>}</article>)}</>}</div></section>;
}

export function MaintenancePage() {
 const [vehicles,setVehicles]=useState<Vehicle[]>([]), [error,setError]=useState("");
 const load=async()=>{setError("");try{setVehicles(await workflowRequest<Vehicle[]>("/vehicles"));}catch(e){setError(e instanceof Error?e.message:"Could not load cars.");}};
 useEffect(()=>{void load();},[]);
 return <section className="page-stack"><div className="module-intro"><div><span className="module-kicker">Company cars</span><h2>Maintenance history</h2><p>Select a car to record servicing, repairs and invoices, and review its maintenance history.</p></div></div>{error?<div className="card fleet-form"><p role="alert">{error}</p><button onClick={()=>void load()}>Retry</button></div>:<MaintenancePanel vehicles={vehicles} onChanged={load}/>}</section>;
}
