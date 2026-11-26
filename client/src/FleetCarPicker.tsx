import { useId, useState } from "react";
import { CarFront, Check } from "lucide-react";
import type { Vehicle } from "@hr-training/shared";

type PickerCar = Pick<Vehicle, "id" | "plate" | "model" | "photo" | "mileage">;

function CarPhoto({ vehicle }: { vehicle: PickerCar }) {
  const [failed, setFailed] = useState<string | null>(null);
  return <span className="fleet-car-thumbnail">
    {vehicle.photo && failed !== vehicle.photo
      ? <img src={vehicle.photo} alt="" loading="lazy" onError={() => setFailed(vehicle.photo!)} />
      : <CarFront size={26} aria-hidden="true" />}
  </span>;
}

/**
 * Every free car is listed in the page flow, so choosing one is a single tap and
 * the page scrolls normally (no drop-down with its own scroll area).
 */
export function FleetCarPicker({ vehicles, value, onChange, labelledBy }: {
  vehicles: PickerCar[];
  value: string;
  onChange: (id: string) => void;
  labelledBy?: string;
}) {
  const name = useId();
  return <div className="fleet-car-list" role="radiogroup" aria-labelledby={labelledBy}>
    {vehicles.map(vehicle => <label className="fleet-car-option" key={vehicle.id}>
      <input className="fleet-visually-hidden" type="radio" name={name} value={vehicle.id}
        checked={vehicle.id === value} onChange={() => onChange(vehicle.id)} />
      <CarPhoto vehicle={vehicle} />
      <span className="fleet-car-copy">
        <strong>{vehicle.plate}</strong>
        <small>{vehicle.model}</small>
        <small>{vehicle.mileage.toLocaleString("en-MY")} km on the clock</small>
      </span>
      <span className="fleet-car-tick" aria-hidden="true"><Check size={16} strokeWidth={3} /></span>
    </label>)}
  </div>;
}
