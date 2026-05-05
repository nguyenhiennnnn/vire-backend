import { z } from "zod";

export const updateUserDto = z.object({
  username: z
    .string()
    .min(3, "Username tối thiểu 3 ký tự")
    .max(20, "Username tối đa 20 ký tự")
    .regex(/^[a-zA-Z0-9_]+$/, "Username chỉ được chứa chữ cái, số và _")
    .optional(),
  bio: z.string().max(200, "Bio tối đa 200 ký tự").optional(),
});

export const searchUserDto = z.object({
  q: z
    .string()
    .min(1, "Từ khoá không được rỗng")
    .max(50, "Từ khoá tối đa 50 ký tự"),
});
