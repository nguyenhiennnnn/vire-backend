import { v2 as cloudinary, TransformationOptions } from "cloudinary";
import streamifier from "streamifier";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME!,
  api_key: process.env.CLOUDINARY_API_KEY!,
  api_secret: process.env.CLOUDINARY_API_SECRET!,
});

export type UploadResult = {
  url: string;
  publicId: string;
};

type UploadOptions = {
  folder: string;
  resourceType?: "image" | "video" | "auto";
  transformation?: TransformationOptions | TransformationOptions[];
};

export const uploadStream = (
  buffer: Buffer,
  options: UploadOptions,
): Promise<UploadResult> => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: options.folder,
        resource_type: options.resourceType ?? "auto",
        transformation: options.transformation,
      },
      (error, result) => {
        if (error || !result)
          return reject(error ?? new Error("Upload failed"));
        resolve({ url: result.secure_url, publicId: result.public_id });
      },
    );
    streamifier.createReadStream(buffer).pipe(stream);
  });
};

export const deleteResource = async (
  publicId: string,
  resourceType: "image" | "video" = "image",
): Promise<void> => {
  await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
};

const getResourceType = (url: string): "image" | "video" => {
  return url.includes("/video/upload/") ? "video" : "image";
};

export const deleteManyResources = async (urls: string[]): Promise<void> => {
  const images: string[] = [];
  const videos: string[] = [];

  for (const url of urls) {
    const publicId = extractPublicId(url);
    if (!publicId) continue;
    if (getResourceType(url) === "video") videos.push(publicId);
    else images.push(publicId);
  }

  const deleteChunks = (ids: string[], resourceType: "image" | "video") => {
    const chunks: string[][] = [];
    for (let i = 0; i < ids.length; i += 100)
      chunks.push(ids.slice(i, i + 100));
    return chunks.map((chunk) =>
      cloudinary.api.delete_resources(chunk, { resource_type: resourceType }),
    );
  };

  await Promise.all([
    ...deleteChunks(images, "image"),
    ...deleteChunks(videos, "video"),
  ]);
};

export const extractPublicId = (url: string): string => {
  const parts = url.split("/upload/");
  if (parts.length < 2) return "";
  if (!parts[1]) return "";
  const withoutVersion = parts[1].replace(/^v\d+\//, "");
  return withoutVersion.replace(/\.[^/.]+$/, "");
};
