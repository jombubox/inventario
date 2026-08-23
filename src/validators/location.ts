import { z } from "zod";

import { locationTypeValues } from "@/db/schema/enums";
import { optionalDisplayText, requiredDisplayText } from "@/validators/shared";

export const locationInputSchema = z.object({
  code: requiredDisplayText,
  name: requiredDisplayText,
  type: z.enum(locationTypeValues),
  parentId: z.uuid().nullable().default(null),
  active: z.boolean().default(true),
  notes: optionalDisplayText,
});

export type LocationInput = z.infer<typeof locationInputSchema>;
