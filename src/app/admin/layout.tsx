import type { Metadata } from "next";
import type { ReactNode } from "react";

import { AdminBreadcrumbs } from "@/components/layout/admin-breadcrumbs";
import { AdminHeader } from "@/components/layout/admin-header";
import { AdminMobileNav } from "@/components/layout/admin-mobile-nav";
import { AdminSidebar } from "@/components/layout/admin-sidebar";
import { requireAdmin } from "@/features/auth/server/admin-auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin",
  description: "Panel administrativo de JombuBox.",
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }: Readonly<{ children: ReactNode }>) {
  await requireAdmin();

  return (
    <div className="mx-auto grid min-h-dvh w-full max-w-[110rem] bg-background md:grid-cols-[17rem_minmax(0,1fr)]">
      <AdminSidebar />
      <div className="min-w-0">
        <AdminHeader />
        <AdminMobileNav />
        <AdminBreadcrumbs />
        <main className="px-4 pb-6 pt-4 sm:px-7 sm:pb-8 lg:px-9 lg:pb-9">{children}</main>
      </div>
    </div>
  );
}
