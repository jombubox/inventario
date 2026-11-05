import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { getSale } from "@/features/sales/data/sales-queries";
import { saleActionSchema } from "@/features/sales/domain/validation";
import { mutateSale } from "@/features/sales/server/sales-service";
import { privateHeaders, readSalesJson, salesHttp } from "@/features/sales/server/sales-http";
import { revalidatePublicCatalog } from "@/features/catalog/server/revalidation";
import { EntityNotFoundError } from "@/features/shared/domain/service-errors";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export const GET = (request: Request, context: Context) => salesHttp(request, async () => {
  const id = z.uuid().parse((await context.params).id); const sale = await getSale(getDb(), id);
  if (!sale) throw new EntityNotFoundError("No encontramos la venta.");
  return Response.json(sale, { headers: privateHeaders });
});
export const POST = (request: Request, context: Context) => salesHttp(request, async () => {
  const id = z.uuid().parse((await context.params).id);
  await mutateSale(getDb(), id, saleActionSchema.parse(await readSalesJson(request)));
  revalidatePath("/admin", "layout"); revalidatePublicCatalog();
  return Response.json({ id }, { headers: privateHeaders });
});
