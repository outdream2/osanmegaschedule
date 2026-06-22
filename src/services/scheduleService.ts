// src/services/scheduleService.ts
import { prisma } from "../prisma/client";

export class ScheduleService {
  /**
   * Get employee schedule list and live daily summary for a given year and month
   */
  async getMonthlySchedule(year: number, month: number) {
    const monthStr = String(month).padStart(2, "0");
    const datePrefix = `${year}-${monthStr}-`;

    // 1. Fetch all employees
    const employees = await prisma.employee.findMany({
      orderBy: { id: "asc" },
    });

    // 2. Fetch all schedules for the specified month
    const schedules = await prisma.schedule.findMany({
      where: {
        date: {
          startsWith: datePrefix,
        },
      },
    });

    // 3. Map schedules to employees
    const employeesWithSchedules = employees.map((emp) => {
      const empSchedules = schedules.filter((s) => s.employeeId === emp.id);
      return {
        ...emp,
        schedules: empSchedules,
      };
    });

    // 4. Calculate daily summaries from Day 1 to Day N of the month
    const totalDays = new Date(year, month, 0).getDate();
    const summaryList = [];

    for (let day = 1; day <= totalDays; day++) {
      const dayStr = String(day).padStart(2, "0");
      const currentDate = `${year}-${monthStr}-${dayStr}`;

      // Filter schedules for the current day
      const daySchedules = schedules.filter((s) => s.date === currentDate);

      // Quantify roles
      // Usually "오픈" and "오전반차" might count towards open staffing.
      // But let's strictly count type === "오픈" and type === "마감" as requested.
      const openCount = daySchedules.filter((s) => s.type === "오픈").length;
      const closeCount = daySchedules.filter((s) => s.type === "마감").length;
      const totalCount = openCount + closeCount;

      summaryList.push({
        day,
        date: currentDate,
        openCount,
        closeCount,
        totalCount,
      });
    }

    return {
      employees: employeesWithSchedules,
      summary: summaryList,
    };
  }

  /**
   * Upsert a schedule setting (creates if missing, updates if exists)
   */
  async updateOrCreateSchedule(data: {
    employeeId: number;
    date: string;
    type: string;
    workingHours: string;
    actualHours: string;
    memo?: string;
  }) {
    const { employeeId, date, type, workingHours, actualHours, memo } = data;

    return await prisma.schedule.upsert({
      where: {
        employeeId_date: {
          employeeId,
          date,
        },
      },
      update: {
        type,
        workingHours,
        actualHours,
        ...(memo !== undefined ? { memo } : {}),
      },
      create: {
        employeeId,
        date,
        type,
        workingHours,
        actualHours,
        memo: memo || "",
      },
    });
  }

  /**
   * Copy schedules of all active employees from previous month to target month
   */
  async copySchedulesFromPreviousMonth(targetYear: number, targetMonth: number) {
    let prevYear = targetYear;
    let prevMonth = targetMonth - 1;
    if (prevMonth === 0) {
      prevMonth = 12;
      prevYear = targetYear - 1;
    }

    const prevMonthStr = String(prevMonth).padStart(2, "0");
    const targetMonthStr = String(targetMonth).padStart(2, "0");
    const prevPrefix = `${prevYear}-${prevMonthStr}-`;

    const prevSchedules = await prisma.schedule.findMany({
      where: {
        date: {
          startsWith: prevPrefix,
        },
      },
    });

    const created = [];
    const targetMaxDays = new Date(targetYear, targetMonth, 0).getDate();

    for (const sched of prevSchedules) {
      const parts = sched.date.split("-");
      const day = parseInt(parts[2]);
      if (isNaN(day) || day > targetMaxDays) continue;

      const targetDate = `${targetYear}-${targetMonthStr}-${String(day).padStart(2, "0")}`;

      const newSched = await prisma.schedule.upsert({
        where: {
          employeeId_date: {
            employeeId: sched.employeeId,
            date: targetDate,
          },
        },
        update: {
          type: sched.type,
          workingHours: sched.workingHours,
          actualHours: sched.actualHours,
          memo: sched.memo,
        },
        create: {
          employeeId: sched.employeeId,
          date: targetDate,
          type: sched.type,
          workingHours: sched.workingHours,
          actualHours: sched.actualHours,
          memo: sched.memo,
        },
      });
      created.push(newSched);
    }

    return { count: created.length };
  }

  /**
   * Helper to create/delete employees for complete management
   */
  async createEmployee(data: { name: string; position: string; hireDate: string; description: string; workplace?: string }) {
    return await prisma.employee.create({
      data: {
        ...data,
        workplace: data.workplace || "매장",
      },
    });
  }

  async updateEmployee(id: number, data: { name: string; position: string; hireDate: string; description: string; workplace?: string }) {
    return await prisma.employee.update({
      where: { id },
      data: {
        ...data,
        workplace: data.workplace || "매장",
      },
    });
  }

  async deleteEmployee(id: number) {
    return await prisma.employee.delete({
      where: { id },
    });
  }
}

export const scheduleService = new ScheduleService();
