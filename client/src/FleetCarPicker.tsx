import { useId, useRef, useState } from "react";
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
  const id = useId();
  const toggle = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const selected = vehicles.find(vehicle => vehicle.id === value);
  const close = () => {
    setOpen(false);
    toggle.current?.focus({ preventScroll: true });
  };
  return <div className="fleet-car-field" onKeyDown={event => {
    if (event.key === "Escape" && open) {
      event.preventDefault();
      close();
    }
  }}>
    <span id={`${id}-label`}>Available car</span>
    <div className="fleet-car-picker" data-open={open}>
      <button className="fleet-car-toggle" ref={toggle} type="button" aria-expanded={open}
        aria-controls={`${id}-options`} aria-labelledby={`${id}-label ${id}-selection`}
        onClick={() => setOpen(current => !current)}>
        <CarPhoto vehicle={selected} />
        <span className="fleet-car-copy" id={`${id}-selection`}>
          <strong>{selected?.plate || "Select car"}</strong>
          <small>{selected?.model || "View available cars and photos"}</small>
        </span>
        <ChevronDown size={18} aria-hidden="true" />
      </button>
      <div className="fleet-car-drawer" id={`${id}-options`} data-open={open} inert={!open} aria-hidden={!open}>
        <div className="fleet-car-drawer-inner">
          <fieldset className="fleet-car-options">
            <legend className="fleet-visually-hidden">Choose an available car</legend>
            {!vehicles.length && <p>No cars are available. Please contact HR.</p>}
            {vehicles.map(vehicle => <label className="fleet-car-option" key={vehicle.id}>
              <input type="radio" name={`${id}-car`} value={vehicle.id} checked={vehicle.id === value}
                onClick={event => { if (event.detail > 0) close(); }}
                onChange={() => onChange(vehicle.id)} />
              <CarPhoto vehicle={vehicle} />
              <span className="fleet-car-copy"><strong>{vehicle.plate}</strong><small>{vehicle.model}</small><small>{vehicle.mileage.toLocaleString()} km</small></span>
            </label>)}
          </fieldset>
          <button className="fleet-car-confirm" type="button" disabled={!selected} onClick={close}>Use selected car</button>
        </div>
      </div>
    </div>
  </div>;
}
