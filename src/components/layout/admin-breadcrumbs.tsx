"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const segmentLabels: Record<string, string> = {
  productos: "Productos",
  nuevo: "Nuevo producto",
  inventario: "Inventario",
  ubicaciones: "Ubicaciones",
  usuarios: "Usuarios",
  importar: "Importar inventario",
  movimientos: "Movimientos",
  auditoria: "Auditoría",
};

export function AdminBreadcrumbs() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean).slice(1);

  return (
    <nav
      aria-label="Migas de pan"
      className="px-4 pt-5 text-small text-muted-foreground sm:px-7 lg:px-9"
    >
      <ol className="flex flex-wrap items-center gap-2">
        <li>
          {segments.length === 0 ? (
            <span aria-current="page">Dashboard</span>
          ) : (
            <Link href="/admin" className="hover:text-navy hover:underline">
              Dashboard
            </Link>
          )}
        </li>
        {segments.map((segment, index) => {
          const href = `/admin/${segments.slice(0, index + 1).join("/")}`;
          const isCurrent = index === segments.length - 1;
          const label =
            segmentLabels[segment] ??
            (segments[index - 1] === "productos" ? "Editar producto" : "Detalle");

          return (
            <li key={href} className="flex items-center gap-2">
              <span aria-hidden="true">/</span>
              {isCurrent ? (
                <span aria-current="page">{label}</span>
              ) : (
                <Link href={href} className="hover:text-navy hover:underline">
                  {label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
