import type { Metadata } from "next";
import type { ReactNode } from "react";

import { AdminBreadcrumbs } from "@/components/layout/admin-breadcrumbs";
import { AdminHeader } from "@/components/layout/admin-header";
import { AdminMobileNav } from "@/components/layout/admin-mobile-nav";
import { AdminSidebar } from "@/components/layout/admin-sidebar";
import { requireAdminPageSession } from "@/features/auth/server/authorization";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin",
  description: "Panel administrativo de JombuBox.",
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }: Readonly<{ children: ReactNode }>) {
  const user = await requireAdminPageSession();

  return (
    <div className="mx-auto grid min-h-dvh w-full max-w-[110rem] bg-background md:grid-cols-[17rem_minmax(0,1fr)]">
      <AdminSidebar role={user.role} />
      <div className="min-w-0">
        <AdminHeader user={user} />
        <AdminMobileNav role={user.role} />
        <AdminBreadcrumbs />
        <main className="px-4 pb-6 pt-4 sm:px-7 sm:pb-8 lg:px-9 lg:pb-9">{children}</main>
      </div>
    </div>
  );
}
