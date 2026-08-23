# JombuBox

JombuBox es el MVP operativo para catalogar refacciones electrónicas, controlar existencias físicas e importar el inventario legacy, con un catálogo público que nunca expone datos internos. La Fase 5/5 cierra seguridad, permisos, exportación XLSX, observabilidad, rendimiento, QA, respaldos y operación en Cloudflare Workers.

## Requisitos

- Node.js 22 o superior y pnpm 10.15.
- Neon PostgreSQL con extensión `pg_trgm`.
- Docker para integración/E2E local.
- Cloudflare Workers/OpenNext y Cloudflare R2 para producción.

```bash
nvm use
pnpm install
```

## Configuración

Copia `.env.example` a `.env.local` y define valores reales. Nunca publiques ese archivo.

| Variable | Uso |
|---|---|
| `DATABASE_URL` | Conexión pooled de Neon |
| `BETTER_AUTH_SECRET` | Secreto aleatorio de al menos 32 caracteres |
| `BETTER_AUTH_URL` | Origen HTTPS canónico de autenticación |
| `NEXT_PUBLIC_SITE_URL` | Origen HTTPS de metadata, sitemap y enlaces |
| `APP_ENV` | `development`, `preview` o `production` |
| `ENABLE_IMPORTS` | Kill switch del importador |
| `CLOUDFLARE_ACCOUNT_ID` | Identificador de la cuenta Cloudflare |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | Credenciales R2 server-only |
| `R2_BUCKET_NAME` | Bucket canónico de imágenes |
| `R2_PUBLIC_URL` | Dominio público o URL pública del bucket |

`NEON_LOCAL_WS_PROXY` es únicamente para pruebas locales. El schema de entorno exige la configuración R2 completa en producción.

## Puesta en marcha

```bash
pnpm db:migrate
pnpm db:seed
pnpm admin:create
pnpm dev
```

No existe registro público. `pnpm admin:create` crea el primer ADMIN de forma interactiva; las cuentas siguientes se gestionan en `/admin/usuarios`.

## Rutas

- `/`, `/catalogo`, `/catalogo/[slug]`: catálogo público.
- `/sitemap.xml`, `/robots.txt`: descubrimiento SEO.
- `/login`: acceso interno.
- `/admin`: productos, inventario, ubicaciones, importación, imágenes, movimientos, auditoría y usuarios.
- `/api/health`: liveness sin consulta a DB ni secretos.
- `/api/exports/inventory`: exportación protegida ADMIN/EDITOR.

## Comandos

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build
pnpm cf:build
pnpm test:e2e

pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm admin:create

pnpm preview
pnpm upload
pnpm deploy
```

En Windows sin privilegio de symlinks, valida el bundle OpenNext dentro de Linux:

```bash
docker build --file Dockerfile.ci --target verify .
```

Integración y E2E solo limpian una PostgreSQL local llamada exactamente `jumbobox_test`:

```powershell
$env:TEST_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:54330/jumbobox_test'
pnpm test:integration
pnpm test:e2e
```

Playwright levanta el proxy WebSocket oficial de Neon y un fake S3/R2 local. El guard del seed rechaza hosts remotos y otros nombres de base. Las credenciales E2E son fixtures exclusivas de prueba y nunca deben usarse fuera de `jumbobox_test`.

## Arquitectura

```text
src/
  app/                 # UI pública/admin y route handlers
  components/          # Sistema visual y shells
  db/                  # Schema, relaciones, conexión y seed
  features/
    catalog/           # DTOs públicos, búsqueda, stock y SEO
    products/          # Identidad, SKU y administración
    inventory/         # Existencias y movimientos transaccionales
    imports|exports/   # Migración legacy y salida XLSX
    images/            # Validación, almacenamiento R2 y URLs públicas
    auth|users|audit|locations|admin|security/
  validators/          # Contratos Zod server-side
  lib/                 # Auth, entorno, redacción y observabilidad
tests/e2e/             # Flujos de aceptación desktop/mobile
drizzle/               # Migraciones append-only
docs/                  # Runbooks y decisiones operativas
```

El runtime usa `@neondatabase/serverless`: las consultas simples del Pool viajan por fetch y las transacciones interactivas de Drizzle adquieren una conexión WebSocket de un solo uso. Las consultas públicas devuelven DTOs explícitos y aplican `ACTIVE + isPublic + deletedAt IS NULL` en SQL. Costo, adquisición, notas, ubicación, códigos legacy, cantidades exactas, usuarios y auditoría no cruzan esa frontera.

## Cloudflare y operación

OpenNext se ejecuta con `nodejs_compat`. `next/image` acepta el origen y la ruta configurados por `R2_PUBLIC_URL`; en producción usa el dominio personalizado HTTPS del bucket. Configura secretos con Wrangler/Cloudflare, aplica migraciones antes del despliegue y completa el checklist de release. Para el build final usa CI Linux, WSL o `Dockerfile.ci` si Windows no puede crear symlinks.

Documentación clave: [administración](docs/admin.md), [manual operativo](docs/admin-manual.md), [inventario](docs/inventory-rules.md), [importaciones](docs/imports.md), [catálogo público](docs/public-catalog.md), [seguridad](docs/security.md), [backups](docs/backups.md), [recuperación](docs/disaster-recovery.md), [despliegue](docs/deployment.md) y [release](docs/release-checklist.md).
