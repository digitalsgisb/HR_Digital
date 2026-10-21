// Synthetic in-memory fixture for API tests and local UI verification only.
// Importing this file does not change Prisma; callers must explicitly install it.
import { prisma } from "./prisma.js";

export function installTrainingFixture() {
  const department = { id: "qa-dept", name: "HR & Admin", code: "QA" };
  const employees = [
    { id: "qa-1", employeeId: "QA-001", name: "QA Participant", email: "qa@example.test", status: "ACTIVE", department, departmentId: department.id },
    { id: "qa-2", employeeId: "QA-002", name: "QA Without Email", email: null, status: "ACTIVE", department, departmentId: department.id }
  ];
  const sessions: any[] = []; const jobs: any[] = [];
  const course = { id: "qa-course", name: "QA Training", code: "QA-TRN", category: "Safety", status: "ACTIVE" };
  const restore: Array<() => void> = [];
  const replace = (target: any, key: string, handler: any) => { const old = target[key]; target[key] = handler; restore.push(() => { target[key] = old; }); };
  const sessionsMatching = (where: any = {}) => sessions.filter(row => (!where.id || row.id === where.id) && (!("archivedAt" in where) || row.archivedAt === where.archivedAt) && (!where.dateStart?.gte || row.dateStart >= where.dateStart.gte));
  replace(prisma, "$transaction", async (fn: any) => typeof fn === "function" ? fn(prisma) : Promise.all(fn));
  replace(prisma.employee, "findMany", async () => employees);
  replace(prisma.employee, "count", async ({where}: any = {}) => employees.filter(row => !where?.id?.in || where.id.in.includes(row.id)).length);
  replace(prisma.department, "count", async () => 1);
  replace(prisma.trainingCourse, "count", async () => 1);
  replace(prisma.trainingCourse, "findFirst", async () => course);
  replace(prisma.trainingSession, "count", async ({where}: any = {}) => sessionsMatching(where).length);
  replace(prisma.trainingSession, "findMany", async ({where}: any = {}) => sessionsMatching(where));
  replace(prisma.trainingSession, "findFirst", async ({where}: any) => sessionsMatching(where)[0] || null);
  replace(prisma.trainingSession, "findUnique", async ({where}: any) => sessionsMatching(where)[0] || null);
  replace(prisma.trainingSession, "create", async ({data}: any) => {
    const row = { ...data, id: `qa-session-${sessions.length + 1}`, archivedAt: null, course, dateEnd: data.dateEnd || null, completions: (data.completions?.create || []).map((record: any, index: number) => ({ ...record, id: `completion-${sessions.length}-${index}`, employee: employees.find(person => person.id === record.employeeId), hours: 0, completedAt: null })), _count: { completions: data.completions?.create?.length || 0 } };
    sessions.push(row); return row;
  });
  replace(prisma.trainingSession, "update", async ({where,data}: any) => { const row = sessionsMatching(where)[0]; if (!row) throw new Error("Not found"); Object.assign(row,data); return row; });
  replace(prisma.trainingCompletion, "findMany", async ({where}: any = {}) => sessions.filter(session => (!where?.sessionId || session.id === where.sessionId) && (!where?.session || session.archivedAt === null)).flatMap(session => session.completions.filter((record: any) => !where?.completedAt || record.completedAt).map((record: any) => ({ ...record, session, sessionId: session.id }))));
  replace(prisma.trainingEmailJob, "createMany", async ({data}: any) => { let count = 0; for (const item of data) if (!jobs.some(job => job.sessionId === item.sessionId && job.employeeId === item.employeeId && job.kind === item.kind)) { jobs.push({ ...item, id: `qa-job-${jobs.length}`, status: "PENDING", attempts: 0 }); count++; } return { count }; });
  replace(prisma.trainingEmailJob, "updateMany", async ({where,data}: any) => { const matching = jobs.filter(job => (!where.sessionId || job.sessionId === where.sessionId) && (!where.status?.in || where.status.in.includes(job.status))); for (const job of matching) Object.assign(job,data); return { count: matching.length }; });
  replace(prisma.trainingEmailJob, "groupBy", async () => Object.entries(jobs.filter(job => !sessions.find(row => row.id === job.sessionId)?.archivedAt).reduce((counts,job) => { counts[job.status] = (counts[job.status] || 0) + 1; return counts; }, {} as Record<string, number>)).map(([status,_count]) => ({status,_count})));
  replace(prisma.trainingEmailJob, "findMany", async () => []);
  replace(prisma.trainingEmailJob, "count", async ({where}: any) => jobs.filter(job => job.sessionId === where.sessionId).length);
  return { employees, sessions, jobs, restore: () => { restore.reverse().forEach(fn => fn()); } };
}
