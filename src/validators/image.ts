import { z } from "zod";
import { allowedImageMimeTypes, MAX_IMAGE_BYTES } from "@/features/images/domain/image-policy";

export const directImageUploadSchema = z.object({
  productId: z.uuid(),
  uploadId: z.uuidv4(),
  batchId: z.uuidv4(),
  position: z.number().int().min(0).max(9),
  filename: z.string().min(1).max(255),
  mimeType: z.enum(allowedImageMimeTypes),
  size: z.number().int().positive().max(MAX_IMAGE_BYTES),
  signatureHex: z.string().regex(/^[0-9a-f]{6,24}$/u),
  fingerprint: z.string().regex(/^[0-9a-f]{64}$/u),
  alt: z.string().trim().max(300).nullable().optional(),
}).strict();

export const directImageConfirmationSchema = z.object({ token: z.string().min(1).max(4096) }).strict();
export type DirectImageUploadInput = z.infer<typeof directImageUploadSchema>;

export const imageUploadRequestSchema = z.object({
  productId: z.uuid(),
  uploadId: z.uuidv4().optional(),
  alt: z.string().trim().max(300).nullable().optional(),
});

export const imageUpdateRequestSchema = z
  .object({
    alt: z.string().trim().max(300).nullable().optional(),
    makePrimary: z.boolean().optional(),
  })
  .refine((value) => value.alt !== undefined || value.makePrimary === true);

export const imageReorderRequestSchema = z.object({
  productId: z.uuid(),
  imageIds: z.array(z.uuid()).max(10),
});
