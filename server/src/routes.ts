import { Router, type Request, type Response, type NextFunction } from "express";
import multer from "multer";
import { z } from "zod";
import {
  completionStatuses,
  employeeStatuses,
  vehicleConditions,
  vehicleStatuses,
  type DashboardSummary
} from "@hr-training/shared";
import { prisma } from "./prisma.js";
import { env } from "./env.js";
import { parseEmployeeImport } from "./importer.js";
import { summarizeCourseHours, summarizeDepartmentHours, type CompletionRecordForSummary } from "./dashboard-summary.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

class HttpError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

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

const beforeChecksSchema = z.object({
  exterior: z.literal(true),
  tyres: z.literal(true),
  lights: z.literal(true),
  documents: z.literal(true)
});

const afterChecksSchema = z.object({
  interiorClean: z.literal(true),
  fuelCardReturned: z.literal(true),
  belongingsRemoved: z.literal(true),
  damageReported: z.boolean()
});

const odometerPhotoSchema = z.string()
  .max(6_000_000, "Odometer photo is too large.")
  .refine((value) => /^data:image\/(jpeg|png|webp);base64,/i.test(value), "A valid odometer photo is required.");

const startVehicleTripSchema = z.object({
  vehicleId: z.string().trim().min(1),
  driverEmployeeId: z.string().trim().min(1),
  driverName: z.string().trim().min(2),
  destination: z.string().trim().min(2),
  purpose: z.string().trim().min(2),
  passengers: z.coerce.number().int().min(1).max(20).default(1),
  odometerStart: z.coerce.number().int().min(0),
  odometerPhotoBefore: odometerPhotoSchema,
  fuelBefore: z.coerce.number().int().min(0).max(100),
  conditionBefore: z.enum(vehicleConditions),
  checksBefore: beforeChecksSchema,
  notesBefore: nullableText
});

const completeVehicleTripSchema = z.object({
  odometerEnd: z.coerce.number().int().min(0),
  odometerPhotoAfter: odometerPhotoSchema,
  fuelAfter: z.coerce.number().int().min(0).max(100),
  conditionAfter: z.enum(vehicleConditions),
  checksAfter: afterChecksSchema,
  notesAfter: nullableText
});

const vehicleInputSchema = z.object({
  plate: z.string().trim().min(2).max(20).transform((value) => value.toUpperCase()),
  model: z.string().trim().min(2).max(100),
  category: z.string().trim().min(2).max(60),
  mileage: z.coerce.number().int().min(0),
  serviceAt: z.coerce.number().int().min(0),
  status: z.enum(vehicleStatuses).refine((status) => status !== "IN_USE", "A vehicle can only be marked in use by starting a trip."),
  assigned: z.string().trim().min(2).max(100)
});

const odometerRecognitionSchema = z.object({
  photo: odometerPhotoSchema,
  minimumMileage: z.coerce.number().int().min(0).default(0)
});

const defaultVehicles = [
  { id: "VH-01", plate: "VBU 2841", model: "Toyota Hilux 2.4", category: "Operations", mileage: 48260, serviceAt: 50000, status: "IN_USE" as const, assigned: "Shared pool" },
  { id: "VH-02", plate: "BKV 9132", model: "Honda City 1.5", category: "Management", mileage: 31780, serviceAt: 35000, status: "AVAILABLE" as const, assigned: "Management" },
  { id: "VH-03", plate: "VFY 6620", model: "Perodua Alza", category: "Staff transport", mileage: 69440, serviceAt: 70000, status: "SERVICE_DUE" as const, assigned: "Shared pool" },
  { id: "VH-04", plate: "BPP 4418", model: "Toyota Hiace", category: "Logistics", mileage: 22510, serviceAt: 25000, status: "AVAILABLE" as const, assigned: "Warehouse" }
];

