import type { TripLocation } from "@hr-training/shared";

/**
 * PLACEHOLDER — HR must replace this with the approved PDPA notice before rollout.
 * Shown next to the location consent tick on the departure form.
 */
export const LOCATION_CONSENT_TEXT =
  "[Placeholder – HR to replace with the approved PDPA notice] Share my phone's location only when I tap Depart, I've arrived and Return on this trip. It is used to manage company cars and is kept with this trip record. I can untick this and still use the car.";

/** One location reading, or null if the phone refuses, is too slow or has no GPS. Never throws. */
export function currentLocation(timeoutMs = 10000): Promise<TripLocation | null> {
  if (!("geolocation" in navigator)) return Promise.resolve(null);
  return new Promise(resolve => {
    const timer = window.setTimeout(() => resolve(null), timeoutMs + 1000);
    navigator.geolocation.getCurrentPosition(
      position => { window.clearTimeout(timer); resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: Number.isFinite(position.coords.accuracy) ? Math.round(position.coords.accuracy) : null }); },
      () => { window.clearTimeout(timer); resolve(null); },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 60000 }
    );
  });
}
