import { getDb } from "@/db";
import { createSale } from "@/features/sales/server/sales-service";
import { listSales } from "@/features/sales/data/sales-queries";
import { createSaleSchema, salesQuerySchema } from "@/features/sales/domain/validation";
import { privateHeaders, readSalesJson, salesHttp } from "@/features/sales/server/sales-http";
import { revalidatePublicCatalog } from "@/features/catalog/server/revalidation";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";
export const GET = (request: Request) => salesHttp(request, async () => Response.json(await listSales(getDb(), salesQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams))), { headers: privateHeaders }));
export const POST = (request: Request) => salesHttp(request, async () => {
  const id = await createSale(getDb(), createSaleSchema.parse(await readSalesJson(request)));
  revalidatePath("/admin", "layout"); revalidatePublicCatalog();
  return Response.json({ id }, { status: 201, headers: privateHeaders });
});
