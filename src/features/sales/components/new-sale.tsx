"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ZodError } from "zod";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { formatInventoryCondition } from "@/lib/format";
import type { StockOption } from "../data/sales-queries";
import { calculateTotals, deliveryMethods, labels, money, parseMoney, paymentMethods, type CustomerSnapshot, type DeliverySnapshot } from "../domain/sales";
import { createSaleSchema, salesValidationMessage, type CreateSaleInput } from "../domain/validation";
import { MoneyBreakdown, postSale, SalesField, SalesSelect } from "./sales-fields";

type CartRow = { source: StockOption; quantity: string; price: string; discount: string };
const emptyCustomer: CustomerSnapshot = { name: "", phone: "", email: "", company: "", rfc: "", notes: "" };
const emptyDelivery: DeliverySnapshot = { method: "PERSONAL", recipient: "", phone: "", street: "", exterior: "", interior: "", neighborhood: "", postalCode: "", city: "", state: "", country: "México", references: "", carrier: "", tracking: "", estimatedDate: "", notes: "" };
const customerLabels: Record<keyof CustomerSnapshot, string> = { name: "Nombre completo", phone: "Número de celular", email: "Correo electrónico (opcional)", company: "Empresa o negocio (opcional)", rfc: "RFC (opcional)", notes: "Notas del cliente (opcional)" };
const deliveryLabels: Partial<Record<keyof DeliverySnapshot, string>> = { recipient: "Nombre del destinatario", phone: "Teléfono del destinatario", street: "Calle", exterior: "Número exterior", interior: "Número interior (opcional)", neighborhood: "Colonia", postalCode: "Código postal", city: "Ciudad / municipio", state: "Estado", country: "País", references: "Referencias de domicilio", carrier: "Empresa de paquetería", tracking: "Número de guía", estimatedDate: "Fecha estimada de entrega", notes: "Notas de entrega" };
const steps = ["Productos", "Cliente", "Entrega", "Pago", "Confirmación"];
export function NewSale() {
  const router = useRouter(); const [step, setStep] = useState(0); const [q, setQ] = useState(""); const [page, setPage] = useState(1);
  const [stock, setStock] = useState<StockOption[]>([]); const [hasMore, setHasMore] = useState(false); const [loading, setLoading] = useState(true); const [searchError, setSearchError] = useState("");
  const [cart, setCart] = useState<CartRow[]>([]); const [customer, setCustomer] = useState(emptyCustomer); const [delivery, setDelivery] = useState(emptyDelivery);
  const [discount, setDiscount] = useState("0"); const [shipping, setShipping] = useState("0"); const [tax, setTax] = useState("0"); const [notes, setNotes] = useState("");
  const [amount, setAmount] = useState("0"); const [method, setMethod] = useState("CASH"); const [reference, setReference] = useState(""); const [paymentNotes, setPaymentNotes] = useState(""); const [paymentDate, setPaymentDate] = useState("");
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false); const [confirm, setConfirm] = useState<CreateSaleInput | null>(null); const [uncertain, setUncertain] = useState(false); const retry = useRef<CreateSaleInput | null>(null); const inFlight = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true); setSearchError("");
      try { const response = await fetch(`/api/admin/sales/stock?q=${encodeURIComponent(q)}&page=${page}`, { signal: controller.signal }); const data = await response.json() as { rows: StockOption[]; hasMore: boolean; error?: string }; if (!response.ok) throw new Error(data.error); setStock(data.rows); setHasMore(data.hasMore); }
      catch (e) { if (!controller.signal.aborted) setSearchError(e instanceof Error ? e.message : "No fue posible buscar stock."); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [q, page]);
  let totals: ReturnType<typeof calculateTotals> | null = null;
  try { totals = calculateTotals(cart.map(i => ({ quantity: Number(i.quantity), unitPriceCents: parseMoney(i.price), discountCents: parseMoney(i.discount) })), parseMoney(discount), parseMoney(shipping), parseMoney(tax)); } catch { /* Show field errors on review. */ }
  function updateRow(index: number, key: "quantity" | "price" | "discount", value: string) { setCart(cart.map((r, i) => i === index ? { ...r, [key]: value } : r)); }
  function prepare(status: "DRAFT" | "COMPLETED") {
    setError("");
    try {
      const received = parseMoney(amount);
      const input = createSaleSchema.parse({ key: crypto.randomUUID(), status, customer, delivery, items: cart.map(i => ({ productId: i.source.product.id, unitPriceCents: parseMoney(i.price), discountCents: parseMoney(i.discount), allocations: [{ inventoryItemId: i.source.id, quantity: Number(i.quantity) }] })), orderDiscountCents: parseMoney(discount), shippingCents: parseMoney(shipping), taxCents: parseMoney(tax), notes, initialPayment: status === "COMPLETED" && received ? { key: crypto.randomUUID(), kind: "PAYMENT", method, amountCents: received, occurredAt: paymentDate ? new Date(paymentDate).toISOString() : new Date().toISOString(), reference, notes: paymentNotes } : null });
      if (status === "DRAFT") void submit(input); else setConfirm(input);
    } catch (e) { setError(e instanceof ZodError ? salesValidationMessage(e) : (e as Error).message); }
  }
  async function submit(input: CreateSaleInput) {
    if (inFlight.current) return; inFlight.current = true; setBusy(true); setError(""); retry.current = input;
    const result = await postSale("/api/admin/sales", input);
    if (result.id) { router.push(`/admin/ventas/${result.id}`); router.refresh(); }
    else { inFlight.current = false; setBusy(false); setError(result.error ?? "Error al registrar la venta."); setUncertain(Boolean(result.uncertain)); if (!result.uncertain) { setConfirm(null); retry.current = null; } }
  }
  return <div className="space-y-5">
    <nav aria-label="Pasos de nueva venta" className="flex flex-wrap gap-2">{steps.map((name, i) => <Button key={name} variant={step === i ? "primary" : "outline"} onClick={() => setStep(i)} disabled={busy || uncertain} aria-current={step === i ? "step" : undefined}>{i + 1}. {name}</Button>)}</nav>
    <fieldset disabled={busy || uncertain} className="min-w-0 space-y-5">
      <Card className="space-y-5 p-4 sm:p-6"><h2 className="text-h3">{steps[step]}</h2>
        {step === 0 && <>
          <SalesField label="Buscar producto o stock" placeholder="Nombre, SKU, número de parte, marca o modelo" value={q} maxLength={120} onChange={v => { setQ(v); setPage(1); }} />
          <p className="text-small text-muted-foreground">Selecciona cada origen físico. El stock se valida de nuevo al confirmar; los borradores no reservan existencias.</p>
          {searchError && <p role="alert" className="text-danger">{searchError}</p>}
          {loading ? <p role="status">Buscando stock…</p> : <div className="grid gap-3 lg:grid-cols-2">{stock.map(s => <div key={s.id} className="flex min-w-0 items-start gap-3 rounded-xl border border-border p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {s.thumbnail ? <img src={s.thumbnail} alt="" className="size-14 rounded-lg object-contain" /> : <span className="grid size-14 shrink-0 place-items-center rounded-lg bg-muted text-xs">Sin foto</span>}
            <div className="min-w-0 flex-1 space-y-1 break-words"><p className="font-semibold">{s.product.title}</p><p className="text-small">{s.product.sku} · {s.brand}</p><p className="text-small text-muted-foreground">{formatInventoryCondition(s.condition)} · {s.product.price ? `${s.product.price} MXN` : "Sin precio"}</p><p className="text-small">{s.inventoryCode} · {s.location}{s.bag ? ` · Bolsa ${s.bag}` : ""}</p><p className="text-small font-semibold">Disponible: {s.quantity}</p><Button size="sm" variant="outline" disabled={cart.some(r => r.source.id === s.id)} onClick={() => setCart([...cart, { source: s, quantity: "1", price: s.product.price ?? "0", discount: "0" }])}>Agregar origen</Button></div>
          </div>)}{stock.length === 0 && <p>No hay stock vendible para esta búsqueda.</p>}</div>}
          <div className="flex gap-2"><Button variant="ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>Orígenes anteriores</Button><Button variant="ghost" disabled={!hasMore} onClick={() => setPage(page + 1)}>Más orígenes</Button></div>
        </>}
        {step === 1 && <><p className="text-small text-muted-foreground">Venta de mostrador: los datos del cliente son opcionales. No se crea una cuenta.</p><div className="grid gap-4 sm:grid-cols-2">{Object.entries(customerLabels).map(([key, label]) => <SalesField key={key} label={label} value={customer[key as keyof CustomerSnapshot]} onChange={v => setCustomer({ ...customer, [key]: v })} maxLength={key === "notes" ? 1000 : key === "rfc" ? 13 : 200} type={key === "phone" ? "tel" : key === "email" ? "email" : "text"} />)}</div></>}
        {step === 2 && <div className="space-y-4"><SalesSelect label="Método de entrega" value={delivery.method} onChange={v => setDelivery({ ...delivery, method: v as DeliverySnapshot["method"] })}>{deliveryMethods.map(m => <option key={m} value={m}>{labels[m]}</option>)}</SalesSelect>
          {delivery.method === "SHIPPING" && <Button variant="outline" onClick={() => setDelivery({ ...delivery, recipient: customer.name, phone: customer.phone })}>Usar nombre y celular del cliente</Button>}
          <div className="grid gap-4 sm:grid-cols-2">{Object.entries(deliveryLabels).filter(([k]) => delivery.method === "SHIPPING" || ["estimatedDate", "notes"].includes(k)).map(([key, label]) => <SalesField key={key} label={label!} value={delivery[key as keyof DeliverySnapshot]} onChange={v => setDelivery({ ...delivery, [key]: v })} type={key === "estimatedDate" ? "date" : key === "phone" ? "tel" : "text"} maxLength={key === "notes" ? 1000 : key === "references" ? 500 : 240} />)}</div>
          <p className="text-small text-muted-foreground">La guía y la paquetería se pueden agregar después. No hay conexión automática con transportistas.</p>
        </div>}
        {step === 3 && <><div className="grid gap-4 sm:grid-cols-2"><SalesField label="Descuento de la venta (MXN)" value={discount} onChange={setDiscount} inputMode="decimal" /><SalesField label="Costo del envío (MXN)" value={shipping} onChange={setShipping} inputMode="decimal" /><SalesField label="Impuestos explícitos (MXN)" value={tax} onChange={setTax} inputMode="decimal" /><SalesField label="Importe recibido (MXN)" value={amount} onChange={setAmount} inputMode="decimal" /><SalesSelect label="Método de pago" value={method} onChange={setMethod}>{paymentMethods.map(m => <option key={m} value={m}>{labels[m]}</option>)}</SalesSelect><SalesField label="Fecha del pago (opcional)" type="datetime-local" value={paymentDate} onChange={setPaymentDate} /><SalesField label="Referencia del pago" value={reference} onChange={setReference} maxLength={160} /><SalesField label="Notas del pago" value={paymentNotes} onChange={setPaymentNotes} maxLength={1000} /></div><p className="text-small text-muted-foreground">Registrar un pago no realiza ningún cargo. Usa 0 para una venta sin pagar. Los borradores no registran pagos. Los impuestos se indican expresamente; no se calcula IVA ni se emite CFDI.</p></>}
        {step === 4 && <div className="space-y-4"><p><strong>Cliente:</strong> {customer.name || "Venta de mostrador"} {customer.phone}</p><p><strong>Entrega:</strong> {labels[delivery.method]}{delivery.method === "SHIPPING" ? ` · ${delivery.recipient}, ${delivery.street} ${delivery.exterior}, ${delivery.city}, ${delivery.state}, CP ${delivery.postalCode}` : ""}</p><p><strong>Pago inicial:</strong> {amount} MXN · {labels[method]}</p><SalesField label="Notas de la venta" value={notes} onChange={setNotes} maxLength={2000} /></div>}
      </Card>
      {(step === 0 || step === 4) && <Card className="space-y-4 p-4 sm:p-6"><h2 className="text-h3">Productos seleccionados ({cart.length})</h2>{cart.length === 0 && <p>Agrega un origen de stock para comenzar.</p>}{cart.map((r, index) => <div key={r.source.id} className="space-y-3 rounded-lg border border-border p-3"><p className="break-words font-semibold">{r.source.product.title} · {r.source.product.sku}</p><p className="text-small text-muted-foreground">{r.source.inventoryCode} · {r.source.location} · Bolsa {r.source.bag || "—"} · {formatInventoryCondition(r.source.condition)}</p><div className="grid gap-3 sm:grid-cols-3"><SalesField label={`Cantidad · ${r.source.inventoryCode}`} type="number" min={1} max={r.source.quantity} value={r.quantity} onChange={v => updateRow(index, "quantity", v)} /><SalesField label={`Precio unitario MXN · ${r.source.inventoryCode}`} inputMode="decimal" value={r.price} onChange={v => updateRow(index, "price", v)} /><SalesField label={`Descuento total del renglón MXN · ${r.source.inventoryCode}`} inputMode="decimal" value={r.discount} onChange={v => updateRow(index, "discount", v)} /></div><Button variant="ghost" onClick={() => setCart(cart.filter((_, i) => i !== index))}>Quitar origen {r.source.inventoryCode}</Button></div>)}</Card>}
      <Card className="p-4 sm:p-6">{totals ? <MoneyBreakdown totals={totals} /> : <p className="text-danger">Revisa cantidades, precios y descuentos.</p>}</Card>
      <div className="flex flex-wrap justify-between gap-3"><Button variant="outline" disabled={step === 0} onClick={() => setStep(step - 1)}>Anterior</Button>{step < 4 ? <Button disabled={!cart.length} onClick={() => setStep(step + 1)}>Continuar</Button> : <div className="flex flex-wrap gap-3"><Button variant="outline" onClick={() => prepare("DRAFT")} disabled={!totals || !cart.length}>Guardar borrador</Button><Button onClick={() => prepare("COMPLETED")} disabled={!totals || !cart.length}>Revisar y completar</Button></div>}</div>
    </fieldset>
    {error && <p role="alert" className="rounded-xl border border-danger/30 bg-danger/5 p-4 text-small text-danger">{error}</p>}
    {uncertain && <Button isLoading={busy} onClick={() => retry.current && void submit(retry.current)}>Reintentar misma solicitud</Button>}
    {confirm && <Modal title="Confirmar venta y descontar stock" onClose={() => { if (!busy && !uncertain) setConfirm(null); }}><div className="space-y-4"><p>Se descontarán {confirm.items.reduce((s, i) => s + i.allocations.reduce((n, a) => n + a.quantity, 0), 0)} unidad(es) de los orígenes seleccionados. La venta completada conserva sus precios y productos históricos.</p><p className="text-h3">Total: {money(totals?.totalCents ?? 0)}</p>{error && <p role="alert" className="text-danger">{error}</p>}<Button isLoading={busy} onClick={() => void submit(confirm)}>{uncertain ? "Reintentar misma solicitud" : "Confirmar venta"}</Button></div></Modal>}
  </div>;
}
