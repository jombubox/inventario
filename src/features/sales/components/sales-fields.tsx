"use client";
import { useId, type InputHTMLAttributes, type ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { money } from "../domain/sales";

export function SalesField({ label, value, onChange, ...props }: { label: string; value: string; onChange: (v: string) => void } & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return <label className="grid content-start gap-1.5 text-small font-medium"><span>{label}</span><Input value={value} onChange={e => onChange(e.target.value)} {...props} /></label>;
}
export function SalesSelect({ label, value, onChange, children }: { label: string; value: string; onChange: (v: string) => void; children: ReactNode }) {
  const id = useId();
  return <div className="grid content-start gap-1.5 text-small font-medium"><label htmlFor={id}>{label}</label><Select id={id} value={value} onChange={e => onChange(e.target.value)}>{children}</Select></div>;
}
export function MoneyBreakdown({ totals, creditedCents = 0 }: { totals: { subtotalCents: number; itemDiscountCents: number; orderDiscountCents: number; shippingCents: number; taxCents: number; totalCents: number }; creditedCents?: number }) {
  return <dl className="ml-auto w-full max-w-sm space-y-2 text-small">{[["Subtotal", totals.subtotalCents], ["Descuentos por producto", -totals.itemDiscountCents], ["Descuento de la venta", -totals.orderDiscountCents], ["Envío", totals.shippingCents], ["Impuestos explícitos", totals.taxCents], ["Total MXN", totals.totalCents], ["Abonos por devolución / cancelación", -creditedCents]].map(([label, value]) => <div key={label} className={`flex justify-between gap-4 ${label === "Total MXN" ? "border-t border-border pt-3 text-body font-bold" : ""}`}><dt>{label}</dt><dd className="whitespace-nowrap tabular-nums">{money(Number(value))}</dd></div>)}</dl>;
}
export async function postSale(url: string, body: unknown): Promise<{ id?: string; error?: string; uncertain?: boolean }> {
  try {
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data: unknown = await response.json();
    if (!response.ok) return { error: typeof data === "object" && data && "error" in data ? String(data.error) : "No se pudo registrar la operación.", uncertain: response.status >= 500 };
    if (!data || typeof data !== "object" || !("id" in data) || typeof data.id !== "string") return { error: "No se pudo confirmar la respuesta. Reintenta la misma operación.", uncertain: true };
    return { id: data.id };
  } catch { return { error: "Se perdió la conexión. Reintenta; la operación no se duplicará.", uncertain: true }; }
}
