# Seguridad del MVP

## Límites de confianza

- No existe registro público. Better Auth maneja credenciales, sesiones y cookies; en producción se fuerzan cookies seguras y un único origen HTTPS confiable.
- El middleware solo mejora la navegación. El límite real está en el layout, cada página, cada Server Action y cada Route Handler mediante permisos server-side.
- Los roles son `ADMIN`, `EDITOR` y `VIEWER`. Solo `ADMIN` administra usuarios y consulta auditoría; `VIEWER` no muta ni exporta.
- Las mutaciones HTTP validan `Origin`/`Sec-Fetch-Site`; las Server Actions se benefician de las protecciones de origen de Next y siempre vuelven a autorizar en el servidor.
- Los DTO públicos seleccionan campos explícitos y filtran en SQL `ACTIVE`, `is_public=true`, `deleted_at is null`. No incluyen costo, adquisición, notas, ubicación, legacy, usuarios, auditoría ni movimientos.

## Controles implementados

- Zod con allowlists y límites server-side evita mass assignment; los identificadores enviados por el navegador nunca sustituyen al actor autenticado.
- React escapa texto. El único JSON-LD se serializa con escape seguro y no incorpora HTML arbitrario.
- CSP, `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `nosniff`, Referrer Policy, Permissions Policy y COOP se sirven globalmente; HSTS se activa solo con `APP_ENV=production`.
- Better Auth limita login en PostgreSQL. Importación, exportación e imágenes tienen límites persistentes por usuario y devuelven `429` con `Retry-After`.
- XLSX limita tamaño, hojas, columnas y filas; no ejecuta macros y normaliza celdas. El export antepone apóstrofo a valores que podrían iniciar fórmulas.
- Imágenes: allowlist JPEG/PNG/WEBP, máximo 10 MB, firma binaria, máximo 10 por producto, subida directa y verificación de metadata/propiedad antes de registrar.
- Logs JSON incluyen `requestId`, evento y contexto mínimo. Claves sensibles, tokens, contraseñas, cookies y URLs de base se redactan.
- No hay CORS abierto ni secretos de producción versionados.

## Operación y respuesta

1. Ante sospecha de abuso, preservar `requestId`, `cf-ray`, usuario, ruta y hora; no copiar secretos a tickets.
2. Desactivar importaciones con `ENABLE_IMPORTS=false` si el incidente está relacionado con migración masiva.
3. Revocar sesiones desactivando al usuario; Better Auth elimina sus sesiones activas.
4. Rotar el secreto o token comprometido en Cloudflare/Neon y volver a desplegar. Rotar `BETTER_AUTH_SECRET` invalida sesiones y debe anunciarse.
5. Aplicar rate limiting adicional por IP en Cloudflare WAF a `/api/auth/sign-in/email`, `/api/imports/*`, `/api/products/images/*` y búsquedas abusivas. No confiar solo en IP dentro de la aplicación.

## Contención / mantenimiento

- Importaciones: desplegar `ENABLE_IMPORTS=false`; historial y descargas siguen disponibles.
- Mutaciones administrativas: no existe un flag global oculto. Ante incidente, desactivar cuentas/sesiones afectadas y aplicar temporalmente Cloudflare Access/WAF a `/admin/*` y APIs mutables.
- Sitio completo: retirar temporalmente la ruta/custom domain del Worker o desplegar una versión de mantenimiento previamente revisada. Conservar una URL operativa privada para diagnóstico y restaurar solo tras smoke test.

## Riesgo residual aceptado para el MVP

- CSP conserva `'unsafe-inline'` porque Next inyecta estilos/scripts de runtime; eliminarlo requiere nonces y una iteración específica.
- `pnpm audit --prod` reporta dos avisos moderados transitivos: `uuid` vía ExcelJS y `esbuild` en una ruta de tooling de Better Auth/Drizzle. No hay avisos altos o críticos y las APIs vulnerables no se invocan directamente.
- El endpoint `/api/health` solo comprueba disponibilidad del Worker; deliberadamente no consulta PostgreSQL ni expone dependencias.

## Checklist antes de producción

- [ ] Orígenes finales HTTPS coinciden y HSTS/CSP están presentes.
- [ ] Registro público desactivado; cookies `HttpOnly`, `Secure` y `SameSite` comprobadas.
- [ ] ADMIN/EDITOR/VIEWER probados tanto en UI como por llamada directa.
- [ ] Secretos suministrados por la plataforma, rotados y ausentes de repo/logs.
- [ ] WAF y alertas activos; límites persistentes responden `429`.
- [ ] Exportes tratados como datos internos y `ENABLE_IMPORTS` en el estado esperado.
- [ ] Rol/credenciales de DB tienen mínimo privilegio y no permiten acceso público directo.
- [ ] DTO público y HTML comprobados sin costo, ubicación, legacy, notas, auditoría ni usuarios.
- [ ] `pnpm audit --prod --audit-level high` y suites de seguridad en verde.
