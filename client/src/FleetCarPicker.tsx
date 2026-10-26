import { useRef, useState } from "react";
import { CarFront, ChevronDown } from "lucide-react";
import type { Vehicle } from "@hr-training/shared";

function CarPhoto({ vehicle }: { vehicle?: Vehicle }) {
  const [failed, setFailed] = useState<string | null>(null);
  return <span className="fleet-car-thumbnail">
    {vehicle?.photo && failed !== vehicle.photo
      ? <img src={vehicle.photo} alt={`${vehicle.plate} ${vehicle.model}`} onError={() => setFailed(vehicle.photo!)} />
      : <CarFront size={26} aria-hidden="true" />}
  </span>;
}

export function FleetCarPicker({ vehicles, value, onChange }: {
  vehicles: Vehicle[];
  value: string;
  onChange: (id: string) => void;
}) {
  const picker = useRef<HTMLDetailsElement>(null);
  const selected = vehicles.find(vehicle => vehicle.id === value);
  return <div className="fleet-car-field">
    <span id="fleet-car-label">Available car</span>
    <details className="fleet-car-picker" ref={picker}>
      <summary aria-labelledby="fleet-car-label fleet-car-selection" onKeyDown={event => {
        if (event.key === "Escape") event.currentTarget.parentElement?.removeAttribute("open");
      }}>
        <CarPhoto vehicle={selected} />
        <span className="fleet-car-copy" id="fleet-car-selection">
          <strong>{selected?.plate || "Select car"}</strong>
          <small>{selected?.model || "View available cars and photos"}</small>
        </span>
        <ChevronDown size={18} aria-hidden="true" />
      </summary>
      <fieldset className="fleet-car-options" onKeyDown={event => {
        if (event.key === "Escape") {
          event.preventDefault();
          if (picker.current) picker.current.open = false;
          picker.current?.querySelector("summary")?.focus();
        }
      }}>
        <legend className="fleet-visually-hidden">Choose an available car</legend>
        {!vehicles.length && <p>No cars are available. Please contact HR.</p>}
        {vehicles.map(vehicle => <label className="fleet-car-option" key={vehicle.id}>
          <input type="radio" name="fleetCar" value={vehicle.id} checked={vehicle.id === value} onClick={event => {
            if (event.detail > 0 && picker.current) {
              picker.current.open = false;
              picker.current.querySelector("summary")?.focus();
            }
          }} onChange={() => {
            onChange(vehicle.id);
          }} />
          <CarPhoto vehicle={vehicle} />
          <span className="fleet-car-copy"><strong>{vehicle.plate}</strong><small>{vehicle.model}</small><small>{vehicle.mileage.toLocaleString()} km</small></span>
        </label>)}
      </fieldset>
      <button className="fleet-car-confirm" type="button" disabled={!selected} onClick={() => {
        if (picker.current) picker.current.open = false;
        picker.current?.querySelector("summary")?.focus();
      }}>Use selected car</button>
    </details>
  </div>;
}
