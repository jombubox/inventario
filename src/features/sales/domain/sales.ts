/** Money is persisted as integer MXN centavos; no floating point arithmetic. */
export const MAX_CENTS = 2_000_000_000;
export const saleStatuses = ["DRAFT", "COMPLETED", "CANCELLED"] as const;
export const deliveryMethods = ["PERSONAL", "PICKUP", "SHIPPING"] as const;
export const deliveryStatuses = ["PENDING", "PREPARING", "SHIPPED", "DELIVERED", "CANCELLED"] as const;
export const paymentMethods = ["CASH", "TRANSFER", "CARD", "MERCADO_PAGO", "OTHER"] as const;
export type CustomerSnapshot = { name: string; phone: string; email: string; company: string; rfc: string; notes: string };
export type DeliverySnapshot = {
  method: typeof deliveryMethods[number]; recipient: string; phone: string; street: string;
  exterior: string; interior: string; neighborhood: string; postalCode: string; city: string;
  state: string; country: string; references: string; carrier: string; tracking: string;
  estimatedDate: string; notes: string;
};
export function parseMoney(value: string): number {
  if (!/^\d{1,8}(?:\.\d{1,2})?$/u.test(value)) throw new Error("Usa un importe MXN positivo con hasta dos decimales.");
  const [whole, decimals = ""] = value.split(".");
  const cents = Number(whole) * 100 + Number(decimals.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents) || cents > MAX_CENTS) throw new Error("El importe excede el límite permitido.");
  return cents;
}
export const moneyInput = (cents: number) => `${cents < 0 ? "-" : ""}${Math.floor(Math.abs(cents) / 100)}.${String(Math.abs(cents) % 100).padStart(2, "0")}`;
export const money = (cents: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(cents / 100);
export function calculateTotals(items: { quantity: number; unitPriceCents: number; discountCents: number }[], orderDiscountCents: number, shippingCents: number, taxCents: number) {
  let subtotalCents = 0, itemDiscountCents = 0;
  for (const item of items) {
    if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 10000) throw new Error("Cantidad inválida.");
    const gross = item.quantity * item.unitPriceCents;
    if (![item.unitPriceCents, item.discountCents, gross].every(v => Number.isSafeInteger(v) && v >= 0 && v <= MAX_CENTS) || item.discountCents > gross) throw new Error("Descuento o precio de producto inválido.");
    subtotalCents += gross; itemDiscountCents += item.discountCents;
  }
  if (![orderDiscountCents, shippingCents, taxCents].every(v => Number.isSafeInteger(v) && v >= 0 && v <= MAX_CENTS) || orderDiscountCents > subtotalCents - itemDiscountCents) throw new Error("El descuento de la venta supera el subtotal.");
  const totalCents = subtotalCents - itemDiscountCents - orderDiscountCents + shippingCents + taxCents;
  if (subtotalCents > MAX_CENTS || totalCents > MAX_CENTS) throw new Error("El total excede el límite permitido.");
  return { subtotalCents, itemDiscountCents, orderDiscountCents, shippingCents, taxCents, totalCents };
}
/** Credits reduce the obligation. Refunds reduce cash collected, never the obligation twice. */
export function balance(totalCents: number, creditedCents: number, paidCents: number, refundedCents: number) {
  const dueCents = totalCents - creditedCents;
  const collectedCents = paidCents - refundedCents;
  return { dueCents, paidCents, refundedCents, collectedCents, outstandingCents: Math.max(0, dueCents - collectedCents), refundDueCents: Math.max(0, collectedCents - dueCents),
    paymentStatus: collectedCents > dueCents ? "REFUND_DUE" : dueCents === 0 && refundedCents > 0 ? "REFUNDED" : collectedCents >= dueCents ? "PAID" : collectedCents > 0 ? "PARTIAL" : "UNPAID" };
}
export function saleFolio(id: string) { return `JB-${id.replaceAll("-", "").toUpperCase()}`; }
export function assertReturnQuantity(sold: number, returned: number, quantity: number) {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > sold - returned) throw new Error("La devolución supera la cantidad pendiente de devolver.");
}
export const labels: { [key: string]: string } = {
  DRAFT: "Borrador", COMPLETED: "Completada", CANCELLED: "Cancelada", PENDING: "Pendiente", PREPARING: "Preparando", SHIPPED: "Enviado", DELIVERED: "Entregado",
  PERSONAL: "Entrega personal", PICKUP: "Recolección en tienda", SHIPPING: "Envío por paquetería", CASH: "Efectivo", TRANSFER: "Transferencia bancaria", CARD: "Tarjeta", MERCADO_PAGO: "Mercado Pago", OTHER: "Otro",
  UNPAID: "Sin pagar", PARTIAL: "Pago parcial", PAID: "Pagada", REFUND_DUE: "Reembolso pendiente", REFUNDED: "Reembolsada",
  SELLABLE: "Reintegrar a inventario vendible", DAMAGED: "Recibido dañado / no vendible", NONE: "Sin recepción física / sin reintegro",
  CREATED: "Venta registrada", COMPLETED_EVENT: "Venta completada", PAYMENT: "Pago registrado", REFUND: "Reembolso registrado", RETURN: "Devolución registrada", CANCELLED_EVENT: "Venta cancelada", FULFILLMENT: "Entrega actualizada",
};
export const saleLabel = (value: string) => labels[value] ?? value;
