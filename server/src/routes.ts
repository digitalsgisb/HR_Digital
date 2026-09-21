import { Router, type Request, type Response, type NextFunction } from "express";
import multer from "multer";
import { z } from "zod";
import {
  completionStatuses,
  employeeStatuses,
  type DashboardSummary
} from "@hr-training/shared";
import { prisma } from "./prisma.js";
import { parseEmployeeImport } from "./importer.js";
import { summarizeCourseHours, summarizeDepartmentHours, type CompletionRecordForSummary } from "./dashboard-summary.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const asyncHandler =
  (handler: (req: Request, res: Response, next: NextFunction) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => {
    handler(req, res, next).catch(next);
  };

const departmentCode = (name: string) =>
  name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32);

const routeParam = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value ?? "");

const nullableText = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((value) => (value ? value : undefined));

const employeeInputSchema = z.object({
  employeeId: z.string().trim().min(1),
  name: nullableText,
  email: nullableText,
  department: z.string().trim().min(1),
  line: nullableText,
  role: nullableText,
  status: z.enum(employeeStatuses).default("ACTIVE")
});

const employeeImportCommitSchema = z.object({
  rows: z.array(
    z.object({
      employeeId: z.string().trim().min(1),
      name: nullableText,
      department: z.string().trim().min(1),
      line: nullableText,
      role: nullableText,
      status: z.enum(employeeStatuses).default("ACTIVE")
    })
  )
});

const courseInputSchema = z.object({
  code: z.string().trim().min(1),
  name: z.string().trim().min(1),
  defaultHours: z.coerce.number().min(0).default(0),
  category: nullableText,
  status: z.enum(["ACTIVE", "ARCHIVED"]).default("ACTIVE")
});

const sessionInputSchema = z.object({
  courseId: z.string().trim().min(1),
  dateStart: z.string().datetime(),
  dateEnd: z.string().datetime().optional().nullable(),
  trainerName: nullableText,
  scopeType: z.enum(["INDIVIDUAL", "DEPARTMENT", "LINE", "ROLE", "CUSTOM"]).default("CUSTOM"),
  scopeValue: nullableText,
  notes: nullableText,
  participantEmployeeIds: z.array(z.string().trim().min(1)).default([])
});

const bulkCompletionSchema = z.object({
  employeeIds: z.array(z.string().trim().min(1)).min(1),
  status: z.enum(completionStatuses),
  hours: z.coerce.number().min(0).default(0),
  completedAt: z.string().datetime().optional().nullable()
});

const upsertDepartment = (name: string) =>
  prisma.department.upsert({
    where: { name },
    update: { code: departmentCode(name) },
    create: { name, code: departmentCode(name) }
  });

