import Link from "next/link";

import { PageHeader } from "@/components/ui/page-header";
import { getDb } from "@/db";
import { requirePagePermission } from "@/features/auth/server/authorization";
import { ProductForm } from "@/features/products/components/product-form";
import { listProductCatalogOptions } from "@/features/products/data/admin-product-queries";

export default async function NewProductPage() {
  await requirePagePermission("PRODUCT_CREATE");
  const options = await listProductCatalogOptions(getDb());

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <PageHeader eyebrow="Catálogo" title="Nuevo producto" description="Define la identidad comercial. El inventario físico se registra por separado." actions={<Link href="/admin/productos" className="text-small font-semibold text-primary hover:underline">Volver a productos</Link>} />
      <ProductForm brands={options.brands} componentTypes={options.componentTypes} />
    </div>
  );
}
