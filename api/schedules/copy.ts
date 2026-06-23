import type { VercelRequest, VercelResponse } from "@vercel/node";
import { scheduleService } from "../../src/services/scheduleService";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  try {
    const { targetYear, targetMonth } = req.body;
    if (!targetYear || !targetMonth)
      return res.status(400).json({ error: "Missing targetYear or targetMonth" });
    const result = await scheduleService.copySchedulesFromPreviousMonth(
      parseInt(targetYear),
      parseInt(targetMonth)
    );
    return res.json(result);
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
}
