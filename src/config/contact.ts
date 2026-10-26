import { publicProductPath } from "@/features/products/domain/public-product";
import type { PublicAvailability } from "@/features/catalog/domain/catalog";

export const contact = {
  businessName: "JumboBox",
  displayPhone: "+52 1 81 4391 1759",
  whatsappPhone: "5218143911759",
  // Business-provided production origin. Never derive a shared quotation from
  // the request host or a local/preview deployment's metadata base.
  productionOrigin: "https://inventario-five-mu.vercel.app",
} as const;

export const genericContactMessage =
  `Hola, buen día. Me comunico desde la página de ${contact.businessName} y me gustaría recibir información sobre sus productos. ¡Gracias!`;

export function buildWhatsAppUrl(message: string): string {
  const url = new URL(`https://wa.me/${contact.whatsappPhone}`);
  url.searchParams.set("text", message);
  return url.toString();
}

export function quotationProductUrl(slug: string): string {
  return new URL(publicProductPath(slug), contact.productionOrigin).toString();
}

// An explicit public projection: never spread or serialize a database record.
export type QuotationProduct = {
  title: string;
  sku: string;
  slug: string;
  partNumber?: string | null;
  availability: Pick<PublicAvailability, "key">;
};

export function productQuotationLabel(product: QuotationProduct): string {
  return product.availability.key === "OUT_OF_STOCK"
    ? "Consultar disponibilidad"
    : "Comprar por WhatsApp";
}

export function buildProductQuotationMessage(product: QuotationProduct): string {
  const identity = [
    `Producto: ${product.title}`,
    `SKU: ${product.sku}`,
    ...(product.partNumber?.trim() ? [`Número de parte: ${product.partNumber}`] : []),
  ].join("\n");
  const question = product.availability.key === "OUT_OF_STOCK"
    ? "¿Podrían confirmar si volverá a estar disponible o si pueden conseguirlo, y las opciones de precio y envío?"
    : "¿Me pueden confirmar el precio, la disponibilidad y las opciones de envío?";

  return [
    "Hola, buen día. 👋",
    `Estoy interesado en cotizar un producto de ${contact.businessName}.`,
    identity,
    `Enlace del producto:\n${quotationProductUrl(product.slug)}`,
    question,
    "¡Gracias!",
  ].join("\n\n");
}
