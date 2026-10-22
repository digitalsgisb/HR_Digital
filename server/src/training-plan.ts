import { z } from "zod";

export const trainingPlanSchema = z.object({
  title: z.string().trim().min(1), category: z.enum(["Compliance", "Safety", "System", "Development"]),
  dateStart: z.string().datetime(), dateEnd: z.string().datetime(),
  trainerName: z.string().trim().min(1), venue: z.string().trim().min(1),
  capacity: z.number().int().min(1).max(5000), deliveryMethod: z.string().trim().min(1),
  notifyParticipants: z.boolean().default(true),
  attendanceEnabled: z.boolean().default(false),
  participantEmployeeIds: z.array(z.string().min(1)).min(1).max(5000)
}).refine((value) => new Date(value.dateEnd) > new Date(value.dateStart), "End time must be after start time.")
  .refine((value) => new Set(value.participantEmployeeIds).size === value.participantEmployeeIds.length, "Choose each employee once.")
  .refine((value) => value.capacity >= value.participantEmployeeIds.length, "Capacity must cover the selected participants.");
