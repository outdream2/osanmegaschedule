import { prisma } from "./prisma/client";

export async function seedDatabase() {
  try {
    const employeeCount = await prisma.employee.count();
    if (employeeCount === 20) {
      console.log("Database already contains exactly 20 employees. Skipping seed.");
      return;
    }

    console.log(`Current employee count is ${employeeCount} instead of 20. Re-seeding database for Megatown...`);

    await prisma.schedule.deleteMany({});
    await prisma.employee.deleteMany({});

    const demoEmployees = [
      { name: "남성필", position: "부점장", hireDate: "2024-03-01", description: "주6일 일 휴무", workplace: "매장" },
      { name: "권두열", position: "사원", hireDate: "2024-04-15", description: "수목 휴무", workplace: "매장" },
      { name: "조창범", position: "사원(주간)", hireDate: "2024-05-10", description: "3주 목<->토", workplace: "창고" },
      { name: "황덕수", position: "사원", hireDate: "2024-06-20", description: "월화수", workplace: "창고" },
      { name: "신동현", position: "사원(오픈)", hireDate: "2024-08-12", description: "수목 휴무", workplace: "매장" },
      { name: "김민웅", position: "사원", hireDate: "2024-11-01", description: "토일", workplace: "매장" },
      { name: "심성우", position: "사원", hireDate: "2025-01-15", description: "일월", workplace: "매장" },
      { name: "최한별", position: "사원(오픈)", hireDate: "2025-02-10", description: "일월", workplace: "창고" },
      { name: "류승표", position: "사원(오픈)", hireDate: "2025-03-01", description: "평일마감 주말오픈", workplace: "창고" },
      { name: "이윤재", position: "사원(오픈)", hireDate: "2025-04-05", description: "토일", workplace: "매장" },
      { name: "설동원", position: "사원(마감)", hireDate: "2025-05-12", description: "월화", workplace: "매장" },
      { name: "김준혁", position: "사원(마감)", hireDate: "2025-06-18", description: "금일", workplace: "창고" },
      { name: "송윤섭", position: "사원(마감)", hireDate: "2025-08-01", description: "월화", workplace: "창고" },
      { name: "이종민", position: "사원(마감)", hireDate: "2025-10-10", description: "화수", workplace: "매장" },
      { name: "윤지훈", position: "사원(주말)", hireDate: "2025-11-15", description: "토일", workplace: "매장" },
      { name: "임형수", position: "사원(주말)", hireDate: "2026-01-20", description: "일월", workplace: "창고" },
      { name: "김대영", position: "사원(주간)", hireDate: "2026-02-01", description: "평일오픈", workplace: "매장" },
      { name: "안원규", position: "사원(마감)", hireDate: "2026-03-10", description: "주말마감", workplace: "창고" },
      { name: "양광식", position: "사원", hireDate: "2026-04-01", description: "주3일", workplace: "매장" },
      { name: "조민우", position: "일용직", hireDate: "2026-05-01", description: "주변동", workplace: "매장" },
    ];

    const createdEmployees = [];
    for (const emp of demoEmployees) {
      const created = await prisma.employee.create({ data: emp });
      createdEmployees.push(created);
    }

    console.log("Seeding realistic retail schedules for May 2026...");
    const year = 2026;
    const month = 5;
    const totalDays = 31;

    for (let day = 1; day <= totalDays; day++) {
      const dayStr = String(day).padStart(2, "0");
      const dateStr = `${year}-05-${dayStr}`;
      const dayIndex = new Date(year, month - 1, day).getDay();

      for (let i = 0; i < createdEmployees.length; i++) {
        const emp = createdEmployees[i];
        let type = "휴무";
        let workingHours = "";
        let actualHours = "";

        if (i < 5) {
          const worksSunday = emp.description !== "주6일 일 휴무" && emp.description !== "일월";
          const worksWednesday = emp.description !== "수목 휴무";
          const worksThursday = emp.description !== "수목 휴무" && emp.description !== "3주 목<->토";

          let isRestDay = false;
          if (dayIndex === 0 && !worksSunday) isRestDay = true;
          if (dayIndex === 3 && !worksWednesday) isRestDay = true;
          if (dayIndex === 4 && !worksThursday) isRestDay = true;
          if (dayIndex === 3 && emp.name === "남성필") isRestDay = true;

          if (isRestDay) {
            type = "휴무";
          } else {
            type = "오픈";
            workingHours = "09:30-18:30";
            if (day % 15 === 0) {
              type = "월차";
              actualHours = "월차";
              workingHours = "";
            } else if (day === 11 && emp.name === "남성필") {
              type = "월차";
              actualHours = "필자";
              workingHours = "";
            } else if (dayIndex === 5 && day === 22) {
              actualHours = "2시간 연장";
            } else if (dayIndex === 6 && day === 23) {
              actualHours = "2시간 연장";
            }
          }
        } else if (i < 10) {
          let isRestDay = false;
          if (emp.description === "토일" && (dayIndex !== 6 && dayIndex !== 0)) isRestDay = true;
          if (emp.description === "일월" && (dayIndex === 0 || dayIndex === 1)) isRestDay = true;
          if (dayIndex === 2) isRestDay = true;

          if (isRestDay) {
            type = "휴무";
          } else {
            type = "미들";
            workingHours = "11:00-20:00";
            if (day === 12 && emp.name === "류승표") {
              type = "오전반차";
              workingHours = "09:30-13:30";
              actualHours = "오전반차";
            } else if (day === 21) {
              type = "지정휴무";
              workingHours = "";
            }
          }
        } else if (i < 17) {
          let isRestDay = false;
          if (emp.description === "월화" && (dayIndex === 1 || dayIndex === 2)) isRestDay = true;
          if (emp.description === "화수" && (dayIndex === 2 || dayIndex === 3)) isRestDay = true;
          if (emp.description === "금일" && (dayIndex === 5 || dayIndex === 0)) isRestDay = true;
          if (emp.description === "토일" && (dayIndex !== 6 && dayIndex !== 0)) isRestDay = true;
          if (emp.description === "일월" && (dayIndex === 0 || dayIndex === 1)) isRestDay = true;

          if (isRestDay) {
            type = "휴무";
          } else {
            type = "마감";
            workingHours = "13:00-22:00";
            if (dayIndex >= 1 && dayIndex <= 4 && (day % 3 === 0)) {
              workingHours = "10-20";
              actualHours = "10-20";
            }
            if (day === 24 && emp.name === "이종민") {
              type = "지정휴무";
              workingHours = "";
            }
          }
        } else {
          if (emp.name === "조민우") {
            const works = (dayIndex === 0 || dayIndex === 6 || day === 1 || day === 5 || day === 15 || day === 25);
            if (works) {
              type = "오픈";
              workingHours = "09:30-18:30";
              if (day === 30 || day === 31) {
                type = "마감";
                workingHours = "13:00-22:00";
                actualHours = "같은";
              }
            } else {
              type = "휴무";
            }
          } else if (emp.description === "주말마감") {
            const isWeekend = (dayIndex === 6 || dayIndex === 0);
            if (isWeekend) {
              type = "마감";
              workingHours = "13:00-22:00";
            } else {
              type = "휴무";
            }
          } else {
            const works = (dayIndex === 1 || dayIndex === 3 || dayIndex === 5);
            if (works) {
              type = "미들";
              workingHours = "11:00-20:00";
            } else {
              type = "휴무";
            }
          }
        }

        await prisma.schedule.create({
          data: { employeeId: emp.id, date: dateStr, type, workingHours, actualHours },
        });
      }
    }

    console.log("Database successfully populated with exactly 20 employees and their May 2026 schedules!");
  } catch (error) {
    console.error("Failed to seed database:", error);
  }
}
