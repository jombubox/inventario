# Administración, autenticación y seguridad

Este documento describe la administración cerrada del MVP. Las reglas del modelo base y la estrategia para datos legacy permanecen en `docs/data-model.md`.

## Autenticación y sesiones

JombuBox tiene un único administrador canónico definido por `ADMIN_BOOTSTRAP_NAME`, `ADMIN_BOOTSTRAP_EMAIL` y `ADMIN_BOOTSTRAP_PASSWORD`. La comparación ocurre exclusivamente dentro de la Server Action de login. No existe registro público, endpoint de Better Auth ni credencial administrativa en PostgreSQL.

Al autenticar, el servidor emite una sesión HMAC firmada con una clave derivada de `BETTER_AUTH_SECRET` y la contraseña configurada. El payload contiene únicamente versión, ID virtual `env-admin`, rol y tiempos; no contiene nombre, correo ni contraseña. La cookie expira a las 12 horas, es `HttpOnly`, `SameSite=Lax`, `Path=/` y `Secure` con prefijo `__Host-` en producción. Cambiar la contraseña o `BETTER_AUTH_SECRET` invalida las sesiones existentes. Logout expira la cookie.

`middleware.ts` hace una redirección optimista de visitantes sin cookie. Se conserva deliberadamente esta convención Edge —aunque Next.js 16 la depreca— porque OpenNext 1.20 todavía no admite el runtime Node obligatorio de `proxy.ts`. No es una frontera de seguridad: el DAL de autorización valida firma, expiración e identidad ENV en el layout, páginas, Server Actions y Route Handlers.

El login limita fallos por IP a cinco por minuto dentro de cada instancia. En producción debe complementarse con el rate limiting distribuido de Vercel/Cloudflare WAF.

## Roles y permisos

La matriz está centralizada en `src/features/auth/domain/permissions.ts`.

| Permiso | ADMIN | EDITOR | VIEWER |
|---|:---:|:---:|:---:|
| DASHBOARD_VIEW | Sí | Sí | Sí |
| PRODUCT_READ | Sí | Sí | Sí |
| PRODUCT_CREATE | Sí | Sí | No |
| PRODUCT_UPDATE | Sí | Sí | No |
| PRODUCT_ARCHIVE | Sí | Sí | No |
| INVENTORY_READ | Sí | Sí | Sí |
| INVENTORY_CREATE | Sí | Sí | No |
| INVENTORY_UPDATE | Sí | Sí | No |
| INVENTORY_EXPORT | Sí | Sí | No |
| INVENTORY_MOVE | Sí | Sí | No |
| INVENTORY_IN | Sí | Sí | No |
| INVENTORY_OUT | Sí | Sí | No |
| MOVEMENT_READ | Sí | Sí | Sí |
| LOCATION_READ | Sí | Sí | Sí |
| LOCATION_CREATE | Sí | Sí | No |
| LOCATION_UPDATE | Sí | Sí | No |
| USER_READ | Sí | No | No |
| USER_MANAGE | Sí | No | No |
| AUDIT_READ | Sí | No | No |
| IMPORT_READ | Sí | Sí | Sí |
| IMPORT_EXECUTE | Sí | Sí | No |
| IMAGE_MANAGE | Sí | Sí | No |

La navegación oculta acciones no disponibles, pero esto es únicamente UX. `requirePermission()` protege Server Actions y páginas específicas; `assertPermission()` vuelve a aplicar la política dentro de cada servicio mutable. La sesión ENV siempre representa `ADMIN`, por lo que satisface toda la matriz sin excepciones dispersas.

## Administrador ENV

Configura en el entorno de ejecución:

```text
ADMIN_BOOTSTRAP_NAME
ADMIN_BOOTSTRAP_EMAIL
ADMIN_BOOTSTRAP_PASSWORD
BETTER_AUTH_SECRET
```

No se ejecuta un bootstrap. Después del despliegue, `/login` usa esas variables directamente. La contraseña exige entre 16 y 128 caracteres y nunca debe tener prefijo `NEXT_PUBLIC_`.

## Mutaciones y concurrencia

Los formularios usan Server Actions y Zod. El cliente nunca determina SKU, código de inventario, rol efectivo ni campos de auditoría. Cada acción valida sesión, permiso e input, y luego delega en un servicio. Los servicios usan listas explícitas de campos para evitar mass assignment.

Productos, inventario y ubicaciones se modifican en transacciones. Productos, detalles físicos de inventario y ubicaciones usan `updatedAt` como token de concurrencia optimista. Los timestamps operativos tienen precisión de milisegundos para que el token sea idéntico entre PostgreSQL, JavaScript y formularios. Si otro usuario ya modificó la fila, la actualización no sobrescribe silenciosamente y devuelve un mensaje para recargar.

## Productos y SKU

La creación carga marca y tipo desde catálogos activos, normaliza número de parte y compatibilidades, genera el título sugerido, crea slug estable y vuelve a generar el SKU en servidor. El preview del formulario usa el mismo helper puro, pero no se confía en el valor del cliente. Una identidad duplicada se rechaza; una colisión real de representación recibe sufijos `-02` a `-99`.

El SKU es inmutable en edición. Cambiar marca, tipo, número de parte, compatibilidad o título no lo regenera. Archivar conserva el producto y su historial, establece `status=ARCHIVED` y fuerza `isPublic=false`. Cualquier estado distinto de ACTIVE también impide que el servicio deje el producto público.

