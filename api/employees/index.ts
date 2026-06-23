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
    const { name, position, employmentType, hireDate, description, workplace } = req.body;
    if (!name || !position)
      return res.status(400).json({ error: "name and position are required" });
    const result = await scheduleService.createEmployee({
      name, position,
      employmentType: employmentType || "정직원",
      hireDate: hireDate || new Date().toISOString().split("T")[0],
      description: description || "",
      workplace: workplace || "매장",
    });
    return res.status(214).json(result);
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
}
