import { useState, type ChangeEvent } from "react";
import { Camera, CheckCircle2, CircleAlert, ScanLine } from "lucide-react";

type Props = {
  minimumMileage: number;
  photo: string;
  onPhoto: (photo: string) => void;
  onMileage: (mileage: number) => void;
};

const resizePhoto = async (file: File) => {
  const bitmap = await createImageBitmap(file);
  const maximum = 1600;
  const scale = Math.min(1, maximum / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser could not prepare the photo.");
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return { canvas, dataUrl: canvas.toDataURL("image/jpeg", 0.78) };
};

const focusedDashboardDisplay = (source: HTMLCanvasElement) => {
  const left = Math.round(source.width * 0.34);
  const top = Math.round(source.height * 0.42);
  const width = Math.round(source.width * 0.38);
  const height = Math.round(source.height * 0.38);
  const scale = Math.max(2, Math.min(4, 1200 / Math.max(1, width)));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return source;
  context.drawImage(source, left, top, width, height, 0, 0, canvas.width, canvas.height);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  for (let index = 0; index < pixels.data.length; index += 4) {
    const peak = Math.max(pixels.data[index], pixels.data[index + 1], pixels.data[index + 2]);
    const value = peak > 145 ? 255 : peak > 95 ? Math.min(255, (peak - 95) * 5) : 0;
    pixels.data[index] = value;
    pixels.data[index + 1] = value;
    pixels.data[index + 2] = value;
  }
  context.putImageData(pixels, 0, 0);
  return canvas;
};

const mileageCandidates = (text: string) => {
  const groups = text.match(/\d[\d\s,.'’]{0,10}\d|\d/g) ?? [];
  return [...new Set(groups.map((group) => Number(group.replace(/\D/g, ""))))]
    .filter((value) => Number.isInteger(value) && value >= 0 && value <= 9_999_999);
};

const chooseMileage = (candidates: number[], minimum: number) => {
  const plausible = candidates.filter((value) => value >= minimum);
  if (!plausible.length) return undefined;
  return plausible.sort((left, right) => Math.abs(left - minimum) - Math.abs(right - minimum))[0];
};

export function OdometerPhotoField({ minimumMileage, photo, onPhoto, onMileage }: Props) {
  const [reading, setReading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<string>("");
  const [error, setError] = useState("");

  const readPhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) { setError("Choose a JPG, PNG or WebP photo."); return; }
    setReading(true); setError(""); setResult(""); setProgress(0.02);
    try {
      const prepared = await resizePhoto(file);
      onPhoto(prepared.dataUrl);
      setResult("Checking the on-prem vision model…");
      try {
        const visionResponse = await fetch("/api/ocr/odometer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ photo: prepared.dataUrl, minimumMileage })
        });
        if (visionResponse.ok) {
          const vision = await visionResponse.json() as { mileage: number | null; confidence: number; reason?: string };
          if (vision.mileage != null && vision.confidence >= 0.45) {
            onMileage(vision.mileage);
            setResult(`On-prem AI detected ${new Intl.NumberFormat("en-MY").format(vision.mileage)} km · please confirm`);
            return;
          }
        }
      } catch { /* The bundled OCR below is the offline fallback. */ }
      setResult("");
      const { createWorker, OEM, PSM } = await import("tesseract.js");
      const worker = await createWorker("eng", OEM.LSTM_ONLY, {
        workerPath: `${window.location.origin}/ocr/worker.min.js`,
        corePath: `${window.location.origin}/ocr/core`,
        langPath: `${window.location.origin}/ocr/lang`,
        logger: (message) => { if (typeof message.progress === "number") setProgress(message.progress); }
      });
      await worker.setParameters({
        tessedit_pageseg_mode: PSM.SPARSE_TEXT,
        preserve_interword_spaces: "1",
        user_defined_dpi: "300"
      });
      const recognition = await worker.recognize(prepared.canvas);
      await worker.setParameters({
        tessedit_char_whitelist: "0123456789",
        tessedit_pageseg_mode: PSM.SPARSE_TEXT,
        preserve_interword_spaces: "1"
      });
      const focusedRecognition = await worker.recognize(focusedDashboardDisplay(prepared.canvas));
      await worker.terminate();
      const detected = chooseMileage(
        [...mileageCandidates(recognition.data.text), ...mileageCandidates(focusedRecognition.data.text)],
        minimumMileage
      );
      if (detected == null) {
        setError("Photo saved, but OCR could not confidently find the ODO number. Enter it manually and confirm against the photo.");
        return;
      }
      onMileage(detected);
      setResult(`Detected ${new Intl.NumberFormat("en-MY").format(detected)} km · please confirm`);
    } catch (cause) {
      setError(cause instanceof Error ? `Photo saved, but OCR failed: ${cause.message}` : "Photo saved, but OCR could not run. Enter the mileage manually.");
    } finally { setReading(false); setProgress(1); }
  };

  return <section className="odometer-photo"><div className="odometer-photo-heading"><span><Camera size={19} /></span><div><strong>Odometer photo evidence</strong><small>Frame the digital <b>ODO</b> number clearly—not Trip A/B or the speedometer.</small></div><em>Required</em></div><div className="odometer-capture">{photo ? <img src={photo} alt="Captured odometer" /> : <div className="odometer-placeholder"><ScanLine size={30} /><strong>Keep the ODO display inside the frame</strong><small>A straight, glare-free close-up gives the best reading.</small></div>}<label className="button button-secondary"><Camera size={16} /> {photo ? "Retake photo" : "Take odometer photo"}<input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={readPhoto} disabled={reading} /></label></div>{reading && <div className="ocr-progress"><span><i style={{ width: `${Math.max(6, progress * 100)}%` }} /></span><strong>Reading ODO locally… {Math.round(progress * 100)}%</strong></div>}{result && !reading && <div className="ocr-result"><CheckCircle2 size={16} />{result}</div>}{error && !reading && <div className="ocr-warning"><CircleAlert size={16} />{error}</div>}<p><b>Privacy:</b> OCR runs from assets hosted on your AI PC. No cloud vision provider or n8n upload is required.</p></section>;
}
