import cors from "cors";
import express from "express";
import helmet from "helmet";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { env } from "./env.js";
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
  app.use("/api", createRouter());

  if (env.nodeEnv === "production") {
    const sourceDirectory = path.dirname(fileURLToPath(import.meta.url));
    const clientDirectory = path.resolve(sourceDirectory, "../../client/dist");

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
