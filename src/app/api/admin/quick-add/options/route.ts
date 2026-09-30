import { getDb } from "@/db";
import { UnauthorizedError } from "@/features/auth/domain/auth-errors";
import { requireAdmin } from "@/features/auth/server/admin-auth";
import { listQuickAddOptions } from "@/features/inventory/data/quick-add-queries";

export const dynamic = "force-dynamic";

const privateHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
};

export async function GET(request: Request) {
  try {
    await requireAdmin(request.headers);
    return Response.json(
      { options: await listQuickAddOptions(getDb()) },
      { headers: privateHeaders },
    );
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return Response.json(
        { error: "Inicia sesión para continuar." },
        { status: 401, headers: privateHeaders },
      );
    }
    return Response.json(
      { error: "No fue posible actualizar ubicaciones y catálogos." },
      { status: 500, headers: privateHeaders },
    );
  }
}
