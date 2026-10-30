import { describe, expect, it } from "vitest";

import {
  buildProductQuotationMessage,
  buildWhatsAppUrl,
  contact,
  genericContactMessage,
  productQuotationLabel,
  quotationProductUrl,
  type QuotationProduct,
} from "./contact";

const product: QuotationProduct = {
  title: 'Tarjeta Ñandú "75 pulgadas" & módulo + revisión 2 👋',
  sku: "JB-MB/Ñ-001.A+2&3",
  slug: "tarjeta-ñandú-75-revisión-2",
  partNumber: "RSAG7.820.XXXX/Ñ",
  availability: { key: "IN_STOCK" },
};

describe("WhatsApp contact links", () => {
  it("uses the exact business-provided Mexican number for generic contact", () => {
    const url = new URL(buildWhatsAppUrl(genericContactMessage));
    expect(contact.displayPhone).toBe("+52 1 81 4391 1759");
    expect(url.origin).toBe("https://wa.me");
    expect(url.pathname).toBe("/5218143911759");
    expect([...url.searchParams.keys()]).toEqual(["text"]);
    expect(url.searchParams.get("text")).toBe("Hola, buen día. Me comunico desde la página de Jombubox y me gustaría recibir información sobre sus productos. ¡Gracias!");
    expect(genericContactMessage).not.toMatch(/SKU:|Producto:|catalogo\//);
  });

  it.each([
    "áéíóú Ñ ñ 👋 日本語",
    "línea uno\nlínea dos\n\n¡Gracias!",
    'Título "Main" & otra + pieza? #2 / 50% = sí',
    "Texto literal %20 y %26; no predecodificar",
    "",
  ])("round-trips arbitrary message text once: %s", (message) => {
    const url = new URL(buildWhatsAppUrl(message));
    expect(url.searchParams.get("text")).toBe(message);
    expect(url.hash).toBe("");
    expect(url.toString()).not.toContain("\n");
  });

  it("includes only the exact public identity, canonical URL and quotation question", () => {
    const message = buildProductQuotationMessage(product);
    expect(message).toContain("Estoy interesado en cotizar un producto de Jombubox.");
    expect(message).toContain(`Producto: ${product.title}\nSKU: ${product.sku}\nNúmero de parte: ${product.partNumber}`);
    expect(message).toContain(`Enlace del producto:\n${quotationProductUrl(product.slug)}`);
    expect(message).toContain("¿Me pueden confirmar el precio, la disponibilidad y las opciones de envío?");
    const url = new URL(buildWhatsAppUrl(message));
    expect(url.searchParams.get("text")).toBe(message);
    expect(url.toString().length).toBeLessThan(2200);
  });

  it.each([undefined, null, "", "   "])("omits an absent optional part number: %s", (partNumber) => {
    const message = buildProductQuotationMessage({ ...product, partNumber });
    expect(message).not.toMatch(/Número de parte:|undefined|null/);
    expect(message).not.toContain("\n\n\n");
  });

  it("uses the route helper and the explicit production origin even during local/preview rendering", () => {
    const url = new URL(quotationProductUrl('pieza-ñ/revisión?x=1#parte'));
    expect(url.origin).toBe("https://inventario-five-mu.vercel.app");
    expect(decodeURIComponent(url.pathname)).toBe('/catalogo/pieza-ñ/revisión?x=1#parte');
    expect(url.search).toBe("");
    expect(url.hash).toBe("");
    expect(url.href).not.toMatch(/localhost|127\.0\.0\.1|\/admin/);
  });

  it("does not serialize extra private database fields", () => {
    const databaseRecord = {
      ...product,
      id: "PRIVATE_INTERNAL_ID",
      locationId: "PRIVATE_LOCATION",
      acquisitionCost: "PRIVATE_COST",
      notes: "PRIVATE_NOTES",
      audit: "PRIVATE_AUDIT",
      supplier: "PRIVATE_SUPPLIER",
      adminUrl: "https://example.test/admin/private",
      quantity: 99999,
    };
    const message = buildProductQuotationMessage(databaseRecord);
    expect(message).not.toMatch(/PRIVATE_|99999|\/admin|acquisition|location|quantity/);
    expect(message).toBe(buildProductQuotationMessage(product));
  });

  it("asks about sourcing or restocking only for exhausted public products", () => {
    const exhausted = { ...product, availability: { key: "OUT_OF_STOCK" as const } };
    expect(productQuotationLabel(exhausted)).toBe("Consultar disponibilidad");
    expect(buildProductQuotationMessage(exhausted)).toContain("si volverá a estar disponible o si pueden conseguirlo");
    for (const key of ["LOW_STOCK", "IN_STOCK"] as const) {
      const available = { ...product, availability: { key } };
      expect(productQuotationLabel(available)).toBe("Comprar por WhatsApp");
      expect(buildProductQuotationMessage(available)).not.toContain("volverá");
    }
  });

  it("produces distinct identities and URLs for different products", () => {
    const other = { ...product, title: "Fuente LG", sku: "LG-PSU-01", slug: "fuente-lg" };
    const message = buildProductQuotationMessage(other);
    expect(message).not.toContain(product.title);
    expect(message).not.toContain(product.sku);
    expect(message).toContain("https://inventario-five-mu.vercel.app/catalogo/fuente-lg");
    expect(message).not.toBe(buildProductQuotationMessage(product));
  });
});
