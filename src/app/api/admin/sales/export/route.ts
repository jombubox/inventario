import { getDb } from "@/db";
import { listSales, salesReport } from "@/features/sales/data/sales-queries";
import { moneyInput, saleLabel } from "@/features/sales/domain/sales";
import { salesQuerySchema } from "@/features/sales/domain/validation";
import { privateHeaders, salesHttp } from "@/features/sales/server/sales-http";
import { encodeSalesCsv } from "@/features/sales/domain/sales-csv";
import { InvalidOperationError } from "@/features/shared/domain/service-errors";

export const dynamic = "force-dynamic";
export const GET = (request: Request) => salesHttp(request, async () => {
  const params = new URL(request.url).searchParams; const query = salesQuerySchema.parse(Object.fromEntries(params)); const db = getDb();
  let rows: (string | number)[][];
  if (params.get("report") === "true") {
    const report = await salesReport(db, query);
    rows = [["Reporte Jombubox · MXN · fechas America/Mexico_City", "Valor"], ["Ventas brutas (incluyen ventas posteriormente canceladas)", moneyInput(report.grossCents)], ["Abonos / cancelaciones", moneyInput(report.creditsCents)], ["Ventas netas", moneyInput(report.netCents)], ["Cobrado neto", moneyInput(report.collectedCents)], ["Reembolsos registrados", moneyInput(report.refundsCents)], ["Saldo pendiente", moneyInput(report.outstandingCents)], ["Cancelaciones", report.cancellations], ["Devoluciones / cancelaciones registradas", report.returns.count], ["Unidades devueltas", report.returns.quantity], [], ["Día", "Venta bruta MXN", "Venta neta MXN", "Ventas"], ...report.daily.map(d => [d.period, moneyInput(d.grossCents), moneyInput(d.netCents), d.count]), [], ["Mes", "Venta bruta MXN", "Venta neta MXN", "Ventas"], ...report.monthly.map(d => [d.period, moneyInput(d.grossCents), moneyInput(d.netCents), d.count]), [], ["SKU", "Producto", "Unidades netas"], ...report.topProducts.map(p => [p.sku, p.title, p.quantity]), [], ["Método", "Cobrado neto MXN"], ...report.methods.map(m => [saleLabel(m.method), moneyInput(m.collectedCents)]), [], ["Entrega", "Ventas"], ...report.deliveries.map(d => [saleLabel(d.status), d.count])];
  } else {
    const result = await listSales(db, query, 10001); if (result.total > 10000) throw new InvalidOperationError("Limita las fechas para exportar hasta 10,000 ventas.");
    rows = [["Folio", "Fecha UTC", "Cliente", "Celular", "Correo", "Productos", "Total MXN", "Abonos MXN", "Cobrado neto MXN", "Reembolsos MXN", "Pendiente MXN", "Saldo a favor MXN", "Venta", "Pago", "Entrega", "Guía"], ...result.rows.map(r => [r.sale.folio, r.sale.createdAt.toISOString(), r.sale.customer.name, r.sale.customer.phone, r.sale.customer.email, r.itemCount, moneyInput(r.sale.totalCents), moneyInput(r.sale.creditedCents), moneyInput(r.collectedCents), moneyInput(r.refundedCents), moneyInput(r.outstandingCents), moneyInput(r.refundDueCents), saleLabel(r.sale.status), saleLabel(r.paymentStatus), saleLabel(r.sale.deliveryStatus), r.sale.delivery.tracking])];
  }
  return new Response(encodeSalesCsv(rows), { headers: { ...privateHeaders, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="Jombubox_${params.get("report") === "true" ? "Reporte" : "Ventas"}.csv"` } });
});
