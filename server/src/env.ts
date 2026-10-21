import dotenv from "dotenv";

dotenv.config();

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.SERVER_PORT ?? 4000),
  clientOrigin: process.env.CLIENT_ORIGIN ?? "http://localhost:5173",
  trustProxy: process.env.TRUST_PROXY === "true",
  databaseUrl: process.env.DATABASE_URL,
  ollamaBaseUrl: process.env.OLLAMA_BASE_URL?.trim() ?? "",
  ollamaVisionModel: process.env.OLLAMA_VISION_MODEL?.trim() ?? "",
  emailTransport: process.env.EMAIL_TRANSPORT ?? (process.env.SMTP_HOST?.trim() ? "smtp" : "preview"),
  smtpHost: process.env.SMTP_HOST?.trim() ?? "",
  smtpPort: Number(process.env.SMTP_PORT ?? 587),
  smtpSecure: process.env.SMTP_SECURE === undefined ? Number(process.env.SMTP_PORT ?? 587) === 465 : process.env.SMTP_SECURE === "true",
  smtpRequireTls: process.env.SMTP_REQUIRE_TLS === undefined ? !["localhost", "127.0.0.1", "::1"].includes(process.env.SMTP_HOST?.trim() ?? "") : process.env.SMTP_REQUIRE_TLS === "true",
  smtpUser: process.env.SMTP_USER ?? "",
  smtpPassword: process.env.SMTP_PASSWORD ?? "",
  smtpFrom: process.env.SMTP_FROM?.trim() || "HR Digital <developer@hr-digital.test>",
  smtpTestRecipients: (process.env.SMTP_TEST_RECIPIENTS ?? "").split(",").map((value) => value.trim().toLowerCase()).filter(Boolean)
};
