import { randomBytes } from "node:crypto";
import { z } from "zod";
import type { SendMailOptions } from "nodemailer";
import { env } from "./env.js";
import { prisma } from "./prisma.js";
import { emailLogo, emailLogoCid } from "./email-template.js";
import { departmentWithHod } from "./department-hod.js";
import { resolvedHod, resolvedHodName } from "./training-evaluation.js";
import { sendSmtpMail, trainingEmailReady } from "./training-email.js";

const MYT = 8 * 3600000;
const LEASE_MS = 30 * 60000;
const openStatuses = ["AWAITING_DEPARTURE", "IN_PROGRESS"] as const;
const linkStatuses = ["BOOKED", ...openStatuses] as const;
export type FleetNoticeKind = "NO_SHOW" | "HR_CHANGED" | "HR_CANCELLED";
type FleetEmailKind = "link" | "reminder" | FleetNoticeKind;

export const newTripToken = () => randomBytes(24).toString("base64url");
export const tripTokenPattern = /^[A-Za-z0-9_-]{32}$/;

// The fleet page lives in the SPA, so links use the client origin, not the API origin.
export const fleetTripUrl = (token: string) => {
  const url = new URL("/", process.env.FLEET_BASE_URL?.trim() || env.clientOrigin);
  url.searchParams.set("fleet", "1");
  url.searchParams.set("trip", token);
  return url.toString();
};

type Contact = Parameters<typeof resolvedHod>[0] & { email: string | null; name: string | null; employeeId: string };
const validEmail = (value: string | null | undefined) => !!value && z.string().trim().email().safeParse(value).success;

// The employee gets their own link; without an email it goes to their HOD to forward.
export function tripLinkRecipient(employee: Contact | null): { to: string; role: "employee" | "hod"; name: string } | null {
  if (!employee) return null;
  if (validEmail(employee.email)) return { to: employee.email!.trim().toLowerCase(), role: "employee", name: employee.name || employee.employeeId };
  const hod = resolvedHod(employee);
  if (validEmail(hod)) return { to: hod.trim().toLowerCase(), role: "hod", name: resolvedHodName(employee) || "Head of Department" };
  return null;
}

export type TripLinkDelivery = "employee" | "hod" | "none";
export const tripLinkDelivery = (employee: Contact | null): TripLinkDelivery =>
  trainingEmailReady() ? tripLinkRecipient(employee)?.role ?? "none" : "none";

// 09:00 Malaysia time on the next calendar day (every day: cars are also used on weekends).
export function nextDailyReminderAt(after: Date) {
  const local = new Date(after.getTime() + MYT);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + 1, 9) - MYT);
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
const myt = (date: Date | null) => date ? new Intl.DateTimeFormat("en-MY", { timeZone: "Asia/Kuala_Lumpur", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true }).format(date) : "Not set";

type TripForEmail = { driverName: string; driverEmployeeId: string; destination: string; expectedReturnAt: Date | null; bookedFrom?: Date | null; status: string; vehicle: { plate: string; model: string } };

