import { ReactionType } from "../../prisma/generated/prisma/enums";
import z from "zod";

export const reactionBodyDto = z.object({ type: z.enum(ReactionType) });
export const reactionQueryDto = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  type: z.enum(ReactionType).optional(),
});