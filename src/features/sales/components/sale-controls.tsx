"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ZodError } from "zod";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import type { SaleDetail } from "../data/sales-queries";
import { deliveryStatuses, money, moneyInput, parseMoney, paymentMethods, saleLabel } from "../domain/sales";
import { saleActionSchema, salesValidationMessage, type SaleActionInput } from "../domain/validation";
import { postSale, SalesField, SalesSelect } from "./sales-fields";

type Mode = "complete" | "cancel" | "payment" | "refund" | "return" | "fulfillment";
export function SaleControls({ detail: d }: { detail: SaleDetail }) {
  const router = useRouter(); const [mode, setMode] = useState<Mode | null>(null); const [busy, setBusy] = useState(false); const [uncertain, setUncertain] = useState(false); const [error, setError] = useState("");
  const [reason, setReason] = useState(""); const [condition, setCondition] = useState(""); const [amount, setAmount] = useState("0"); const [method, setMethod] = useState("CASH"); const [reference, setReference] = useState(""); const [notes, setNotes] = useState(""); const [date, setDate] = useState("");
  const [carrier, setCarrier] = useState(d.sale.delivery.carrier); const [tracking, setTracking] = useState(d.sale.delivery.tracking); const [estimatedDate, setEstimatedDate] = useState(d.sale.delivery.estimatedDate); const [deliveryStatus, setDeliveryStatus] = useState(d.sale.deliveryStatus);
  const [quantities, setQuantities] = useState<Record<string, string>>({}); const [dispositions, setDispositions] = useState<Record<string, string>>({}); const pending = useRef<SaleActionInput | null>(null);
  function open(next: Mode) { setMode(next); setError(""); setUncertain(false); pending.current = null; setReason(""); setCondition(""); setAmount(next === "payment" ? moneyInput(d.outstandingCents) : next === "refund" ? moneyInput(d.refundDueCents) : "0"); setNotes(next === "fulfillment" ? d.sale.delivery.notes : ""); setQuantities({}); setDispositions({}); }
  async function submit() {
    if (busy) return;
    let input: SaleActionInput;
    try {
      if (uncertain && pending.current) input = pending.current;
      else {
        const key = crypto.randomUUID();
        const raw = mode === "complete" ? { action: "complete", key } : mode === "cancel" ? { action: "cancel", key, reason, restoreStock: true } : mode === "payment" || mode === "refund" ? { action: "payment", key, kind: mode === "refund" ? "REFUND" : "PAYMENT", method, amountCents: parseMoney(amount), occurredAt: date ? new Date(date).toISOString() : new Date().toISOString(), reference, notes } : mode === "return" ? { action: "return", key, reason, condition, creditCents: parseMoney(amount), items: d.allocations.filter(a => Number(quantities[a.id]) > 0).map(a => ({ allocationId: a.id, quantity: Number(quantities[a.id]), disposition: dispositions[a.id] ?? "NONE" })) } : { action: "fulfillment", key, status: deliveryStatus, carrier, tracking, estimatedDate, notes };
        input = saleActionSchema.parse(raw);
      }
    } catch (e) { setError(e instanceof ZodError ? salesValidationMessage(e) : (e as Error).message); return; }
    pending.current = input; setBusy(true); setError("");
    const result = await postSale(`/api/admin/sales/${d.sale.id}`, input); setBusy(false);
    if (result.id) { setMode(null); router.refresh(); }
    else { setError(result.error ?? "Error al registrar la operación."); setUncertain(Boolean(result.uncertain)); }
  }
  const titles: Record<Mode, string> = { complete: "Completar borrador", cancel: "Cancelar venta", payment: "Registrar pago recibido", refund: "Registrar reembolso realizado", return: "Registrar devolución", fulfillment: "Actualizar entrega" };
  return <>
    <div className="flex flex-wrap gap-2 print:hidden">
      {d.sale.status === "DRAFT" && <Button onClick={() => open("complete")}>Completar borrador</Button>}
      {d.sale.status === "COMPLETED" && <><Button variant="outline" disabled={!d.outstandingCents} onClick={() => open("payment")}>Registrar pago</Button><Button variant="outline" onClick={() => open("fulfillment")}>Actualizar entrega</Button><Button variant="outline" disabled={!d.allocations.some(a => a.returnedQuantity < a.quantity)} onClick={() => open("return")}>Registrar devolución</Button></>}
      {d.refundDueCents > 0 && <Button variant="outline" onClick={() => open("refund")}>Registrar reembolso</Button>}
      {d.sale.status !== "CANCELLED" && <Button variant="destructive" onClick={() => open("cancel")}>Cancelar venta</Button>}
    </div>
    {mode && <Modal title={titles[mode]} onClose={() => { if (!busy && !uncertain) setMode(null); }}><div className="space-y-5">
      <fieldset disabled={busy || uncertain} className="min-w-0 space-y-4">
        {mode === "complete" && <p>Se validarán y descontarán los orígenes del borrador. Confirma solo cuando los productos estén listos para esta venta.</p>}
        {mode === "cancel" && <><p>Se reintegrará al inventario el stock vendido que no haya sido devuelto. No se duplicarán devoluciones previas. Los pagos se conservan; registra cualquier reembolso por separado después de realizarlo.</p><p className="font-semibold">Confirmar reintegro de stock pendiente y cancelación.</p><SalesField label="Motivo de cancelación" value={reason} onChange={setReason} maxLength={1000} /></>}
        {(mode === "payment" || mode === "refund") && <><p className="text-small text-muted-foreground">{mode === "refund" ? `Registra únicamente un reembolso ya realizado. Saldo a favor: ${money(d.refundDueCents)}. No se envían reembolsos a bancos ni plataformas.` : `Registra dinero ya recibido. Saldo pendiente: ${money(d.outstandingCents)}. No se realiza ningún cargo.`}</p><SalesField label="Importe (MXN)" value={amount} onChange={setAmount} inputMode="decimal" /><SalesSelect label="Método" value={method} onChange={setMethod}>{paymentMethods.map(m => <option key={m} value={m}>{saleLabel(m)}</option>)}</SalesSelect><SalesField label="Fecha del movimiento (opcional)" type="datetime-local" value={date} onChange={setDate} /><SalesField label="Referencia" value={reference} onChange={setReference} maxLength={160} /><SalesField label="Notas" value={notes} onChange={setNotes} maxLength={1000} /></>}
        {mode === "return" && <><p className="text-small text-muted-foreground">Indica la cantidad recibida y su destino. Un abono reduce el importe adeudado; el reembolso de dinero se registra por separado. Sin recepción física: no se modifica el stock.</p>{d.allocations.filter(a => a.quantity > a.returnedQuantity).map(a => <div key={a.id} className="space-y-3 rounded-lg border border-border p-3"><p className="break-words font-semibold">{d.lines.find(i => i.id === a.saleItemId)?.snapshot.title}</p><p className="text-small">{a.source.inventoryCode} · {a.source.location} · Bolsa {a.source.bag || "—"} · Pendiente: {a.quantity - a.returnedQuantity}</p><SalesField label={`Cantidad a devolver · ${a.source.inventoryCode}`} type="number" min={0} max={a.quantity - a.returnedQuantity} value={quantities[a.id] ?? "0"} onChange={v => setQuantities({ ...quantities, [a.id]: v })} /><SalesSelect label={`Destino · ${a.source.inventoryCode}`} value={dispositions[a.id] ?? "NONE"} onChange={v => setDispositions({ ...dispositions, [a.id]: v })}>{["NONE", "SELLABLE", "DAMAGED"].map(v => <option key={v} value={v}>{saleLabel(v)}</option>)}</SalesSelect></div>)}<SalesField label="Motivo de devolución" value={reason} onChange={setReason} maxLength={1000} /><SalesField label="Condición del producto devuelto" value={condition} onChange={setCondition} maxLength={240} /><SalesField label="Abono por devolución (MXN)" value={amount} onChange={setAmount} inputMode="decimal" /><p className="text-small">Máximo pendiente de abonar: {money(d.sale.totalCents - d.sale.creditedCents)}.</p></>}
        {mode === "fulfillment" && <><SalesSelect label="Estado de entrega" value={deliveryStatus} onChange={v => setDeliveryStatus(v as typeof deliveryStatus)}>{deliveryStatuses.filter(s => s !== "CANCELLED").map(s => <option key={s} value={s}>{saleLabel(s)}</option>)}</SalesSelect><SalesField label="Paquetería" value={carrier} onChange={setCarrier} maxLength={120} /><SalesField label="Número de guía" value={tracking} onChange={setTracking} maxLength={160} /><SalesField label="Fecha estimada de entrega" type="date" value={estimatedDate} onChange={setEstimatedDate} /><SalesField label="Notas de entrega" value={notes} onChange={setNotes} maxLength={1000} /></>}
      </fieldset>
      {error && <p role="alert" className="text-small text-danger">{error}</p>}
      <Button variant={mode === "cancel" ? "destructive" : "primary"} isLoading={busy} onClick={() => void submit()}>{uncertain ? "Reintentar misma solicitud" : `Confirmar: ${titles[mode].toLowerCase()}`}</Button>
    </div></Modal>}
  </>;
}
export function PrintReceipt() { return <Button variant="outline" className="print:hidden" onClick={() => window.print()}>Imprimir / guardar PDF</Button>; }
