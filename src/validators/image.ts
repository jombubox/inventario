import { z } from "zod";

export const imageUploadRequestSchema = z.object({
  productId: z.uuid(),
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
