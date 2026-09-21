import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const departments = [
  "Production",
  "Research & Development",
  "Quality Management",
  "HR & Admin",
  "Maintenance & Facilities",
  "Supply Chain"
];

const departmentCode = (name: string) =>
  name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32);

const main = async () => {
  const departmentRows = await Promise.all(
    departments.map((name) =>
      prisma.department.upsert({
        where: { name },
        update: { code: departmentCode(name) },
        create: { name, code: departmentCode(name) }
      })
    )
  );

  const departmentByName = new Map(departmentRows.map((department) => [department.name, department]));

  const employeeInputs = [
    { employeeId: "EMP001", name: "Muhammad Muqri", department: "Production", line: "Line A", role: "Operator" },
    { employeeId: "EMP002", name: "Abd Rahman", department: "Production", line: "Line A", role: "Operator" },
    { employeeId: "EMP003", name: "Siti Nor", department: "Quality Management", role: "QA Inspector" },
    { employeeId: "EMP004", name: "Tan Jia", department: "HR & Admin", role: "HR Executive" },
    { employeeId: "EMP005", name: "Mohd Sallehuddin", department: "Maintenance & Facilities", role: "Technician" }
  ];

  for (const employee of employeeInputs) {
    const department = departmentByName.get(employee.department);
    if (!department) continue;

    await prisma.employee.upsert({
      where: { employeeId: employee.employeeId },
      update: {
        name: employee.name,
        departmentId: department.id,
        line: "line" in employee ? employee.line : undefined,
        role: employee.role,
        status: "ACTIVE"
      },
      create: {
        employeeId: employee.employeeId,
        name: employee.name,
        departmentId: department.id,
        line: "line" in employee ? employee.line : undefined,
        role: employee.role,
        status: "ACTIVE"
      }
    });
  }

  const courses = [
    { code: "TRN-GMP", name: "GMP Refresher", defaultHours: 8, category: "Mandatory" },
    { code: "TRN-APP", name: "AppSheet Training", defaultHours: 8, category: "System" },
    { code: "TRN-SAF", name: "Workplace Safety", defaultHours: 4, category: "Safety" }
  ];

  for (const course of courses) {
    await prisma.trainingCourse.upsert({
      where: { code: course.code },
      update: course,
      create: course
    });
  }

  const gmp = await prisma.trainingCourse.findUniqueOrThrow({ where: { code: "TRN-GMP" } });
  const employees = await prisma.employee.findMany({ take: 4 });

  const session = await prisma.trainingSession.create({
    data: {
      courseId: gmp.id,
      dateStart: new Date(),
      trainerName: "HR Training Team",
      scopeType: "DEPARTMENT",
      scopeValue: "Production",
      notes: "Seed session for dashboard preview."
    }
  });

  await prisma.trainingCompletion.createMany({
    data: employees.map((employee, index) => ({
      employeeId: employee.id,
      sessionId: session.id,
      status: index < 3 ? "COMPLETED" : "REQUIRED",
      hours: index < 3 ? gmp.defaultHours : 0,
      completedAt: index < 3 ? new Date() : null
    })),
    skipDuplicates: true
  });
};

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
