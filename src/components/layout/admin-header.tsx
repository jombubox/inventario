import Link from "next/link";

import { Brand } from "@/components/layout/brand";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { UserRole } from "@/features/auth/domain/permissions";
import { logoutAction } from "@/features/auth/server/actions";

const roleLabels: Record<UserRole, string> = {
  ADMIN: "Administrador",
  EDITOR: "Editor",
  VIEWER: "Consulta",
};

export function AdminHeader({
  user,
}: {
  user: { name: string; email: string; role: UserRole };
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
      <div className="flex min-h-18 items-center justify-between gap-4 px-5 py-3 sm:px-7 lg:px-9">
        <Link
          href="/admin"
          aria-label="JombuBox Admin, dashboard"
          className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden"
        >
          <Brand admin />
        </Link>
        <div className="hidden min-w-0 md:block">
          <p className="truncate text-small font-semibold text-navy">{user.name}</p>
          <p className="truncate text-small text-muted-foreground">{user.email}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={user.role === "ADMIN" ? "primary" : "neutral"}>
            {roleLabels[user.role]}
          </Badge>
          <form action={logoutAction}>
            <Button type="submit" variant="ghost" size="sm">
              Salir
            </Button>
          </form>
        </div>
      </div>
    </header>
  );
}
