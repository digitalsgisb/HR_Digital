import { createApp } from "./app.js";
import { env } from "./env.js";

import { startTrainingEmailWorker } from "./training-email.js";

import { startAttendanceWorker } from "./attendance.js";
import { startFleetWorker } from "./fleet-worker.js";

const app = createApp();
startAttendanceWorker();
startTrainingEmailWorker();
startFleetWorker();

app.listen(env.port, () => {
  console.log(`HR Training Tracker API listening on http://localhost:${env.port}`);
});
