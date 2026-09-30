import { getDb } from "@/db";
import { UnauthorizedError } from "@/features/auth/domain/auth-errors";
import { requireAdmin } from "@/features/auth/server/admin-auth";
import { searchInventoryModels } from "@/features/inventory/data/quick-add-queries";
import { modelSearchQuerySchema } from "@/validators/quick-add-inventory";

export const dynamic = "force-dynamic";

const privateHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
};

export async function GET(request: Request) {
  try {
    await requireAdmin(request.headers);
    const parsed = modelSearchQuerySchema.safeParse({
      q: new URL(request.url).searchParams.get("q"),
    });
    if (!parsed.success) {
      return Response.json(
        { error: "Escribe al menos 2 caracteres.", results: [] },
        { status: 400, headers: privateHeaders },
      );
    }
    const results = await searchInventoryModels(getDb(), parsed.data.q);
    return Response.json({ results }, { headers: privateHeaders });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return Response.json(
        { error: "Inicia sesión para continuar." },
        { status: 401, headers: privateHeaders },
      );
    }
    return Response.json(
      { error: "No fue posible buscar modelos." },
      { status: 500, headers: privateHeaders },
    );
  }
}
