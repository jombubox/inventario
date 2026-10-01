import type { Metadata } from "next";
import type { ReactNode } from "react";

import { getDb } from "@/db";
import { AdminBreadcrumbs } from "@/components/layout/admin-breadcrumbs";
import { AdminHeader } from "@/components/layout/admin-header";
import { AdminMobileNav } from "@/components/layout/admin-mobile-nav";
import { AdminSidebar } from "@/components/layout/admin-sidebar";
import { requireAdmin } from "@/features/auth/server/admin-auth";
import { AdminQuickAddProvider } from "@/features/inventory/components/quick-add-inventory";
import { listQuickAddOptions } from "@/features/inventory/data/quick-add-queries";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Gestión de inventario",
  description: "Gestión de inventario de JombuBox.",
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }: Readonly<{ children: ReactNode }>) {
  await requireAdmin();
  const quickAddOptions = await listQuickAddOptions(getDb());

  return (
    <AdminQuickAddProvider options={quickAddOptions}>
      <div className="mx-auto grid min-h-dvh w-full max-w-[110rem] bg-background md:grid-cols-[17rem_minmax(0,1fr)]">
        <AdminSidebar />
        <div className="min-w-0">
          <AdminHeader />
          <AdminMobileNav />
          <AdminBreadcrumbs />
          <main className="px-4 pb-6 pt-4 sm:px-7 sm:pb-8 lg:px-9 lg:pb-9">{children}</main>
        </div>
      </div>
    </AdminQuickAddProvider>
  );
}
