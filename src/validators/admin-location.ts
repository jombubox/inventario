import { z } from "zod";

import { locationTypeValues } from "@/db/schema/enums";
import { optionalDisplayText, requiredDisplayText } from "@/validators/shared";

const locationFields = {
  code: requiredDisplayText,
  name: requiredDisplayText,
  type: z.enum(locationTypeValues),
  parentId: z.preprocess(
    (value) => (value === "" || value === undefined ? null : value),
    z.uuid().nullable(),
  ),
  active: z.boolean(),
  notes: optionalDisplayText,
};

export const createLocationMutationSchema = z.object(locationFields);
export const updateLocationMutationSchema = z.object({
  id: z.uuid(),
  expectedUpdatedAt: z.coerce.date(),
  ...locationFields,
});

export type CreateLocationMutationInput = z.infer<typeof createLocationMutationSchema>;
export type UpdateLocationMutationInput = z.infer<typeof updateLocationMutationSchema>;
