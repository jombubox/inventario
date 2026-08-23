# Administración, autenticación y seguridad

Este documento describe la administración cerrada del MVP. Las reglas del modelo base y la estrategia para datos legacy permanecen en `docs/data-model.md`.

## Autenticación y sesiones

JombuBox usa Better Auth 1.6.26 con su adaptador oficial de Drizzle para PostgreSQL. El handler vive en `/api/auth/[...all]`; las tablas `user`, `session`, `account`, `verification` y `rate_limit` están integradas en el schema Drizzle. Las contraseñas pertenecen a la cuenta `credential` de Better Auth y nunca se guardan en una tabla custom ni en texto plano.

No existe registro público. `emailAndPassword.disableSignUp` está habilitado y las cuentas se crean mediante el bootstrap seguro o desde `/admin/usuarios`. La contraseña debe tener entre 12 y 128 caracteres.

Las sesiones se persisten en PostgreSQL, expiran a los siete días y pueden renovarse después de un día. Better Auth entrega la cookie de sesión HttpOnly, SameSite apropiado y Secure en producción. El logout invalida la sesión y elimina la cookie. Desactivar un usuario también marca la cuenta como bloqueada y elimina todas sus sesiones. Ningún token, hash o dato interno de sesión se envía a los componentes de cliente.

`middleware.ts` hace una redirección optimista de visitantes sin cookie. Se conserva deliberadamente esta convención Edge —aunque Next.js 16 la depreca— porque OpenNext 1.20 todavía no admite el runtime Node obligatorio de `proxy.ts`. No se considera una frontera de seguridad: el layout `/admin` siempre valida la sesión completa con Better Auth y comprueba que el usuario continúe activo. Las Server Actions y servicios vuelven a comprobar el permiso concreto.

El rate limiting vive en PostgreSQL, por lo que funciona entre instancias distribuidas de Workers: 100 solicitudes por minuto como límite general y 5 intentos por minuto para `/sign-in/email`. Cloudflare `CF-Connecting-IP` se usa como cabecera de IP confiable en el despliegue.

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

La navegación oculta acciones no disponibles, pero esto es únicamente UX. `requirePermission()` protege Server Actions y páginas específicas; `assertPermission()` vuelve a aplicar la política dentro de cada servicio mutable. La ruta de usuarios es ADMIN-only.

## Primer ADMIN

Ejecuta las migraciones y luego:

```bash
pnpm admin:create
```

El script pide nombre y correo de forma visible y contraseña mediante entrada oculta. En ejecución no interactiva acepta:

```text
JOMBUBOX_ADMIN_NAME
JOMBUBOX_ADMIN_EMAIL
JOMBUBOX_ADMIN_PASSWORD
```

La contraseña no se imprime. El script se niega a crear otro usuario si ya existe un ADMIN; los usuarios posteriores se crean desde `/admin/usuarios`.

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

## Usuarios

ADMIN puede crear cuentas con Better Auth, elegir ADMIN/EDITOR/VIEWER, cambiar roles y desactivar usuarios. Better Auth crea el hash de credencial; la contraseña no se audita ni se registra. Los cambios de rol y desactivaciones bloquean las filas de todos los administradores activos dentro de la transacción, evitando carreras que puedan dejar a JombuBox sin un ADMIN activo.

La creación de credencial usa la transacción interna de Better Auth y la auditoría se escribe inmediatamente después; no se intenta envolver la librería con una transacción incompatible. Cambios de rol, desactivación, revocación de sesiones y su auditoría sí son atómicos.

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
- Better Auth valida origen en sus endpoints y usa cookies SameSite. Las mutaciones de negocio usan Server Actions de Next.js, que comprueban el origen frente al host. No se añadió un token CSRF paralelo.
- Los headers incluyen CSP restringiendo objetos, base URI, framing y destinos de formulario; también `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` y `X-Frame-Options`.
- Las consultas seleccionan solo los campos necesarios; los listados nunca exponen tablas internas de auth.
- IDs, precios, cantidades, roles, catálogos y relaciones se validan server-side. Los servicios verifican existencia antes de producir errores de FK cuando se necesita una UX clara.
- Movimientos y ajustes usan transacción y bloqueo de fila. La DB refuerza cantidades, estados, formatos, unicidad y relaciones.

## Cloudflare y secretos

En producción define `DATABASE_URL`, `BETTER_AUTH_SECRET` y `BETTER_AUTH_URL` mediante secretos/variables del Worker. Usa una URL HTTPS pública en `BETTER_AUTH_URL`. Neon atiende consultas simples del Pool por fetch; inventario, SKU, importación y auditoría adquieren WebSocket solo durante la transacción y el cliente se elimina al liberarse. El driver `pg` queda reservado a migraciones, seed y pruebas locales.

No subas `.env.local` ni `.dev.vars`. Rota inmediatamente cualquier secreto que haya aparecido en código, logs o historial.
