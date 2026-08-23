import { getDb } from "@/db";
import { requirePermissionFromHeaders } from "@/features/auth/server/authorization";
import { importErrorResponse } from "@/features/imports/server/import-http";
import { buildInventoryTemplate } from "@/features/imports/server/template-workbook";
import { getRequestId, requestIdHeaders } from "@/lib/observability";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestId = getRequestId(request);
  let userId: string | undefined;
  try {
    const actor = await requirePermissionFromHeaders(request.headers, "IMPORT_READ");
    userId = actor.id;
    const bytes = await buildInventoryTemplate(getDb());
    return new Response(bytes, {
      headers: {
        ...requestIdHeaders(requestId),
        "Cache-Control": "private, no-store",
        "Content-Disposition": 'attachment; filename="JombuBox_Inventario_Template.xlsx"',
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return importErrorResponse(error, { requestId, event: "import_template_failed", userId });
  }
}
