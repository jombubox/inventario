import { z } from "zod";
import { getDb } from "@/db";
import { searchSaleStock } from "@/features/sales/data/sales-queries";
import { privateHeaders, salesHttp } from "@/features/sales/server/sales-http";

export const dynamic = "force-dynamic";
export const GET = (request: Request) => salesHttp(request, async () => {
  const params = new URL(request.url).searchParams;
  const q = z.string().max(120).parse(params.get("q") ?? ""); const page = z.coerce.number().int().min(1).max(1000).parse(params.get("page") ?? 1);
  return Response.json(await searchSaleStock(getDb(), q, page), { headers: privateHeaders });
});
