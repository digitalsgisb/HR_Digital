import { useEffect, useRef, useState, type FormEvent } from "react";
import { CarFront, Check, CheckCircle2, CircleAlert, ClipboardCheck, Route, ShieldCheck } from "lucide-react";
import type { Vehicle, VehicleCondition, VehicleTrip } from "@hr-training/shared";
import type { api } from "./api";
import { OdometerPhotoField } from "./OdometerPhotoField";
import { VehicleDriverPicker, type TripDriver } from "./VehicleDriverPicker";
import { clearDraft, readDraft, writeDraft } from "./fleet-storage";

// Departure and return forms shared by the HR app and the public /fleet/ page.
// Kept out of App.tsx so the public page does not bundle the HR workspace.
const formatNumber = (value: number) => new Intl.NumberFormat("en-MY").format(value);

export function VehicleFormPhoto({ vehicle, showIdentity = true }: { vehicle: Vehicle; showIdentity?: boolean }) {
  const [failedPhoto, setFailedPhoto] = useState<string | null>(null);
  return <figure className="trip-car-photo">
    {vehicle.photo && failedPhoto !== vehicle.photo
      ? <img src={vehicle.photo} alt={`${vehicle.plate} · ${vehicle.model}`} onError={() => setFailedPhoto(vehicle.photo ?? null)} />
      : <div className="trip-car-photo-empty"><CarFront size={42} /><span>Car photo not added yet</span></div>}
    {showIdentity && <figcaption><strong>{vehicle.plate}</strong><span>{vehicle.model}</span></figcaption>}
  </figure>;
}

type StartTripDraft = { destination: string; purpose: string; passengers: number; odometer: number; fuel: number; condition: VehicleCondition; notes: string; checks: { exterior: boolean; tyres: boolean; lights: boolean; documents: boolean } };
type CompleteTripDraft = { odometer: number; fuel: number; condition: VehicleCondition; notes: string; checks: { interiorClean: boolean; fuelCardReturned: boolean; belongingsRemoved: boolean; damageReported: boolean } };

