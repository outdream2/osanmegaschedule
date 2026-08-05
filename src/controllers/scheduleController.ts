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
      const { name, position, employmentType, hireDate, retireDate, description, workplace, rank, gender, phone, annual_leave_days, level, address } = req.body;
      if (!name || !position) {
        res.status(400).json({ error: "name and position are required fields" });
        return;
      }

      const result = await scheduleService.createEmployee({
        name,
        position,
        employmentType: employmentType || "정직원",
        hireDate: hireDate || new Date().toISOString().split("T")[0],
        retireDate: retireDate ?? null,
        description: description || "",
        workplace: workplace || "매장",
        rank: rank ?? null,
        gender: gender ?? null,
        phone: phone ? phone.trim().replace(/[^0-9]/g, "") || null : null,
        annual_leave_days: annual_leave_days != null ? Number(annual_leave_days) : undefined,
        level: level != null ? Number(level) : 1,
        address: address ?? null,
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
      const {
        // 기존 필드
        name, position, employmentType, hireDate, retireDate, description, workplace,
        rank, gender, phone, annual_leave_days, level, address,
        break_time_minutes, break_apply_paid,
        // 신규 HR 필드
        contract_type, contract_start, contract_end, probation_end_date,
        birth_date, emergency_contact_name, emergency_contact_phone, emergency_contact_rel,
        schedule_type, work_area, work_location, job_duties,
        working_hours_per_week, weekly_holiday,
        wage_calc_type, wage_amount, wage_pay_day, wage_pay_method,
        bank_name, bank_account_no,
        insurance_nps_date, insurance_nhis_date, insurance_ei_date, insurance_wcia_date, insurance_excluded,
        pharmacist_license_no, health_check_expiry,
        careers, educations, certifications,
        performance_rating,
      } = req.body;

      if (isNaN(id)) {
        res.status(400).json({ error: "Invalid employee ID" });
        return;
      }

      // 날짜 필드 정규화: "" → null, undefined 는 그대로 유지 (기존 값 유지 목적)
      const normalizeDate = (v: any): string | null | undefined => {
        if (v === undefined) return undefined;
        if (v === null) return null;
        if (typeof v === "string" && v.trim() === "") return null;
        return v;
      };
      // 문자열 필드 정규화: "" → null 로 통일 (empty clear 의도 허용)
      const normalizeStr = (v: any): string | null | undefined => {
        if (v === undefined) return undefined;
        if (v === null) return null;
        if (typeof v === "string" && v.trim() === "") return null;
        return v;
      };
      // 숫자 필드 정규화: undefined 유지, null/"" → null, 그 외 Number
      const normalizeNum = (v: any): number | null | undefined => {
        if (v === undefined) return undefined;
        if (v === null) return null;
        if (typeof v === "string" && v.trim() === "") return null;
        const n = Number(v);
        return isNaN(n) ? null : n;
      };

      const result = await scheduleService.updateEmployee(id, {
        // 기존 필드 (변경 없음)
        name,
        position,
        employmentType: employmentType || "정직원",
        hireDate,
        retireDate: retireDate !== undefined ? (retireDate || null) : undefined,
        description: description || "",
        workplace: workplace || "매장",
        rank: rank ?? null,
        gender: gender ?? null,
        phone: phone !== undefined ? (phone ? phone.trim().replace(/[^0-9]/g, "") || null : null) : undefined,
        annual_leave_days: annual_leave_days != null ? Number(annual_leave_days) : undefined,
        level: level != null ? Number(level) : undefined,
        address: address !== undefined ? (address || null) : undefined,
        break_time_minutes: break_time_minutes != null ? Number(break_time_minutes) : undefined,
        break_apply_paid: break_apply_paid !== undefined ? Boolean(break_apply_paid) : undefined,
        // 신규 HR 필드 (undefined 는 payload 에서 제외 → 기존 값 유지)
        contract_type: normalizeStr(contract_type),
        contract_start: normalizeDate(contract_start),
        contract_end: normalizeDate(contract_end),
        probation_end_date: normalizeDate(probation_end_date),
        birth_date: normalizeDate(birth_date),
        emergency_contact_name: normalizeStr(emergency_contact_name),
        emergency_contact_phone: emergency_contact_phone !== undefined
          ? (emergency_contact_phone ? String(emergency_contact_phone).trim().replace(/[^0-9]/g, "") || null : null)
          : undefined,
        emergency_contact_rel: normalizeStr(emergency_contact_rel),
        schedule_type: normalizeStr(schedule_type),
        work_area: normalizeStr(work_area),
        work_location: normalizeStr(work_location),
        job_duties: normalizeStr(job_duties),
        working_hours_per_week: normalizeNum(working_hours_per_week),
        weekly_holiday: normalizeStr(weekly_holiday),
        wage_calc_type: normalizeStr(wage_calc_type),
        wage_amount: normalizeNum(wage_amount),
        wage_pay_day: normalizeNum(wage_pay_day),
        wage_pay_method: normalizeStr(wage_pay_method),
        bank_name: normalizeStr(bank_name),
        bank_account_no: normalizeStr(bank_account_no),
        insurance_nps_date: normalizeDate(insurance_nps_date),
        insurance_nhis_date: normalizeDate(insurance_nhis_date),
        insurance_ei_date: normalizeDate(insurance_ei_date),
        insurance_wcia_date: normalizeDate(insurance_wcia_date),
        insurance_excluded: insurance_excluded !== undefined ? Boolean(insurance_excluded) : undefined,
        pharmacist_license_no: normalizeStr(pharmacist_license_no),
        health_check_expiry: normalizeDate(health_check_expiry),
        careers: careers !== undefined ? careers : undefined,
        educations: educations !== undefined ? educations : undefined,
        certifications: certifications !== undefined ? certifications : undefined,
        performance_rating: normalizeStr(performance_rating),
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
