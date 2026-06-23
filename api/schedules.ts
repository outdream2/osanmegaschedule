import type { VercelRequest, VercelResponse } from "@vercel/node";
import { scheduleService } from "../src/services/scheduleService";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, PUT, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    if (req.method === "GET") {
      const year = req.query.year ? parseInt(req.query.year as string) : new Date().getFullYear();
      const month = req.query.month ? parseInt(req.query.month as string) : new Date().getMonth() + 1;
      if (isNaN(year) || isNaN(month) || month < 1 || month > 12)
        return res.status(400).json({ error: "Invalid year or month" });
      const result = await scheduleService.getMonthlySchedule(year, month);
      return res.json(result);
    }

    if (req.method === "PUT") {
      const { employeeId, date, type, workingHours, actualHours, memo } = req.body;
      if (!employeeId || !date || type === undefined)
        return res.status(400).json({ error: "Missing required fields" });
      const result = await scheduleService.updateOrCreateSchedule({
        employeeId: parseInt(employeeId),
        date, type,
        workingHours: workingHours || "",
        actualHours: actualHours || "",
        memo,
      });
      return res.json(result);
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
}
