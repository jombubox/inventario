import { notFound } from "next/navigation";
import Link from "next/link";
import { z } from "zod";
import { getDb } from "@/db";
import { requireAdmin } from "@/features/auth/server/admin-auth";
import { getSale } from "@/features/sales/data/sales-queries";
import { money, saleLabel } from "@/features/sales/domain/sales";
import { MoneyBreakdown } from "@/features/sales/components/sales-fields";
import { PrintReceipt } from "@/features/sales/components/sale-controls";
import { formatDateTime } from "@/lib/format";
import "./receipt.css";

export const metadata = { title: "Recibo de venta | Jombubox", robots: { index: false, follow: false } };
export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin(); const { id } = await params; if (!z.uuid().safeParse(id).success) notFound();
  const d = await getSale(getDb(), id); if (!d?.sale.completedAt) notFound(); const { sale: s } = d;
  return <div className="mx-auto max-w-3xl space-y-5"><div className="flex flex-wrap items-center justify-between gap-3 print:hidden"><Link href={`/admin/ventas/${id}`} className="text-link underline">Volver a la venta</Link><PrintReceipt /></div>
    <article id="sales-receipt" className="space-y-5 rounded-xl border border-border bg-card p-5 text-card-foreground sm:p-8"><header className="space-y-2"><p className="text-3xl font-bold">Jombubox</p><h1 className="text-h3">Recibo comercial de venta</h1><p className="break-all text-small">{s.folio}</p><p className="text-small">{formatDateTime(s.completedAt!)} · {saleLabel(s.status)}</p><p className="text-small font-semibold">Este recibo no es una factura fiscal ni un CFDI.</p></header>
      <p>Cliente: {s.customer.name || "Venta de mostrador"} {s.customer.phone}</p>
      <div className="overflow-x-auto"><table className="w-full text-left text-small"><thead><tr className="border-b border-border"><th className="py-2">Producto / SKU</th><th className="p-2">Cant.</th><th className="p-2">Precio</th><th className="p-2">Desc.</th><th className="p-2">Importe</th></tr></thead><tbody>{d.lines.map(i => <tr key={i.id} className="border-b border-border"><td className="py-3">{i.snapshot.title}<br /><span className="text-xs">{i.snapshot.sku}</span>{i.snapshot.warranty && <p className="text-xs">Garantía: {i.snapshot.warranty}</p>}</td><td className="p-2">{i.quantity}</td><td className="p-2">{money(i.unitPriceCents)}</td><td className="p-2">{money(i.discountCents)}</td><td className="p-2">{money(i.quantity * i.unitPriceCents - i.discountCents)}</td></tr>)}</tbody></table></div>
      <MoneyBreakdown totals={s} creditedCents={s.creditedCents} /><div className="space-y-2 border-t border-border pt-4"><p>Pagos recibidos: {money(d.paidCents)}</p><p>Reembolsos registrados: {money(d.refundedCents)}</p><p>Cobrado neto: {money(d.collectedCents)}</p><p className="font-bold">Saldo pendiente: {money(d.outstandingCents)}</p>{d.refundDueCents > 0 && <p>Saldo a favor: {money(d.refundDueCents)}</p>}{d.payments.map(p => <p key={p.id} className="text-xs">{saleLabel(p.kind)} · {saleLabel(p.method)} · {money(p.amountCents)} · {formatDateTime(p.occurredAt)}</p>)}</div>
      <div className="space-y-1 border-t border-border pt-4 text-small"><p>Entrega: {saleLabel(s.delivery.method)} · {saleLabel(s.deliveryStatus)}</p>{s.delivery.method === "SHIPPING" && <><p>{s.delivery.recipient} · {s.delivery.phone}</p><p>{s.delivery.street} {s.delivery.exterior} {s.delivery.interior}, {s.delivery.neighborhood}, CP {s.delivery.postalCode}, {s.delivery.city}, {s.delivery.state}, {s.delivery.country}</p><p>Paquetería: {s.delivery.carrier || "Pendiente"} · Guía: {s.delivery.tracking || "Pendiente"}</p></>}</div>
    </article></div>;
}
