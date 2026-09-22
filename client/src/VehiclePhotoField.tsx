import { useState, type ChangeEvent } from "react";
import { Camera, ImagePlus, Trash2 } from "lucide-react";

type Props = {
  photo?: string | null;
  onChange: (photo: string | null) => void;
};

async function preparePhoto(file: File) {
  const bitmap = await createImageBitmap(file);
  const maximum = 1400;
  const scale = Math.min(1, maximum / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser could not prepare the photo.");
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.78);
}

export function VehiclePhotoField({ photo, onChange }: Props) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const selectPhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Choose a JPG, PNG or WebP image.");
      return;
    }
    try {
      setBusy(true);
      setError("");
      onChange(await preparePhoto(file));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to prepare this photo.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="vehicle-photo-field">
      <div className="vehicle-photo-preview">
        {photo ? <img src={photo} alt="Vehicle" /> : <span><CarPhotoPlaceholder /></span>}
      </div>
      <div>
        <strong>Vehicle photo</strong>
        <p>Add a clear exterior photo so employees can identify the correct car before scanning its QR code.</p>
        <div className="vehicle-photo-actions">
          <label className="button button-secondary">
            {photo ? <Camera size={15} /> : <ImagePlus size={15} />}
            {busy ? "Preparing…" : photo ? "Replace photo" : "Upload photo"}
            <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={selectPhoto} disabled={busy} />
          </label>
          {photo && <button className="button button-secondary" type="button" onClick={() => onChange(null)}><Trash2 size={15} /> Remove photo</button>}
        </div>
        {error && <small className="photo-error">{error}</small>}
      </div>
    </section>
  );
}

function CarPhotoPlaceholder() {
  return <><ImagePlus size={30} /><small>No photo yet</small></>;
}
