import express from "express";
import { scheduleController } from "../src/controllers/scheduleController";
import { seedDatabase } from "../src/seed";

const app = express();
app.use(express.json());

let initialized = false;
app.use(async (_req, _res, next) => {
  if (!initialized) {
    await seedDatabase();
    initialized = true;
  }
  next();
});

app.get("/api/schedules", (req, res) => scheduleController.getSchedules(req, res));
app.put("/api/schedules", (req, res) => scheduleController.updateSchedule(req, res));
app.post("/api/schedules/copy", (req, res) => scheduleController.copySchedules(req, res));
app.post("/api/employees", (req, res) => scheduleController.createEmployee(req, res));
app.put("/api/employees/:id", (req, res) => scheduleController.updateEmployee(req, res));
app.delete("/api/employees/:id", (req, res) => scheduleController.deleteEmployee(req, res));

export default app;