function emailCopy(kind: FleetEmailKind, trip: TripForEmail, forHod: boolean, reminderNumber: number) {
  const plate = trip.vehicle.plate;
  const whose = forHod ? `${trip.driverName}'s` : "Your";
  const forward = forHod ? ` ${trip.driverName} has no email address on file; please let them know.` : "";
  switch (kind) {
    case "link": {
      const booked = trip.status === "BOOKED";
      return {
        subject: forHod ? `${booked ? "Car booking" : "Trip link"} for ${trip.driverName} – please forward (${plate})` : booked ? `Your company car booking – ${plate}` : `Your company car trip link – ${plate}`,
        title: booked ? "Your company car booking" : "Your company car trip link",
        intro: (forHod ? `${trip.driverName} (${trip.driverEmployeeId}) has ${booked ? "booked" : "reserved"} a company car but has no email address on file. Please forward this link to them. ` : "")
          + (booked
            ? "On the day, open this link at the HR table to check in and collect the key. Check-in opens 30 minutes before the start. A booking not checked in within 30 minutes of its start is released for others."
            : "Use this link to reopen your trip at any time: to confirm departure after collecting the key and to key in the return details. You do not need to scan the HR QR again."),
        action: booked ? "Open my booking" : "Open my trip", showLink: true
      };
    }
    case "reminder":
      return {
        subject: forHod ? `Reminder: ${trip.driverName} has not keyed in the car return (${plate})` : `Reminder: please key in your car return – ${plate}`,
        title: "Please key in your car return",
        intro: trip.status === "AWAITING_DEPARTURE"
          ? `${whose} car reservation passed its expected return time without a departure. Open the trip to confirm departure, or cancel the reservation and return the key.`
          : `${whose} trip passed its expected return time and the return details have not been keyed in. Open the trip and complete the return with the ending odometer photo and checks.${reminderNumber > 1 ? ` This is reminder ${reminderNumber}.` : ""}`,
        action: "Key in the return", showLink: true
      };
    case "NO_SHOW":
      return { subject: `Car booking released – ${plate}`, title: "Your car booking was released", intro: `${whose} booking was not checked in within 30 minutes of its start, so the car has been released for others. Make a new booking if you still need a car.${forward}`, action: "Book a car", showLink: false };
    case "HR_CHANGED":
      return { subject: `Car booking changed by HR – ${plate}`, title: "HR changed your car booking", intro: `HR has updated ${forHod ? `${trip.driverName}'s` : "your"} car booking. The new details are below. Use the same trip link as before.${forward}`, action: "Open my booking", showLink: true };
    case "HR_CANCELLED":
      return { subject: `Car booking cancelled by HR – ${plate}`, title: "HR cancelled your car booking", intro: `HR has cancelled ${forHod ? `${trip.driverName}'s` : "your"} car booking below. Contact HR if you still need a car.${forward}`, action: "Book a car", showLink: false };
  }
}

export function renderFleetTripEmail(kind: FleetEmailKind, trip: TripForEmail, recipient: { role: "employee" | "hod"; name: string }, url: string, reminderNumber = 1) {
  const forHod = recipient.role === "hod";
  const car = `${trip.vehicle.plate} · ${trip.vehicle.model}`;
  const copy = emailCopy(kind, trip, forHod, reminderNumber);
  const { subject, title, intro, action } = copy;
  // Closed bookings link to the fleet page, not the old trip.
  if (!copy.showLink) url = new URL(url).origin + "/?fleet=1";
  const warning = "IF YOU LOSE THIS LINK: scan the HR car QR and enter your employee ID to find your trip again.";
  const rows: Array<[string, string]> = [["Driver", `${trip.driverName} (${trip.driverEmployeeId})`], ["Car", car], ["Destination", trip.destination],
    ...(trip.bookedFrom && kind !== "reminder" ? [["Booked from", `${myt(trip.bookedFrom)} · Malaysia time`] as [string, string]] : []),
    [trip.bookedFrom && kind !== "reminder" ? "Booked until" : "Expected return", `${myt(trip.expectedReturnAt)} · Malaysia time`]];
  const text = `SUGIHARA GRAND INDUSTRIES SDN. BHD.\nHR Digital · Company cars\n\n${title}\n\nHello ${recipient.name},\n\n${intro}\n\n${rows.map(([label, value]) => `${label}: ${value}`).join("\n")}\n\n${action}: ${url}\n\n${copy.showLink ? `${warning}\n\n` : ""}If you need help, please contact Human Resources.\n\nThis message was sent by HR Digital.`;
  const href = escapeHtml(url);
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:24px 12px;background:#f2f2f2;font-family:Arial,Helvetica,sans-serif;color:#000">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #dddddd">
<tr><td style="padding:20px 24px;border-bottom:1px solid #eeeeee"><img src="cid:${emailLogoCid}" alt="Sugihara Grand Industries" height="36" style="display:block;height:36px"></td></tr>
<tr><td style="padding:24px">
<p style="margin:0 0 4px;font-size:12px;letter-spacing:.08em;color:#555555">HR DIGITAL · COMPANY CARS</p>
<h1 style="margin:0 0 16px;font-size:22px;line-height:1.3">${escapeHtml(title)}</h1>
<p style="margin:0 0 12px;font-size:15px;line-height:1.5">Hello ${escapeHtml(recipient.name)},</p>
<p style="margin:0 0 16px;font-size:15px;line-height:1.5">${escapeHtml(intro)}</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 20px;font-size:14px">${rows.map(([label, value]) => `<tr><td style="padding:6px 0;color:#555555;width:130px;vertical-align:top">${escapeHtml(label)}</td><td style="padding:6px 0;font-weight:bold">${escapeHtml(value)}</td></tr>`).join("")}</table>
<p style="margin:0 0 20px"><a href="${href}" style="display:inline-block;background:#000000;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:6px">${escapeHtml(action)}</a></p>
${copy.showLink ? `<p style="margin:0 0 20px;padding:12px;border:2px solid #c62828;background:#fdecea;color:#8e1b1b;font-size:14px;font-weight:bold;line-height:1.4">${escapeHtml(warning)}</p>` : ""}
<p style="margin:0;font-size:12px;color:#555555;word-break:break-all">${href}</p>
</td></tr></table></body></html>`;
  return { subject, text, html };
}

type Db = typeof prisma;
type Send = (message: SendMailOptions) => Promise<{ rejected?: unknown[] }>;

async function deliver(db: Db, sendMail: Send, tripId: string, kind: FleetEmailKind) {
  const trip = await db.vehicleTrip.findUnique({ where: { id: tripId }, include: { vehicle: true } });
  if (!trip?.resumeToken) return { sent: false as const, reason: "closed" };
  // Notices describe a change, so they also go out for closed bookings; links and reminders only while open.
  const statuses: readonly string[] = kind === "link" ? linkStatuses : openStatuses;
  if ((kind === "link" || kind === "reminder") && (trip.archivedAt || !statuses.includes(trip.status))) return { sent: false as const, reason: "closed" };
  const employee = await db.employee.findFirst({ where: { employeeId: trip.driverEmployeeId }, include: { department: departmentWithHod } });
  const recipient = employee?.status === "ACTIVE" ? tripLinkRecipient(employee) : null;
  if (!recipient) return { sent: false as const, reason: "no-recipient" };
  const content = renderFleetTripEmail(kind, trip, recipient, fleetTripUrl(trip.resumeToken), trip.returnRemindersSent + 1);
  const result = await sendMail({ from: env.smtpFrom, to: recipient.to, subject: content.subject, text: content.text, html: content.html,
    messageId: `<fleet-${kind.toLowerCase()}-${trip.id}-${kind === "reminder" ? trip.returnRemindersSent : kind === "link" ? 0 : Date.now()}@hr-digital.local>`,
    attachments: [{ filename: "sugihara-logo.png", content: emailLogo, contentType: "image/png", cid: emailLogoCid, contentDisposition: "inline" }] });
  if (result.rejected?.length) throw new Error("Recipient rejected");
  return { sent: true as const, to: recipient.to };
}

// Each due email is claimed by moving its due time forward (a lease), so overlapping
// ticks cannot send it twice; a failed send simply becomes due again after the lease.
export async function processFleetEmails(now = new Date(), db: Db = prisma, sendMail: Send = sendSmtpMail) {
  if (!trainingEmailReady()) return;
  const open = { archivedAt: null, status: { in: [...openStatuses] } };
  const links = await db.vehicleTrip.findMany({ where: { archivedAt: null, status: { in: [...linkStatuses] }, linkEmailDueAt: { lte: now } }, select: { id: true, linkEmailDueAt: true, createdAt: true }, take: 50 });
  for (const trip of links) {
    const claimed = await db.vehicleTrip.updateMany({ where: { id: trip.id, linkEmailDueAt: trip.linkEmailDueAt }, data: { linkEmailDueAt: new Date(now.getTime() + LEASE_MS) } });
    if (!claimed.count) continue;
    try {
      const result = await deliver(db, sendMail, trip.id, "link");
      await db.vehicleTrip.update({ where: { id: trip.id }, data: result.sent ? { linkEmailDueAt: null, linkEmailedAt: new Date(), linkEmailRecipient: result.to } : { linkEmailDueAt: null } });
    } catch {
      // Stop retrying the link after a day; the daily return reminder carries the same link.
      if (now.getTime() - trip.createdAt.getTime() > 86400000) await db.vehicleTrip.update({ where: { id: trip.id }, data: { linkEmailDueAt: null } });
      console.error("Company car trip link email failed; it will be retried.");
    }
  }
  const reminders = await db.vehicleTrip.findMany({ where: { ...open, returnReminderDueAt: { lte: now } }, select: { id: true, returnReminderDueAt: true }, take: 50 });
  for (const trip of reminders) {
    const claimed = await db.vehicleTrip.updateMany({ where: { id: trip.id, returnReminderDueAt: trip.returnReminderDueAt }, data: { returnReminderDueAt: new Date(now.getTime() + LEASE_MS) } });
    if (!claimed.count) continue;
    try {
      const result = await deliver(db, sendMail, trip.id, "reminder");
      await db.vehicleTrip.update({ where: { id: trip.id }, data: result.sent
        ? { returnReminderDueAt: nextDailyReminderAt(now), returnRemindersSent: { increment: 1 } }
        // No address yet: check again tomorrow in case HR adds one.
        : { returnReminderDueAt: result.reason === "closed" ? null : nextDailyReminderAt(now) } });
    } catch {
      console.error("Company car return reminder failed; it will be retried.");
    }
  }
  const notices = await db.vehicleTrip.findMany({ where: { noticeDueAt: { lte: now } }, select: { id: true, noticeDueAt: true, noticeKind: true }, take: 50 });
  for (const trip of notices) {
    const lease = new Date(now.getTime() + LEASE_MS);
    const claimed = await db.vehicleTrip.updateMany({ where: { id: trip.id, noticeDueAt: trip.noticeDueAt }, data: { noticeDueAt: lease } });
    if (!claimed.count) continue;
    const kind = trip.noticeKind as FleetNoticeKind | null;
    try {
      if (kind === "NO_SHOW" || kind === "HR_CHANGED" || kind === "HR_CANCELLED") await deliver(db, sendMail, trip.id, kind);
      // Clear only our lease: a newer notice set while sending stays queued.
      await db.vehicleTrip.updateMany({ where: { id: trip.id, noticeDueAt: lease }, data: { noticeDueAt: null, noticeKind: null } });
    } catch {
      console.error("Company car booking notice failed; it will be retried.");
    }
  }
}
