import { PageHeader } from "@/components/ui/page-header";
import { requireAdmin } from "@/features/auth/server/admin-auth";
import { NewSale } from "@/features/sales/components/new-sale";

export default async function NewSalePage() {
  await requireAdmin();
  return <div className="mx-auto w-full max-w-6xl space-y-6"><PageHeader eyebrow="Ventas" title="Nueva venta" description="Registra productos, cliente, entrega y pagos. Todos los importes están en MXN." /><NewSale /></div>;
}
