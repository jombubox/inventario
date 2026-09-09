import { getDb } from "@/db";
import { requireAdmin } from "@/features/auth/server/admin-auth";
import { importErrorResponse } from "@/features/imports/server/import-http";
import { buildInventoryTemplate } from "@/features/imports/server/template-workbook";
import { getRequestId, requestIdHeaders } from "@/lib/observability";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestId = getRequestId(request);
  try {
    await requireAdmin(request.headers);
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
    return importErrorResponse(error, { requestId, event: "import_template_failed" });
  }
}
