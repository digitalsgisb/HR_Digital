import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Printer } from "lucide-react";
import type { Vehicle } from "@hr-training/shared";
import { api } from "./api";

export const carQrUrl = (vehicleId: string) => `${window.location.origin}/fleet/?car=${encodeURIComponent(vehicleId)}`;

/** One printable sticker per car for inside the car (dashboard or sun visor). */
export function CarQrStickers() {
  const [cars, setCars] = useState<Array<Vehicle & { qr: string }> | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    api.getVehicles()
      .then(vehicles => Promise.all(vehicles.filter(vehicle => !vehicle.archivedAt).map(async vehicle => ({ ...vehicle, qr: await QRCode.toDataURL(carQrUrl(vehicle.id), { width: 300, margin: 1, color: { dark: "#101112", light: "#ffffff" }, errorCorrectionLevel: "M" }) }))))
      .then(rows => { if (active) setCars(rows); })
      .catch(cause => { if (active) setError(cause instanceof Error ? cause.message : "Could not load cars."); });
    return () => { active = false; };
  }, []);
  // Print only the sticker sheet, not the shared label.
  const print = () => {
    document.body.classList.add("printing-car-stickers");
    const done = () => { document.body.classList.remove("printing-car-stickers"); window.removeEventListener("afterprint", done); };
    window.addEventListener("afterprint", done);
    window.print();
  };
  return <section className="card car-stickers" aria-label="In-car QR stickers">
    <div className="car-stickers-head"><div><h2>In-car QR stickers</h2><p>Stick one inside each car. Drivers scan it at the car to open their trip, and anyone else sees who has the car and until when.</p></div><button className="button button-primary" disabled={!cars?.length} onClick={print}><Printer size={16} /> Print stickers</button></div>
    {error && <p className="form-error" role="alert">{error}</p>}
    {!cars ? <p role="status">Generating stickers…</p> : !cars.length ? <p>No cars in the fleet yet.</p> :
      <div className="car-sticker-sheet">{cars.map(car => <figure className="car-sticker" key={car.id}>
        <img src={car.qr} alt={`QR for ${car.plate}`} />
        <figcaption><strong>{car.plate}</strong><span>{car.model}</span><small>Scan to open your trip · HR Digital</small></figcaption>
      </figure>)}</div>}
  </section>;
}