La búsqueda y filtros se ejecutan en PostgreSQL. Se busca por SKU, título, número de parte, marca o modelo compatible; marca, tipo, estado, publicación y stock usan parámetros validados. El sort solo acepta `updatedAt`, `title`, `sku` o `createdAt`. La paginación offset permite 20, 50 o 100 filas.

## Inventario y stock

Crear un lote exige cantidad inicial mayor que cero. PostgreSQL protege además que nunca sea negativa y mantiene consistencia entre cantidad y estado. `inventoryCode` se genera exclusivamente en servidor con una secuencia PostgreSQL (`INV-000001`, etc.), que es segura frente a concurrencia.

Cada alta crea un movimiento INITIAL. Mover una existencia bloquea la fila con `SELECT ... FOR UPDATE`, valida una ubicación destino activa, rechaza el mismo lugar, actualiza la fila y crea movimiento MOVE y auditoría en la misma transacción. Un artículo legacy inicialmente sin ubicación sí puede asignarse por primera vez.

Ajustar cantidad pide nueva cantidad, nuevo estado y motivo. La fila se bloquea, se calcula `delta` y se registran `fromQuantity`, `toQuantity`, `delta`, estados anterior/nuevo y el actor dentro de un movimiento ADJUSTMENT. La cantidad no puede editarse mediante el formulario de datos físicos.

Semántica de stock:

- `physicalStock`: suma AVAILABLE, RESERVED y DAMAGED.
- `availableStock`: suma únicamente AVAILABLE.
- RESERVED es físico pero no disponible.
- SOLD y SCRAPPED deben tener cantidad actual cero y no cuentan como stock físico/vendible.
- “Unidades vendidas” del dashboard suma movimientos SALE históricos; no cuenta filas SOLD con cantidad cero.
- “Productos sin ubicación” cuenta productos distintos con inventario activo, `quantity > 0` y `locationId` vacío; no incluye productos sin inventario.

## Ubicaciones

Las ubicaciones admiten jerarquía arbitraria con nombre, código único, tipo, padre, estado y notas. Los helpers generan breadcrumbs completos para listados y selectores. Crear o cambiar un padre comprueba su existencia, rechaza self-parent y recorre ancestros para impedir ciclos. No hay borrado físico desde el admin; una ubicación puede marcarse inactiva.

El selector MVP carga hasta 1,000 ubicaciones activas y muestra el breadcrumb. Esta frontera está aislada en la consulta de opciones para sustituirla más adelante por búsqueda server-side sin cambiar los servicios.

## Identidad administrativa

`/admin/usuarios` muestra la identidad ENV en modo lectura. Los cambios de nombre, correo o contraseña se realizan en la plataforma de despliegue y requieren redeploy. Las tablas históricas `user`, `account`, `session` y `verification` se conservan solo por compatibilidad de migraciones; el runtime administrativo no las consulta.

## Auditoría

Se registran estos eventos:

- PRODUCT_CREATED, PRODUCT_UPDATED, PRODUCT_ARCHIVED.
- INVENTORY_CREATED, INVENTORY_UPDATED, INVENTORY_ADJUSTED, INVENTORY_MOVED.
- LOCATION_CREATED, LOCATION_UPDATED.
- USER_CREATED, USER_ROLE_CHANGED, USER_DEACTIVATED.
- IMPORT_PREVIEWED, IMPORT_STARTED, IMPORT_COMPLETED, IMPORT_FAILED.
- PRODUCT_IMAGE_ADDED, PRODUCT_IMAGE_REMOVED, PRODUCT_IMAGE_REORDERED, PRODUCT_PRIMARY_IMAGE_CHANGED, PRODUCT_IMAGE_ALT_UPDATED.
- INVENTORY_IN, INVENTORY_OUT, INVENTORY_SALE, INVENTORY_RETURN.
- INVENTORY_EXPORTED.

Cada registro contiene actor, entidad, `before`, `after`, metadata limitada y fecha. Los snapshots seleccionan campos útiles de forma explícita. Contraseñas, hashes, tokens, cookies, secretos y URLs de conexión no forman parte de la capa de auditoría.

## Seguridad web

- Las páginas administrativas son dinámicas y no usan caché pública; mutaciones revalidan las rutas afectadas.
- El login usa una Server Action de Next.js, que comprueba el origen frente al host, y la cookie usa `SameSite=Lax`. Las demás mutaciones conservan sus comprobaciones de origen. No se añadió un token CSRF paralelo.
- Los headers incluyen CSP restringiendo objetos, base URI, framing y destinos de formulario; también `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` y `X-Frame-Options`.
- Las consultas seleccionan solo los campos necesarios; los listados nunca exponen tablas internas de auth.
- IDs, precios, cantidades, roles, catálogos y relaciones se validan server-side. Los servicios verifican existencia antes de producir errores de FK cuando se necesita una UX clara.
- Movimientos y ajustes usan transacción y bloqueo de fila. La DB refuerza cantidades, estados, formatos, unicidad y relaciones.

## Cloudflare y secretos

En producción define `DATABASE_URL`, `BETTER_AUTH_SECRET`, `ADMIN_BOOTSTRAP_NAME`, `ADMIN_BOOTSTRAP_EMAIL` y `ADMIN_BOOTSTRAP_PASSWORD` mediante secretos/variables de la plataforma. Neon atiende consultas simples del Pool por fetch; inventario, SKU, importación y auditoría adquieren WebSocket solo durante la transacción y el cliente se elimina al liberarse. El login no consulta Neon.

No subas `.env.local` ni `.dev.vars`. Rota inmediatamente cualquier secreto que haya aparecido en código, logs o historial.
