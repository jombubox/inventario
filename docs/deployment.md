# Despliegue Cloudflare + Neon

## Variables

Secretos: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`. Configuración: `APP_ENV`, `ENABLE_IMPORTS`, `BETTER_AUTH_URL`, `NEXT_PUBLIC_SITE_URL`, `CLOUDFLARE_ACCOUNT_ID`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL`.

Producción exige `APP_ENV=production`, un mismo origen HTTPS no local para `BETTER_AUTH_URL` y `NEXT_PUBLIC_SITE_URL`, secreto de 32+ caracteres, URL PostgreSQL y la configuración R2 completa. `R2_PUBLIC_URL` debe ser HTTPS y estar disponible tanto en build como en runtime.

## Preparación

```bash
pnpm install --frozen-lockfile
pnpm audit --prod --audit-level high
pnpm lint
pnpm typecheck
pnpm test
pnpm db:migrate
pnpm build
pnpm cf:build
```

Neon debe aceptar fetch y WebSockets; JombuBox usa `drizzle-orm/neon-serverless` con fetch para queries simples y clientes WebSocket de un solo uso para operaciones críticas con transacciones interactivas. `NEON_LOCAL_WS_PROXY` solo existe en el arnés local y nunca se configura en producción.

## Preview y producción

```bash
pnpm preview
# smoke test en la URL temporal
pnpm deploy
```

Antes de `deploy`: configurar secretos con Wrangler/Cloudflare, aplicar migraciones desde CI o una estación autorizada, verificar backup reciente y completar `release-checklist.md`. Después: `/api/health`, home, búsqueda, login, dashboard, export e importación controlada.

Configurar Workers Logs y alertas por errores 5xx, eventos `database_pool_error`, `*_failed`, latencia y consumo. Crear rate limiting WAF por IP en rutas sensibles; los límites por usuario de la aplicación siguen activos.
