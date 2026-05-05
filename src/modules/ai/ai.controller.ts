import { Response, NextFunction } from "express";
import { AuthRequest } from "../../middlewares/auth.middleware";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";

const genai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

const captionDto = z.object({
  imageUrls: z.array(z.string().url()).min(1).max(10),
  language: z.enum(["vi", "en"]).default("vi"),
});

async function urlToInlinePart(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch image: ${url}`);
  const contentType = res.headers.get("content-type") ?? "image/jpeg";
  const buffer = await res.arrayBuffer();
  const base64 = Buffer.from(buffer).toString("base64");
  return { inlineData: { data: base64, mimeType: contentType } };
}

export const generateCaption = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { imageUrls, language } = captionDto.parse(req.body);

    const imageParts = await Promise.all(imageUrls.map(urlToInlinePart));

    const prompt =
      language === "vi"
        ? `Hãy tạo 3 caption hấp dẫn, tự nhiên cho bài đăng mạng xã hội dựa trên các ảnh này.
          Yêu cầu:
          - Mỗi caption có phong cách khác nhau (cảm xúc, hài hước, truyền cảm hứng)
          - Ngắn gọn, phù hợp mạng xã hội, có thể dùng emoji
          - Chỉ trả về JSON hợp lệ theo định dạng: {"captions": ["caption1", "caption2", "caption3"]}
          - Không giải thích, không markdown, không text thừa`
                  : `Write 3 catchy social media captions for these images.
          Requirements:
          - Each caption has a different style (emotional, fun, inspirational)
          - Concise, social-media ready, can include emoji
          - Return valid JSON only: {"captions": ["caption1", "caption2", "caption3"]}
          - No explanation, no markdown, no extra text`;

    const response = await genai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [...imageParts, { text: prompt }] }],
      config: { responseMimeType: "application/json" },
    });

    const raw = response.text?.trim() ?? "{}";
    const parsed = JSON.parse(raw);
    const captions: string[] = Array.isArray(parsed.captions)
      ? parsed.captions.filter((c: unknown) => typeof c === "string" && c.trim())
      : [];

    if (!captions.length) throw new Error("No captions generated");

    res.json({ captions });
  } catch (err) {
    console.error("Error generating caption:", err);
    next(err);
  }
};