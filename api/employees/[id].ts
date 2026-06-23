import type { VercelRequest, VercelResponse } from "@vercel/node";
import { scheduleService } from "../../src/services/scheduleService";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const id = parseInt(req.query.id as string);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid employee ID" });

  try {
    if (req.method === "PUT") {
      const { name, position, employmentType, hireDate, description, workplace } = req.body;
      const result = await scheduleService.updateEmployee(id, {
        name, position,
        employmentType: employmentType || "정직원",
        hireDate,
        description: description || "",
        workplace: workplace || "매장",
      });
      return res.json(result);
    }

    if (req.method === "DELETE") {
      await scheduleService.deleteEmployee(id);
      return res.json({ message: "Employee deleted successfully" });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
}
