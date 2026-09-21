import { createApp } from "./app.js";
import { env } from "./env.js";

const app = createApp();

app.listen(env.port, () => {
  console.log(`HR Training Tracker API listening on http://localhost:${env.port}`);
});