export const createRouter = () => {
  const router = Router();

  router.get("/health", (_req, res) => {
    res.json({ ok: true, service: "hr-training-tracker", timestamp: new Date().toISOString() });
  });

  router.get(
    "/dashboard/summary",
    asyncHandler(async (_req, res) => {
      const [
        activeEmployees,
        departments,
        activeCourses,
        sessions,
        completionRecords,
        upcomingSessions,
        recentCompletions
      ] = await Promise.all([
        prisma.employee.count({ where: { status: "ACTIVE" } }),
        prisma.department.count(),
        prisma.trainingCourse.count({ where: { status: "ACTIVE" } }),
        prisma.trainingSession.count(),
        prisma.trainingCompletion.findMany({
          include: {
            employee: { include: { department: true } },
            session: { include: { course: true } }
          }
        }),
        prisma.trainingSession.findMany({
          where: { dateStart: { gte: new Date() } },
          include: { course: true, _count: { select: { completions: true } } },
          orderBy: { dateStart: "asc" },
          take: 5
        }),
        prisma.trainingCompletion.findMany({
          where: { completedAt: { not: null } },
          include: {
            employee: { include: { department: true } },
            session: { include: { course: true } }
          },
          orderBy: { completedAt: "desc" },
          take: 8
        })
      ]);

      const recordsForSummary: CompletionRecordForSummary[] = completionRecords.map((record) => ({
        department: record.employee.department.name,
        employeeId: record.employee.employeeId,
        courseName: record.session.course.name,
        status: record.status,
        hours: record.hours
      }));

      const totalTrainingHours = completionRecords
        .filter((record) => record.status === "COMPLETED")
        .reduce((total, record) => total + record.hours, 0);

      const completionByStatus = completionStatuses.map((status) => ({
        status,
        count: completionRecords.filter((record) => record.status === status).length
      }));

      const summary: DashboardSummary = {
        stats: {
          activeEmployees,
          departments,
          activeCourses,
          sessions,
          completedRecords: completionRecords.filter((record) => record.status === "COMPLETED").length,
          totalTrainingHours: Number(totalTrainingHours.toFixed(2))
        },
        departmentHours: summarizeDepartmentHours(recordsForSummary),
        completionByStatus,
        courseHours: summarizeCourseHours(recordsForSummary),
        upcomingSessions: upcomingSessions.map((session) => ({
          id: session.id,
          courseName: session.course.name,
          dateStart: session.dateStart.toISOString(),
          trainerName: session.trainerName,
          participantCount: session._count.completions
        })),
        recentCompletions: recentCompletions.map((record) => ({
          id: record.id,
          employeeId: record.employee.employeeId,
          employeeName: record.employee.name,
          courseName: record.session.course.name,
          department: record.employee.department.name,
          status: record.status,
          hours: record.hours,
          completedAt: record.completedAt?.toISOString() ?? null
        }))
      };

      res.json(summary);
    })
  );

  router.get(
    "/departments",
    asyncHandler(async (_req, res) => {
      const departments = await prisma.department.findMany({ orderBy: { name: "asc" } });
      res.json(departments);
    })
  );

  router.get(
    "/employees",
    asyncHandler(async (req, res) => {
      const search = String(req.query.search ?? "").trim();
      const departmentId = String(req.query.departmentId ?? "").trim();
      const employees = await prisma.employee.findMany({
        where: {
          ...(departmentId ? { departmentId } : {}),
          ...(search
            ? {
                OR: [
                  { employeeId: { contains: search, mode: "insensitive" } },
                  { name: { contains: search, mode: "insensitive" } }
                ]
              }
            : {})
        },
        include: { department: true },
        orderBy: { employeeId: "asc" },
        take: 250
      });
      res.json(employees);
    })
  );

  router.post(
    "/employees",
    asyncHandler(async (req, res) => {
      const input = employeeInputSchema.parse(req.body);
      const department = await upsertDepartment(input.department);
      const employee = await prisma.employee.create({
        data: {
          employeeId: input.employeeId,
          name: input.name,
          email: input.email,
          departmentId: department.id,
          line: input.line,
          role: input.role,
          status: input.status
        },
        include: { department: true }
      });
      res.status(201).json(employee);
    })
  );

  router.put(
    "/employees/:id",
    asyncHandler(async (req, res) => {
      const input = employeeInputSchema.parse(req.body);
      const id = routeParam(req.params.id);
      const department = await upsertDepartment(input.department);
      const employee = await prisma.employee.update({
        where: { id },
        data: {
          employeeId: input.employeeId,
          name: input.name,
          email: input.email,
          departmentId: department.id,
          line: input.line,
          role: input.role,
          status: input.status
        },
        include: { department: true }
      });
      res.json(employee);
    })
  );

  router.delete(
    "/employees/:id",
    asyncHandler(async (req, res) => {
      const id = routeParam(req.params.id);
      const employee = await prisma.employee.update({
        where: { id },
        data: { status: "INACTIVE" }
      });
      res.json(employee);
    })
  );

  router.post(
    "/employees/import/preview",
    upload.single("file"),
    asyncHandler(async (req, res) => {
      if (!req.file) {
        res.status(400).json({ message: "Upload a CSV or Excel file." });
        return;
      }

      res.json(await parseEmployeeImport(req.file.buffer, req.file.originalname));
    })
  );

  router.post(
    "/employees/import/commit",
    asyncHandler(async (req, res) => {
      const input = employeeImportCommitSchema.parse(req.body);

      const result = await prisma.$transaction(async (tx) => {
        let imported = 0;

        for (const row of input.rows) {
          const department = await tx.department.upsert({
            where: { name: row.department },
            update: { code: departmentCode(row.department) },
            create: { name: row.department, code: departmentCode(row.department) }
          });

          await tx.employee.upsert({
            where: { employeeId: row.employeeId },
            update: {
              name: row.name,
              departmentId: department.id,
              line: row.line,
              role: row.role,
              status: row.status
            },
            create: {
              employeeId: row.employeeId,
              name: row.name,
              departmentId: department.id,
              line: row.line,
              role: row.role,
              status: row.status
            }
          });

          imported += 1;
        }

        return imported;
      });

      res.json({ imported: result });
    })
  );

  router.get(
    "/training-courses",
    asyncHandler(async (_req, res) => {
      const courses = await prisma.trainingCourse.findMany({ orderBy: { name: "asc" } });
      res.json(courses);
    })
  );

  router.post(
    "/training-courses",
    asyncHandler(async (req, res) => {
      const input = courseInputSchema.parse(req.body);
      const course = await prisma.trainingCourse.create({ data: input });
      res.status(201).json(course);
    })
  );

  router.put(
    "/training-courses/:id",
    asyncHandler(async (req, res) => {
      const input = courseInputSchema.parse(req.body);
      const id = routeParam(req.params.id);
      const course = await prisma.trainingCourse.update({ where: { id }, data: input });
      res.json(course);
    })
  );

  router.delete(
    "/training-courses/:id",
    asyncHandler(async (req, res) => {
      const id = routeParam(req.params.id);
      const course = await prisma.trainingCourse.update({
        where: { id },
        data: { status: "ARCHIVED" }
      });
      res.json(course);
    })
  );

  router.get(
    "/training-sessions",
    asyncHandler(async (_req, res) => {
      const sessions = await prisma.trainingSession.findMany({
        include: { course: true, _count: { select: { completions: true } } },
        orderBy: { dateStart: "desc" },
        take: 100
      });
      res.json(sessions);
    })
  );

  router.post(
    "/training-sessions",
    asyncHandler(async (req, res) => {
      const input = sessionInputSchema.parse(req.body);
      const session = await prisma.$transaction(async (tx) => {
        const created = await tx.trainingSession.create({
          data: {
            courseId: input.courseId,
            dateStart: new Date(input.dateStart),
            dateEnd: input.dateEnd ? new Date(input.dateEnd) : undefined,
            trainerName: input.trainerName,
            scopeType: input.scopeType,
            scopeValue: input.scopeValue,
            notes: input.notes
          }
        });

        if (input.participantEmployeeIds.length > 0) {
          await tx.trainingCompletion.createMany({
            data: input.participantEmployeeIds.map((employeeId) => ({
              employeeId,
              sessionId: created.id,
              status: "REQUIRED" as const
            })),
            skipDuplicates: true
          });
        }

        return tx.trainingSession.findUniqueOrThrow({
          where: { id: created.id },
          include: { course: true, _count: { select: { completions: true } } }
        });
      });

      res.status(201).json(session);
    })
  );

  router.get(
    "/training-sessions/:id",
    asyncHandler(async (req, res) => {
      const id = routeParam(req.params.id);
      const session = await prisma.trainingSession.findUniqueOrThrow({
        where: { id },
        include: {
          course: true,
          completions: {
            include: { employee: { include: { department: true } } },
            orderBy: { employee: { employeeId: "asc" } }
          }
        }
      });
      res.json(session);
    })
  );

  router.put(
    "/training-sessions/:id",
    asyncHandler(async (req, res) => {
      const input = sessionInputSchema.parse(req.body);
      const id = routeParam(req.params.id);
      const session = await prisma.trainingSession.update({
        where: { id },
        data: {
          courseId: input.courseId,
          dateStart: new Date(input.dateStart),
          dateEnd: input.dateEnd ? new Date(input.dateEnd) : null,
          trainerName: input.trainerName,
          scopeType: input.scopeType,
          scopeValue: input.scopeValue,
          notes: input.notes
        },
        include: { course: true, _count: { select: { completions: true } } }
      });
      res.json(session);
    })
  );

  router.delete(
    "/training-sessions/:id",
    asyncHandler(async (req, res) => {
      const id = routeParam(req.params.id);
      await prisma.trainingCompletion.deleteMany({ where: { sessionId: id } });
      await prisma.trainingSession.delete({ where: { id } });
      res.status(204).send();
    })
  );

  router.post(
    "/training-sessions/:id/completions/bulk",
    asyncHandler(async (req, res) => {
      const input = bulkCompletionSchema.parse(req.body);
      const id = routeParam(req.params.id);

      await prisma.$transaction(
        input.employeeIds.map((employeeId) =>
          prisma.trainingCompletion.upsert({
            where: { employeeId_sessionId: { employeeId, sessionId: id } },
            update: {
              status: input.status,
              hours: input.hours,
              completedAt: input.completedAt ? new Date(input.completedAt) : input.status === "COMPLETED" ? new Date() : null
            },
            create: {
              employeeId,
              sessionId: id,
              status: input.status,
              hours: input.hours,
              completedAt: input.completedAt ? new Date(input.completedAt) : input.status === "COMPLETED" ? new Date() : null
            }
          })
        )
      );

      res.json({ updated: input.employeeIds.length });
    })
  );

  return router;
};
