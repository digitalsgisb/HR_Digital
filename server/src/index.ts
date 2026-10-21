import { createApp } from "./app.js";
import { env } from "./env.js";

import { startTrainingEmailWorker } from "./training-email.js";

const app = createApp();
startTrainingEmailWorker();

app.listen(env.port, () => {
  console.log(`HR Training Tracker API listening on http://localhost:${env.port}`);
});
