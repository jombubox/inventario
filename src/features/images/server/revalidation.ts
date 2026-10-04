import { revalidatePath } from "next/cache";
import { revalidatePublicCatalog } from "@/features/catalog/server/revalidation";

export function revalidateProductImages(productId: string) {
  revalidatePath("/admin/productos");
  revalidatePath(`/admin/productos/${productId}`);
  revalidatePublicCatalog();
}
