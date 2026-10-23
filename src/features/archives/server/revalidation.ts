import "server-only";
import { revalidatePath } from "next/cache";
import { revalidatePublicCatalog } from "@/features/catalog/server/revalidation";

export function revalidateArchiveViews() {
  revalidatePath("/admin", "layout");
  revalidatePublicCatalog();
}