export function StartTripForm({
  vehicles,
  selectedVehicleId,
  onVehicleChange,
  onSubmit,
  showCarPhoto = true,
  reservation,
  draftKey,
}: {
  reservation?: VehicleTrip;
  /** Saves typed fields and ticks on this phone until submitted (photos are not saved). */
  draftKey?: string;
  vehicles: Vehicle[];
  selectedVehicleId: string;
  onVehicleChange: (id: string) => void;
  showCarPhoto?: boolean;
  onSubmit: (
    input: Parameters<typeof api.startVehicleTrip>[0],
  ) => Promise<void>;
}) {
  const vehicle = vehicles.find((item) => item.id === selectedVehicleId)!;
  const [draft] = useState(() => draftKey ? readDraft<StartTripDraft>(draftKey) : null);
  const [driver, setDriver] = useState<TripDriver | null>(reservation ? {reference:reservation.driverEmployeeId,name:reservation.driverName} as TripDriver : null);
  const [destination, setDestination] = useState(draft?.destination ?? reservation?.destination ?? "");
  const [purpose, setPurpose] = useState(draft?.purpose ?? reservation?.purpose ?? "");
  const [passengers, setPassengers] = useState(draft?.passengers ?? reservation?.passengers ?? 1);
  const [odometer, setOdometer] = useState(draft?.odometer !== undefined && draft.odometer >= vehicle.mileage ? draft.odometer : vehicle.mileage);
  const [odometerPhoto, setOdometerPhoto] = useState("");
  const [fuel, setFuel] = useState(draft?.fuel ?? 75);
  const [condition, setCondition] = useState<VehicleCondition>(draft?.condition ?? "GOOD");
  const [notes, setNotes] = useState(draft?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [checks, setChecks] = useState({
    exterior: false,
    tyres: false,
    lights: false,
    documents: false,
    ...draft?.checks,
  });
  const loadedVehicle = useRef(`${vehicle.id}:${vehicle.mileage}`);
  useEffect(() => {
    if (draftKey) writeDraft(draftKey, { destination, purpose, passengers, odometer, fuel, condition, notes, checks } satisfies StartTripDraft);
  }, [draftKey, destination, purpose, passengers, odometer, fuel, condition, notes, checks]);
  useEffect(() => {
    // Only reset when the car changes, so a restored draft survives the first render.
    const key = `${vehicle.id}:${vehicle.mileage}`;
    if (loadedVehicle.current === key) return;
    loadedVehicle.current = key;
    setOdometer(vehicle.mileage);
    setOdometerPhoto("");
    setChecks({ exterior: false, tyres: false, lights: false, documents: false });
  }, [vehicle.id, vehicle.mileage]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (!driver) {
      setError("Choose the driver's department, position and name, or enter the guest's full name.");
      return;
    }
    if (!odometerPhoto) {
      setError(
        "Take a clear photo of the ODO display before starting the trip.",
      );
      return;
    }
    if (!Object.values(checks).every(Boolean)) {
      setError("Complete every required before-drive check.");
      return;
    }
    if (vehicle.status !== "AVAILABLE" && !reservation) {
      setError("This car is no longer available. Refresh its status before starting.");
      return;
    }
    try {
      setBusy(true);
      await onSubmit({
        vehicleId: vehicle.id,
        driverEmployeeId: driver.reference,
        driverName: driver.name,
        destination,
        purpose,
        passengers,
        odometerStart: odometer,
        odometerPhotoBefore: odometerPhoto,
        fuelBefore: fuel,
        conditionBefore: condition,
        checksBefore: checks,
        notesBefore: notes,
      });
      if (draftKey) clearDraft(draftKey);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to start this trip.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="fleet-form" onSubmit={submit}>
      {showCarPhoto && <VehicleFormPhoto vehicle={vehicle} />}
      <div className="fleet-form-step">
        <span>1</span>
        <div>
          <strong>Journey information</strong>
          <small>Who is driving and where the vehicle is going.</small>
        </div>
      </div>
      <div className="form-grid">
        <label className="field">
          <span>Vehicle</span>
          <select
            value={vehicle.id}
            onChange={(event) => onVehicleChange(event.target.value)}
          >
            {vehicles
              .filter(
                (item) => item.status === "AVAILABLE" || item.id === vehicle.id,
              )
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.plate} · {item.model}
                </option>
              ))}
          </select>
        </label>
        {reservation ? <p className="field">Driver: <strong>{reservation.driverName}</strong></p> : <VehicleDriverPicker onChange={setDriver} />}
        <label className="field">
          <span>Destination</span>
          <input
            value={destination}
            onChange={(event) => setDestination(event.target.value)}
            placeholder="e.g. Shah Alam"
            required
          />
        </label>
        <label className="field">
          <span>Purpose</span>
          <input
            value={purpose}
            onChange={(event) => setPurpose(event.target.value)}
            placeholder="e.g. Supplier meeting"
            required
          />
        </label>
        <label className="field">
          <span>People in vehicle</span>
          <input
            type="number"
            min="1"
            max="20"
            value={passengers}
            onChange={(event) => setPassengers(Number(event.target.value))}
            required
          />
        </label>
        <label className="field">
          <span>Starting odometer (km)</span>
          <input
            type="number"
            min={vehicle.mileage}
            value={odometer}
            onChange={(event) => setOdometer(Number(event.target.value))}
            required
          />
        </label>
      </div>
      <OdometerPhotoField
        minimumMileage={vehicle.mileage}
        photo={odometerPhoto}
        onPhoto={setOdometerPhoto}
        onMileage={setOdometer}
      />
      <div className="fleet-form-step">
        <span>2</span>
        <div>
          <strong>Before-drive condition</strong>
          <small>Confirm the vehicle is safe before leaving.</small>
        </div>
      </div>
      <div className="inspection-grid">
        {[
          {
            key: "exterior",
            label: "Body & exterior",
            detail: "No new damage or obstruction",
          },
          {
            key: "tyres",
            label: "Tyres & wheels",
            detail: "Inflated with no visible damage",
          },
          {
            key: "lights",
            label: "Lights & signals",
            detail: "Headlights, brake lights and signals work",
          },
          {
            key: "documents",
            label: "Documents & equipment",
            detail: "Road tax, insurance and safety kit present",
          },
        ].map((item) => (
          <label
            key={item.key}
            className={checks[item.key as keyof typeof checks] ? "checked" : ""}
          >
            <input
              type="checkbox"
              checked={checks[item.key as keyof typeof checks]}
              onChange={(event) =>
                setChecks((current) => ({
                  ...current,
                  [item.key]: event.target.checked,
                }))
              }
            />
            <span>
              <Check size={15} />
            </span>
            <div>
              <strong>{item.label}</strong>
              <small>{item.detail}</small>
            </div>
          </label>
        ))}
      </div>
      <div className="form-grid inspection-fields">
        <label className="field">
          <span>Vehicle condition</span>
          <select
            value={condition}
            onChange={(event) =>
              setCondition(event.target.value as VehicleCondition)
            }
          >
            <option value="GOOD">Good · cleared to drive</option>
            <option value="ATTENTION_REQUIRED">Attention required</option>
            <option value="UNSAFE">Unsafe · do not drive</option>
          </select>
        </label>
        <label className="field fuel-field">
          <span>
            Fuel before drive <strong>{fuel}%</strong>
          </span>
          <input
            type="range"
            min="0"
            max="100"
            step="5"
            value={fuel}
            onChange={(event) => setFuel(Number(event.target.value))}
          />
        </label>
        <label className="field span-2">
          <span>Existing damage / notes</span>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Record scratches, warning lights or other observations before driving."
            rows={3}
          />
        </label>
      </div>
      {error && (
        <div className="form-error">
          <CircleAlert size={16} />
          {error}
        </div>
      )}
      <footer className="fleet-form-actions">
        <span>
          <ShieldCheck size={16} /> Submitted checks are time-stamped in the
          trip record.
        </span>
        <button
          className="button button-primary"
          disabled={busy || condition === "UNSAFE"}
        >
          {busy ? (
            "Starting…"
          ) : (
            <>
              <CarFront size={16} /> Confirm & start trip
            </>
          )}
        </button>
      </footer>
    </form>
  );
}