const ensureFleetData = async () => {
  if (await prisma.vehicle.count()) return;
  await prisma.vehicle.createMany({ data: defaultVehicles, skipDuplicates: true });
  await prisma.vehicleTrip.create({
    data: {
      id: "TRIP-408",
      vehicleId: "VH-01",
      driverEmployeeId: "EMP001",
      driverName: "Muhammad Muqri",
      destination: "Port Klang",
      purpose: "Vendor collection",
      passengers: 1,
      startedAt: new Date("2026-09-21T08:30:00+08:00"),
      odometerStart: 48174,
      fuelBefore: 78,
      conditionBefore: "GOOD",
      checksBefore: { exterior: true, tyres: true, lights: true, documents: true },
      notesBefore: "No visible defects.",
      status: "IN_PROGRESS"
    }
  });
};

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

  router.get(
    "/vehicles",
    asyncHandler(async (_req, res) => {
      await ensureFleetData();
      const vehicleRows = await prisma.vehicle.findMany({
        include: {
          trips: {
            where: { status: "IN_PROGRESS" },
            orderBy: { startedAt: "desc" },
            take: 1
          }
        },
        orderBy: { plate: "asc" }
      });
      res.json(vehicleRows.map(({ trips, ...vehicle }) => ({ ...vehicle, activeTrip: trips[0] ?? null })));
    })
  );

  router.post(
    "/ocr/odometer",
    asyncHandler(async (req, res) => {
      const input = odometerRecognitionSchema.parse(req.body);
      if (!env.ollamaBaseUrl || !env.ollamaVisionModel) {
        throw new HttpError(503, "On-prem vision OCR is not configured.");
      }
      const image = input.photo.replace(/^data:image\/[^;]+;base64,/i, "");
      let response: globalThis.Response;
      try {
        response = await fetch(`${env.ollamaBaseUrl.replace(/\/$/, "")}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: AbortSignal.timeout(90_000),
          body: JSON.stringify({
            model: env.ollamaVisionModel,
            stream: false,
            format: "json",
            options: { temperature: 0 },
            messages: [{
              role: "user",
              content: `Read the vehicle's total ODO mileage from this dashboard photo. Ignore Trip A, Trip B, speedometer and tachometer numbers. The total mileage should not be below ${input.minimumMileage}. Return only JSON with mileage as an integer or null, confidence from 0 to 1, and a short reason.`,
              images: [image]
            }]
          })
        });
      } catch {
        throw new HttpError(503, "On-prem vision service is unavailable; bundled OCR will be used.");
      }
      if (!response.ok) throw new HttpError(502, `On-prem vision service returned ${response.status}.`);
      const payload = await response.json() as { message?: { content?: string } };
      let decoded: unknown;
      try { decoded = JSON.parse(payload.message?.content ?? "{}"); }
      catch { throw new HttpError(502, "On-prem vision service returned an unreadable result."); }
      const result = z.object({ mileage: z.number().int().min(0).nullable(), confidence: z.number().min(0).max(1).default(0), reason: z.string().default("") }).parse(decoded);
      if (result.mileage != null && result.mileage < input.minimumMileage) {
        res.json({ ...result, mileage: null, reason: "Detected value was below the current recorded mileage." });
        return;
      }
      res.json(result);
    })
  );

  router.post(
    "/vehicles",
    asyncHandler(async (req, res) => {
      const input = vehicleInputSchema.parse(req.body);
      const duplicate = await prisma.vehicle.findUnique({ where: { plate: input.plate } });
      if (duplicate) throw new HttpError(409, "A vehicle with this registration number already exists.");
      const vehicle = await prisma.vehicle.create({ data: input });
      res.status(201).json({ ...vehicle, activeTrip: null });
    })
  );

  router.put(
    "/vehicles/:id",
    asyncHandler(async (req, res) => {
      const input = vehicleInputSchema.parse(req.body);
      const id = routeParam(req.params.id);
      const current = await prisma.vehicle.findUnique({
        where: { id },
        include: { trips: { where: { status: "IN_PROGRESS" }, orderBy: { startedAt: "desc" }, take: 1 } }
      });
      if (!current) throw new HttpError(404, "Vehicle not found.");
      const duplicate = await prisma.vehicle.findFirst({ where: { plate: input.plate, NOT: { id } } });
      if (duplicate) throw new HttpError(409, "A vehicle with this registration number already exists.");
      const activeTrip = current.trips[0] ?? null;
      if (activeTrip && input.mileage < activeTrip.odometerStart) {
        throw new HttpError(400, `Mileage cannot be below this active trip's starting odometer (${activeTrip.odometerStart} km).`);
      }
      const vehicle = await prisma.vehicle.update({
        where: { id },
        data: { ...input, status: activeTrip ? "IN_USE" : input.status }
      });
      res.json({ ...vehicle, activeTrip });
    })
  );

  router.get(
    "/vehicle-trips",
    asyncHandler(async (req, res) => {
      await ensureFleetData();
      const vehicleId = String(req.query.vehicleId ?? "").trim();
      const status = String(req.query.status ?? "").trim();
      const trips = await prisma.vehicleTrip.findMany({
        where: {
          ...(vehicleId ? { vehicleId } : {}),
          ...(status === "IN_PROGRESS" || status === "COMPLETED" ? { status } : {})
        },
        include: { vehicle: true },
        orderBy: { startedAt: "desc" },
        take: 100
      });
      res.json(trips);
    })
  );

  router.post(
    "/vehicle-trips/start",
    asyncHandler(async (req, res) => {
      const input = startVehicleTripSchema.parse(req.body);
      await ensureFleetData();
      const trip = await prisma.$transaction(async (tx) => {
        const vehicle = await tx.vehicle.findUniqueOrThrow({ where: { id: input.vehicleId } });
        const activeTrip = await tx.vehicleTrip.findFirst({ where: { vehicleId: input.vehicleId, status: "IN_PROGRESS" } });
        if (activeTrip || vehicle.status === "IN_USE") throw new HttpError(409, "This vehicle already has an active trip.");
        if (vehicle.status === "SERVICE_DUE" || vehicle.status === "OUT_OF_SERVICE") throw new HttpError(409, "This vehicle is not cleared for use.");
        if (input.odometerStart < vehicle.mileage) throw new HttpError(400, `Starting odometer cannot be below ${vehicle.mileage} km.`);

        const created = await tx.vehicleTrip.create({ data: input });
        await tx.vehicle.update({
          where: { id: vehicle.id },
          data: { status: "IN_USE", mileage: input.odometerStart }
        });
        return tx.vehicleTrip.findUniqueOrThrow({ where: { id: created.id }, include: { vehicle: true } });
      });
      res.status(201).json(trip);
    })
  );

  router.put(
    "/vehicle-trips/:id/complete",
    asyncHandler(async (req, res) => {
      const input = completeVehicleTripSchema.parse(req.body);
      const id = routeParam(req.params.id);
      const completed = await prisma.$transaction(async (tx) => {
        const trip = await tx.vehicleTrip.findUniqueOrThrow({ where: { id }, include: { vehicle: true } });
        if (trip.status !== "IN_PROGRESS") throw new HttpError(409, "This trip has already been completed.");
        if (input.odometerEnd < trip.odometerStart) throw new HttpError(400, `Ending odometer cannot be below ${trip.odometerStart} km.`);

        const nextStatus = input.conditionAfter === "UNSAFE"
          ? "OUT_OF_SERVICE"
          : input.conditionAfter === "ATTENTION_REQUIRED" || input.checksAfter.damageReported || input.odometerEnd >= trip.vehicle.serviceAt
            ? "SERVICE_DUE"
            : "AVAILABLE";

        const updated = await tx.vehicleTrip.update({
          where: { id },
          data: { ...input, status: "COMPLETED", endedAt: new Date() },
          include: { vehicle: true }
        });
        await tx.vehicle.update({
          where: { id: trip.vehicleId },
          data: { mileage: input.odometerEnd, status: nextStatus }
        });
        return updated;
      });
      res.json(completed);
    })
  );

  return router;
};
