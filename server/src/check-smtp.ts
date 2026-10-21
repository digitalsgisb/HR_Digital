import { emailTestService } from "./email-test.js";

const state = emailTestService.status();
if (state.mode !== "smtp") {
  console.error("SMTP is not enabled. Run npm run smtp:setup:gmail first, or configure server/.env.");
  process.exitCode = 1;
} else if (!state.ready) {
  console.error(state.issues.join("\n"));
  process.exitCode = 1;
} else {
  try { console.log((await emailTestService.verify()).message); }
  catch (error) { console.error(error instanceof Error ? error.message : "SMTP connection failed."); process.exitCode = 1; }
}
