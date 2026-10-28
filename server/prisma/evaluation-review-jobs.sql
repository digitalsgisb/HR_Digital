-- Queue the new three-month stage for evaluations submitted before this update.
-- Idempotent: each participant/session has one SUPERIOR_REVIEW job.
INSERT INTO "TrainingEmailJob" ("id", "sessionId", "employeeId", "kind", "recipient", "dueAt", "expiresAt", "updatedAt")
SELECT 'review_' || c."id", c."sessionId", c."employeeId", 'SUPERIOR_REVIEW',
 COALESCE(NULLIF(e."superiorEmail", ''), NULLIF(e."hodEmail", ''), d."hodEmail", ''),
 ((s."dateEnd" + INTERVAL '8 hours') + INTERVAL '3 months') - INTERVAL '8 hours',
 TIMESTAMP '9999-12-31', CURRENT_TIMESTAMP
FROM "TrainingCompletion" c
JOIN "TrainingSession" s ON s."id" = c."sessionId"
JOIN "Employee" e ON e."id" = c."employeeId"
JOIN "Department" d ON d."id" = e."departmentId"
WHERE c."summarySubmittedAt" IS NOT NULL AND c."reviewSubmittedAt" IS NULL
 AND c."status" IN ('REQUIRED', 'COMPLETED') AND e."status" = 'ACTIVE'
 AND s."dateEnd" IS NOT NULL AND s."archivedAt" IS NULL
ON CONFLICT ("sessionId", "employeeId", "kind") DO NOTHING;
