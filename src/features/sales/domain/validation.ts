import { z } from "zod";
import { calculateTotals, deliveryMethods, deliveryStatuses, MAX_CENTS, paymentMethods, parseMoney, saleStatuses } from "./sales";

const text = (max = 240) => z.string().trim().max(max).default("");
const phone = text(30).refine(v => !v || /^(?:\+?52)?\d{10}$/u.test(v.replace(/[\s()-]/gu, "")), "Usa un celular mexicano de 10 dígitos, con +52 opcional.");
const cents = z.number().int().min(0).max(MAX_CENTS);
const positiveCents = cents.refine(v => v > 0, "El importe debe ser mayor que cero.");
export const decimalMoney = z.string().transform((v, ctx) => { try { return parseMoney(v); } catch (e) { ctx.addIssue({ code: "custom", message: (e as Error).message }); return z.NEVER; } });
export const customerSchema = z.object({ name: text(160), phone, email: text(200).refine(v => !v || z.email().safeParse(v).success, "Correo electrónico inválido."), company: text(), rfc: text(13), notes: text(1000) }).strict();
export const deliverySchema = z.object({ method: z.enum(deliveryMethods), recipient: text(160), phone, street: text(), exterior: text(30), interior: text(30), neighborhood: text(160), postalCode: text(10), city: text(160), state: text(160), country: text(100).default("México"), references: text(500), carrier: text(120), tracking: text(160), estimatedDate: text(10).refine(v => !v || validDate(v), "Fecha de entrega inválida."), notes: text(1000) }).strict().superRefine((v, ctx) => {
  if (v.method === "SHIPPING") for (const key of ["recipient", "phone", "street", "exterior", "neighborhood", "postalCode", "city", "state", "country"] as const) {
    if (!v[key]) ctx.addIssue({ code: "custom", path: [key], message: "Este dato es necesario para el envío." });
  }
  if (v.method === "SHIPPING" && !/^\d{5}$/u.test(v.postalCode)) ctx.addIssue({ code: "custom", path: ["postalCode"], message: "El código postal debe tener 5 dígitos." });
});
export const paymentSchema = z.object({ key: z.uuid(), kind: z.enum(["PAYMENT", "REFUND"]), method: z.enum(paymentMethods), amountCents: positiveCents, occurredAt: z.iso.datetime({ offset: true }), reference: text(160), notes: text(1000) }).strict();
export const createSaleSchema = z.object({
  key: z.uuid(), status: z.enum(["DRAFT", "COMPLETED"]), customer: customerSchema, delivery: deliverySchema,
  items: z.array(z.object({ productId: z.uuid(), unitPriceCents: cents, discountCents: cents,
    allocations: z.array(z.object({ inventoryItemId: z.uuid(), quantity: z.number().int().min(1).max(10000) }).strict()).min(1).max(30) }).strict()).min(1).max(50),
  orderDiscountCents: cents, shippingCents: cents, taxCents: cents, notes: text(2000), initialPayment: paymentSchema.nullable().default(null),
}).strict().superRefine((v, ctx) => {
  const ids = v.items.flatMap(i => i.allocations.map(a => a.inventoryItemId));
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", path: ["items"], message: "Agrupa cada origen de stock una sola vez." });
  try {
    const totals = calculateTotals(v.items.map(i => ({ ...i, quantity: i.allocations.reduce((n, a) => n + a.quantity, 0) })), v.orderDiscountCents, v.shippingCents, v.taxCents);
    if (v.initialPayment && (v.status === "DRAFT" || v.initialPayment.kind !== "PAYMENT" || v.initialPayment.amountCents > totals.totalCents)) throw new Error("El pago inicial no corresponde al total o a una venta completada.");
  } catch (e) { ctx.addIssue({ code: "custom", message: (e as Error).message }); }
});
export const saleActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("complete"), key: z.uuid() }).strict(),
  z.object({ action: z.literal("cancel"), key: z.uuid(), reason: z.string().trim().min(3).max(1000), restoreStock: z.literal(true) }).strict(),
  z.object({ action: z.literal("payment"), ...paymentSchema.shape }).strict(),
  z.object({ action: z.literal("return"), key: z.uuid(), reason: z.string().trim().min(3).max(1000), condition: z.string().trim().min(2).max(240), creditCents: cents,
    items: z.array(z.object({ allocationId: z.uuid(), quantity: z.number().int().min(1).max(10000), disposition: z.enum(["SELLABLE", "DAMAGED", "NONE"]) }).strict()).min(1).max(100) }).strict(),
  z.object({ action: z.literal("fulfillment"), key: z.uuid(), status: z.enum(deliveryStatuses).exclude(["CANCELLED"]), carrier: text(120), tracking: text(160), estimatedDate: text(10).refine(v => !v || validDate(v), "Fecha inválida."), notes: text(1000) }).strict(),
]);
function validDate(v: string) { return /^\d{4}-\d{2}-\d{2}$/u.test(v) && !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v; }
const dateFilter = z.string().refine(v => !v || validDate(v), "Fecha inválida.").optional();
export const salesQuerySchema = z.object({ q: text(120), from: dateFilter, to: dateFilter, status: z.enum(saleStatuses).or(z.literal("")).default(""), payment: z.enum(["UNPAID", "PARTIAL", "PAID", "REFUND_DUE", "REFUNDED", ""]).default(""), delivery: z.enum(deliveryStatuses).or(z.literal("")).default(""), method: z.enum(paymentMethods).or(z.literal("")).default(""), page: z.coerce.number().int().min(1).max(100000).default(1) }).superRefine((v, ctx) => { if (v.from && v.to && v.from > v.to) ctx.addIssue({ code: "custom", message: "El inicio debe ser anterior al fin." }); });
export type CreateSaleInput = z.infer<typeof createSaleSchema>;
export type SaleActionInput = z.infer<typeof saleActionSchema>;
export type SalesQuery = z.infer<typeof salesQuerySchema>;

const fieldLabels: Record<string, string> = { key: "Solicitud", status: "Estado", customer: "Cliente", delivery: "Entrega", items: "Productos", productId: "Producto", unitPriceCents: "Precio unitario", discountCents: "Descuento del renglón", allocations: "Orígenes de stock", inventoryItemId: "Origen de stock", quantity: "Cantidad", creditCents: "Abono", amountCents: "Importe", initialPayment: "Pago inicial", name: "Nombre", phone: "Celular", email: "Correo", postalCode: "Código postal", method: "Método", occurredAt: "Fecha", reason: "Motivo", condition: "Condición", reference: "Referencia", notes: "Notas", orderDiscountCents: "Descuento de la venta", shippingCents: "Envío", taxCents: "Impuestos", action: "Operación", allocationId: "Origen devuelto", recipient: "Destinatario", street: "Calle", exterior: "Número exterior", neighborhood: "Colonia", city: "Ciudad", state: "Estado", country: "País", estimatedDate: "Fecha estimada", carrier: "Paquetería", tracking: "Guía" };
export function salesValidationMessage(error: z.ZodError) {
  return error.issues.slice(0, 6).map(issue => {
    const field = issue.path.map(p => typeof p === "number" ? String(p + 1) : fieldLabels[String(p)] ?? "Dato").join(" · ");
    const message = /^(Invalid|Too |Unrecognized)/u.test(issue.message) ? "Revisa este dato; el formato o importe no es válido." : issue.message;
    return `${field ? `${field}: ` : ""}${message}`;
  }).join(" · ");
}
