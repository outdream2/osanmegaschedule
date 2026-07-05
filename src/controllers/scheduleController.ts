// src/controllers/scheduleController.ts
import { Request, Response } from "express";
import { scheduleService } from "../services/scheduleService";

export class ScheduleController {
  /**
   * GET /api/schedules
   * Query params: year (default current year), month (default current month)
   */
  async getSchedules(req: Request, res: Response): Promise<void> {
    try {
      const year = req.query.year ? parseInt(req.query.year as string) : new Date().getFullYear();
      const month = req.query.month ? parseInt(req.query.month as string) : new Date().getMonth() + 1;

      if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
        res.status(400).json({ error: "Invalid year or month parameters" });
        return;
      }

      const result = await scheduleService.getMonthlySchedule(year, month);
      res.json(result);
    } catch (error: any) {
      console.error("Error in getSchedules controller:", error);
      res.status(500).json({ error: error.message || "Internal server error" });
    }
  }

  /**
   * PUT /api/schedules
   * Body: employeeId (number), date (string), type (string), workingHours (string), actualHours (string), memo (string)
   */
  async updateSchedule(req: Request, res: Response): Promise<void> {
    try {
      const { employeeId, date, type, workingHours, actualHours, memo } = req.body;

      if (!employeeId || !date || type === undefined) {
        res.status(400).json({ error: "Missing required fields: employeeId, date, or type" });
        return;
      }

      const result = await scheduleService.updateOrCreateSchedule({
        employeeId: parseInt(employeeId),
        date,
        type,
        workingHours: workingHours || "",
        actualHours: actualHours || "",
        memo: memo !== undefined ? memo : undefined,
      });

      res.json(result);
    } catch (error: any) {
      console.error("Error in updateSchedule controller:", error);
      res.status(500).json({ error: error.message || "Internal server error" });
    }
  }

  /**
   * POST /api/schedules/batch
   * Body: items (array of schedule objects)
   */
  async batchUpdateSchedules(req: Request, res: Response): Promise<void> {
    try {
      const { items } = req.body;
      if (!Array.isArray(items) || items.length === 0) {
        res.status(400).json({ error: "items must be a non-empty array" });
        return;
      }
      const result = await scheduleService.batchUpdateSchedules(items);
      res.json(result);
    } catch (error: any) {
      console.error("Error in batchUpdateSchedules controller:", error);
      res.status(500).json({ error: error.message || "Internal server error" });
    }
  }

  /**
   * POST /api/schedules/copy
   * Body: targetYear (number), targetMonth (number)
   */
  async copySchedules(req: Request, res: Response): Promise<void> {
    try {
      const { targetYear, targetMonth } = req.body;
      if (!targetYear || !targetMonth) {
        res.status(400).json({ error: "Missing required fields: targetYear or targetMonth" });
        return;
      }

      const result = await scheduleService.copySchedulesFromPreviousMonth(
        parseInt(targetYear),
        parseInt(targetMonth)
      );
      res.json(result);
    } catch (error: any) {
      console.error("Error in copySchedules controller:", error);
      res.status(500).json({ error: error.message || "Internal server error" });
    }
  }

  /**
   * POST /api/employees
   * Body: name (string), position (string), hireDate (string), description (string), workplace (string)
   */
  async createEmployee(req: Request, res: Response): Promise<void> {
    try {
      const { name, position, employmentType, hireDate, description, workplace, rank, gender, phone, annual_leave_days, level } = req.body;
      if (!name || !position) {
        res.status(400).json({ error: "name and position are required fields" });
        return;
      }

      const result = await scheduleService.createEmployee({
        name,
        position,
        employmentType: employmentType || "정직원",
        hireDate: hireDate || new Date().toISOString().split("T")[0],
        description: description || "",
        workplace: workplace || "매장",
        rank: rank ?? null,
        gender: gender ?? null,
        phone: phone ? phone.trim().replace(/[^0-9]/g, "") || null : null,
        annual_leave_days: annual_leave_days != null ? Number(annual_leave_days) : undefined,
        level: level != null ? Number(level) : 1,
      });

      res.status(201).json(result);
    } catch (error: any) {
      console.error("Error causing employee creation failure:", error);
      res.status(500).json({ error: error.message || "Internal server error" });
    }
  }

  /**
   * PUT /api/employees/:id
   */
  async updateEmployee(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      const { name, position, employmentType, hireDate, description, workplace, rank, gender, phone, annual_leave_days, level } = req.body;

      if (isNaN(id)) {
        res.status(400).json({ error: "Invalid employee ID" });
        return;
      }

      const result = await scheduleService.updateEmployee(id, {
        name,
        position,
        employmentType: employmentType || "정직원",
        hireDate,
        description: description || "",
        workplace: workplace || "매장",
        rank: rank ?? null,
        gender: gender ?? null,
        phone: phone !== undefined ? (phone ? phone.trim().replace(/[^0-9]/g, "") || null : null) : undefined,
        annual_leave_days: annual_leave_days != null ? Number(annual_leave_days) : undefined,
        level: level != null ? Number(level) : undefined,
      });
      res.json(result);
    } catch (error: any) {
      console.error("Error in updateEmployee controller:", error);
      res.status(500).json({ error: error.message || "Internal server error" });
    }
  }

  /**
   * DELETE /api/employees/:id
   */
  async deleteEmployee(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);

      if (isNaN(id)) {
        res.status(400).json({ error: "Invalid employee ID" });
        return;
      }

      await scheduleService.deleteEmployee(id);
      res.json({ message: "Employee deleted successfully" });
    } catch (error: any) {
      console.error("Error in deleteEmployee controller:", error);
      res.status(500).json({ error: error.message || "Internal server error" });
    }
  }
}

export const scheduleController = new ScheduleController();
