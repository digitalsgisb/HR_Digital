import { createTrainingPortalRouter, createTrainingReviewRouter } from "./training-portal.js";
import { createTrainingEmailSettingsRouter } from "./training-email-settings.js";
import { createTrainingEmailTrackerRouter } from "./training-email-tracker.js";
import { createFleetWorkflowRouter } from "./fleet-workflow.js";
import { createVehicleBookingRouter } from "./vehicle-booking.js";
import { createFleetBoardRouter } from "./fleet-board.js";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { env } from "./env.js";
import { createAttendancePageRouter } from "./attendance-page.js";
import { createRouter } from "./routes.js";

const isMissingDatabaseUrlError = (error: unknown) =>
  error instanceof Error && error.message.includes("Environment variable not found: DATABASE_URL");

export const createApp = () => {
  const app = express();

  if (env.trustProxy) app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(cors({ origin: env.clientOrigin }));
  app.use(express.json({ limit: "8mb" }));
  app.use("/training", createTrainingPortalRouter());
  app.use("/attendance", createAttendancePageRouter());
  // Public company-car API for the /fleet/ page (Cloudflare bypass on /fleet/ only). Employee routes only.
  app.use("/fleet/api", createFleetWorkflowRouter({ guest: true }), createVehicleBookingRouter({ guest: true }));
  app.use("/fleet/api", (_req, res) => { res.status(404).json({ message: "Not found." }); });
  app.use("/api", createFleetWorkflowRouter());
  app.use("/api", createVehicleBookingRouter());
  app.use("/api", createFleetBoardRouter());
  app.use("/api", createTrainingReviewRouter());
  app.use("/api", createTrainingEmailSettingsRouter());
  app.use("/api", createTrainingEmailTrackerRouter());
  app.use("/api", createRouter());

  if (env.nodeEnv === "production") {
    const sourceDirectory = path.dirname(fileURLToPath(import.meta.url));
    const clientDirectory = path.resolve(sourceDirectory, "../../client/dist");

    // Public company-car page: its own build (dist/fleet) so /fleet/ never serves the HR workspace.
    const fleetDirectory = path.join(clientDirectory, "fleet");
    // Non-strict routing would also match "/fleet/" on app.get("/fleet"), so compare the exact path.
    app.use((req, res, next) => { if (req.path === "/fleet") res.redirect(301, `/fleet/${req.url.slice("/fleet".length)}`); else next(); });
    app.use("/fleet", express.static(fleetDirectory, { index: false }));
    app.use("/fleet", (req, res, next) => {
      if (req.method !== "GET") { next(); return; }
      res.set("Cache-Control", "no-store").sendFile("index.html", { root: fleetDirectory }, (error) => { if (error) next(error); });
    });
    app.use(express.static(clientDirectory));
    app.use((req, res, next) => {
      if (req.method !== "GET") {
        next();
        return;
      }

      res.sendFile(path.join(clientDirectory, "index.html"), (error) => {
        if (error) next(error);
      });
    });
  }

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (isMissingDatabaseUrlError(error)) {
      res.status(503).json({
        message: "Database is not configured yet. Set DATABASE_URL in server/.env after installing PostgreSQL."
      });
      return;
    }

    if (error instanceof z.ZodError) {
      res.status(400).json({ message: error.issues[0]?.message ?? "Invalid request.", issues: error.issues });
      return;
    }

    if (error instanceof Error && "status" in error && typeof error.status === "number") {
      res.status(error.status).json({ message: error.message });
      return;
    }

    console.error(error);
    res.status(500).json({
      message: error instanceof Error ? error.message : "Unexpected server error"
    });
  });

  return app;
};