export function CompleteTripForm({
  vehicle,
  trip,
  onSubmit,
  showCarPhoto = true,
  draftKey,
}: {
  vehicle: Vehicle;
  trip: VehicleTrip;
  showCarPhoto?: boolean;
  /** Saves typed fields and ticks on this phone until submitted (photos are not saved). */
  draftKey?: string;
  onSubmit: (
    input: Parameters<typeof api.completeVehicleTrip>[1],
  ) => Promise<void>;
}) {
  const [draft] = useState(() => draftKey ? readDraft<CompleteTripDraft>(draftKey) : null);
  const minimumOdometer = Math.max(vehicle.mileage, trip.odometerStart);
  const [odometer, setOdometer] = useState(
    draft?.odometer !== undefined && draft.odometer >= trip.odometerStart ? draft.odometer : minimumOdometer,
  );
  const [odometerPhoto, setOdometerPhoto] = useState("");
  const [fuel, setFuel] = useState(draft?.fuel ?? 50);
  const [condition, setCondition] = useState<VehicleCondition>(draft?.condition ?? "GOOD");
  const [notes, setNotes] = useState(draft?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [checks, setChecks] = useState({
    interiorClean: false,
    fuelCardReturned: false,
    belongingsRemoved: false,
    damageReported: false,
    ...draft?.checks,
  });
  useEffect(() => {
    if (draftKey) writeDraft(draftKey, { odometer, fuel, condition, notes, checks } satisfies CompleteTripDraft);
  }, [draftKey, odometer, fuel, condition, notes, checks]);
  const distance = Math.max(0, odometer - trip.odometerStart);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (!odometerPhoto) {
      setError(
        "Take a clear photo of the ODO display before completing the return.",
      );
      return;
    }
    if (
      !checks.interiorClean ||
      !checks.fuelCardReturned ||
      !checks.belongingsRemoved
    ) {
      setError("Complete every required return check.");
      return;
    }
    try {
      setBusy(true);
      await onSubmit({
        odometerEnd: odometer,
        odometerPhotoAfter: odometerPhoto,
        fuelAfter: fuel,
        conditionAfter: condition,
        checksAfter: checks,
        notesAfter: notes,
      });
      if (draftKey) clearDraft(draftKey);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to complete this trip.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="fleet-form" onSubmit={submit}>
      {showCarPhoto && <VehicleFormPhoto vehicle={vehicle} />}
      <div className="return-summary">
        <span>
          <Route size={21} />
        </span>
        <div>
          <strong>{trip.driverName}</strong>
          <small>
            {trip.purpose} · {trip.destination}
          </small>
        </div>
        <em>
          Started{" "}
          {new Date(trip.startedAt).toLocaleString("en-MY", {
            day: "2-digit",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </em>
      </div>
      <div className="fleet-form-step">
        <span>1</span>
        <div>
          <strong>Return mileage & fuel</strong>
          <small>
            The ending odometer automatically calculates total distance.
          </small>
        </div>
      </div>
      <div className="form-grid">
        <label className="field">
          <span>Starting odometer</span>
          <input value={`${formatNumber(trip.odometerStart)} km`} disabled />
        </label>
        <label className="field">
          <span>Ending odometer (km)</span>
          <input
            type="number"
            min={trip.odometerStart}
            value={odometer}
            onChange={(event) => setOdometer(Number(event.target.value))}
            required
          />
        </label>
        <div className="distance-result">
          <span>Trip distance</span>
          <strong>{formatNumber(distance)} km</strong>
        </div>
        <label className="field fuel-field">
          <span>
            Fuel after drive <strong>{fuel}%</strong>
          </span>
          <input
            type="range"
            min="0"
            max="100"
            step="5"
            value={fuel}
            onChange={(event) => setFuel(Number(event.target.value))}
          />
        </label>
      </div>
      <OdometerPhotoField
        minimumMileage={trip.odometerStart}
        photo={odometerPhoto}
        onPhoto={setOdometerPhoto}
        onMileage={setOdometer}
      />
      <div className="fleet-form-step">
        <span>2</span>
        <div>
          <strong>After-drive inspection</strong>
          <small>
            Leave the vehicle ready and report any change in condition.
          </small>
        </div>
      </div>
      <div className="inspection-grid return-checks">
        {[
          {
            key: "interiorClean",
            label: "Interior clean",
            detail: "Cabin and load area left tidy",
          },
          {
            key: "fuelCardReturned",
            label: "Keys & fuel card returned",
            detail: "Returned to the designated location",
          },
          {
            key: "belongingsRemoved",
            label: "Personal items removed",
            detail: "No belongings left in the vehicle",
          },
          {
            key: "damageReported",
            label: "New damage / issue found",
            detail: "Selecting this flags the vehicle for attention",
          },
        ].map((item) => (
          <label
            key={item.key}
            className={
              checks[item.key as keyof typeof checks]
                ? `checked ${item.key === "damageReported" ? "attention" : ""}`
                : ""
            }
          >
            <input
              type="checkbox"
              checked={checks[item.key as keyof typeof checks]}
              onChange={(event) =>
                setChecks((current) => ({
                  ...current,
                  [item.key]: event.target.checked,
                }))
              }
            />
            <span>
              <Check size={15} />
            </span>
            <div>
              <strong>{item.label}</strong>
              <small>{item.detail}</small>
            </div>
          </label>
        ))}
      </div>
      <div className="form-grid inspection-fields">
        <label className="field">
          <span>Condition after drive</span>
          <select
            value={condition}
            onChange={(event) =>
              setCondition(event.target.value as VehicleCondition)
            }
          >
            <option value="GOOD">Good · ready for next user</option>
            <option value="ATTENTION_REQUIRED">Attention required</option>
            <option value="UNSAFE">Unsafe · remove from service</option>
          </select>
        </label>
        <label className="field span-2">
          <span>Return notes</span>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Record refuelling, damage, warning lights, cleanliness or maintenance concerns."
            rows={3}
          />
        </label>
      </div>
      {error && (
        <div className="form-error">
          <CircleAlert size={16} />
          {error}
        </div>
      )}
      <footer className="fleet-form-actions">
        <span>
          <ClipboardCheck size={16} /> The vehicle status will update from this
          return check.
        </span>
        <button className="button button-primary" disabled={busy}>
          {busy ? (
            "Completing…"
          ) : (
            <>
              <CheckCircle2 size={16} /> Complete return
            </>
          )}
        </button>
      </footer>
    </form>
  );
}
