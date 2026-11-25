import { env } from "./env.js";
import { processFleetEmails } from "./fleet-email.js";
import { releaseNoShows } from "./vehicle-booking.js";

// Releases no-show bookings (always) and sends company-car emails (when email is enabled).
export function startFleetWorker() {
  if (!env.databaseUrl) return () => {};
  let busy = false;
  const tick = async () => {
    if (busy) return; busy = true;
    try { await releaseNoShows(); await processFleetEmails(); }
    catch { console.error("Company car bookings and emails could not be processed. Check database connectivity and schema."); }
    finally { busy = false; }
  };
  const timer = setInterval(() => { void tick(); }, 60000); timer.unref(); void tick();
  return () => clearInterval(timer);
}
