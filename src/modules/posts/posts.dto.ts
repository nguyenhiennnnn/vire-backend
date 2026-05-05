import { Privacy } from "../../prisma/generated/prisma/enums";
import { z } from "zod";

export const createPostDto = z
  .object({
    content: z.string().max(5000, "Nội dung tối đa 5000 ký tự").optional(),
    mediaUrls: z
      .array(z.string().url("URL không hợp lệ"))
      .max(10, "Tối đa 10 ảnh/video")
      .optional(),
    privacy: z.enum(Privacy),
  })
  .refine((d) => d.content || (d.mediaUrls && d.mediaUrls.length > 0), {
    message: "Bài viết phải có nội dung hoặc ảnh/video",
  });

export const updatePostDto = z.object({
  content: z.string().max(5000).optional(),
  privacy: z.enum(Privacy).optional(),
});

export const feedQueryDto = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(20).default(10),
});
