import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { getDb } from "@/db";
import { requirePagePermission } from "@/features/auth/server/authorization";
import { listAdministrativeUsers } from "@/features/users/data/admin-user-queries";
import { CreateUserForm, UserManagementForm } from "@/features/users/components/user-forms";
import { formatDateTime } from "@/lib/format";

export default async function UsersPage() {
  const currentUser = await requirePagePermission("USER_READ");
  const users = await listAdministrativeUsers(getDb());

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <PageHeader eyebrow="Acceso y permisos" title="Usuarios" description="Crea cuentas internas, asigna roles y revoca accesos administrativos." />
      <details className="rounded-2xl border border-border bg-card"><summary className="cursor-pointer px-5 py-4 font-semibold text-navy">Crear usuario administrativo</summary><div className="border-t border-border p-5"><CreateUserForm /></div></details>
      <Card><CardContent className="p-0">{users.length === 0 ? <div className="p-8"><EmptyState title="No hay usuarios" description="Utiliza el comando de bootstrap para crear el primer ADMIN." /></div> : <div className="overflow-x-auto"><table className="w-full min-w-[52rem] text-left text-small"><thead className="border-b border-border bg-muted/60 text-muted-foreground"><tr><th className="px-4 py-3 font-medium">Usuario</th><th className="px-4 py-3 font-medium">Rol</th><th className="px-4 py-3 font-medium">Estado</th><th className="px-4 py-3 font-medium">Creado</th><th className="px-4 py-3 font-medium">Actualizado</th><th className="px-4 py-3 font-medium">Administración</th></tr></thead><tbody className="divide-y divide-border">{users.map((account) => <tr key={account.id} className="align-top"><td className="px-4 py-4"><p className="font-semibold text-navy">{account.name}</p><p className="text-muted-foreground">{account.email}</p></td><td className="px-4 py-4"><Badge variant={account.role === "ADMIN" ? "primary" : "neutral"}>{account.role}</Badge></td><td className="px-4 py-4">{account.active ? <Badge variant="success">Activo</Badge> : <Badge variant="danger">Desactivado</Badge>}</td><td className="px-4 py-4 text-muted-foreground">{formatDateTime(account.createdAt)}</td><td className="px-4 py-4 text-muted-foreground">{formatDateTime(account.updatedAt)}</td><td className="px-4 py-4"><UserManagementForm userId={account.id} role={account.role} active={account.active} isCurrentUser={account.id === currentUser.id} /></td></tr>)}</tbody></table></div>}</CardContent></Card>
    </div>
  );
}
