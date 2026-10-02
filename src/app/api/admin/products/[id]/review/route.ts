import { z } from "zod";
import { getDb } from "@/db";
import { UnauthorizedError } from "@/features/auth/domain/auth-errors";
import { requireAdmin } from "@/features/auth/server/admin-auth";
import { getAdminProductReview } from "@/features/products/data/admin-product-queries";

const headers = { "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff" };

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin(request.headers);
    const id = z.uuid().safeParse((await context.params).id);
    if (!id.success) return Response.json({ error: "Producto inválido." }, { status: 400, headers });
    const review = await getAdminProductReview(getDb(), id.data);
    return review ? Response.json(review, { headers }) : Response.json({ error: "El producto ya no existe." }, { status: 404, headers });
  } catch (error) {
    return Response.json({ error: error instanceof UnauthorizedError ? "Inicia sesión para continuar." : "No fue posible cargar el producto." }, { status: error instanceof UnauthorizedError ? 401 : 500, headers });
  }
}
