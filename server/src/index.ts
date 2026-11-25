import { createApp } from "./app.js";
import { env } from "./env.js";

import { startTrainingEmailWorker } from "./training-email.js";

import { startAttendanceWorker } from "./attendance.js";
import { startFleetEmailWorker } from "./fleet-email.js";

const app = createApp();
startAttendanceWorker();
startTrainingEmailWorker();
startFleetEmailWorker();

app.listen(env.port, () => {
  console.log(`HR Training Tracker API listening on http://localhost:${env.port}`);
});
