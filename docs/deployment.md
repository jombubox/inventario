# Despliegue Cloudflare + Neon

## Variables

Secretos/runtime bindings: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `ADMIN_BOOTSTRAP_NAME`, `ADMIN_BOOTSTRAP_EMAIL`, `ADMIN_BOOTSTRAP_PASSWORD`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`. Configuración: `APP_ENV`, `ENABLE_IMPORTS`, `BETTER_AUTH_URL`, `NEXT_PUBLIC_SITE_URL`, `CLOUDFLARE_ACCOUNT_ID`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL`.

Producción exige `APP_ENV=production`, un mismo origen HTTPS no local para `BETTER_AUTH_URL` y `NEXT_PUBLIC_SITE_URL`, secreto de 32+ caracteres, la identidad `ADMIN_BOOTSTRAP_*`, URL PostgreSQL y la configuración R2 completa. `R2_PUBLIC_URL` debe ser HTTPS y estar disponible tanto en build como en runtime.

Las credenciales del administrador deben existir como bindings del Worker en tiempo de ejecución. Definirlas solo en el shell/CI que ejecuta `pnpm cf:build` no las configura en Cloudflare. Verifica los nombres sin mostrar valores con `pnpm wrangler secret list`; crea o rota cada valor desde una terminal segura con `pnpm wrangler secret put <NOMBRE>` y vuelve a desplegar. Para `next dev`, define los mismos nombres en `.env.local`; para `pnpm preview`, defínelos en `.dev.vars`.

`wrangler.jsonc` usa `keep_vars=true` porque las variables de configuración de producción se administran en Cloudflare y no se versionan. Sin esa opción, un deploy de Wrangler puede eliminar variables creadas desde el dashboard que no aparezcan en el archivo; los secretos se administran por separado con Wrangler/Cloudflare. Antes de redeploy, confirma en el Worker servido por el dominio final que `DATABASE_URL` y todos los nombres anteriores siguen presentes; restaurar una variable en otro Worker o environment no corrige producción.

La validación está separada por capacidad: el catálogo valida `DATABASE_URL` al crear el cliente Neon y `R2_PUBLIC_URL` solo al construir una URL de imagen; la autenticación valida `ADMIN_BOOTSTRAP_*` y `BETTER_AUTH_SECRET` dentro de su propio límite. La ausencia de credenciales administrativas deshabilita el login de forma segura sin impedir las consultas públicas.

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

Antes de `deploy`: configurar secretos con Wrangler/Cloudflare y confirmar que `ADMIN_BOOTSTRAP_NAME`, `ADMIN_BOOTSTRAP_EMAIL`, `ADMIN_BOOTSTRAP_PASSWORD` y `BETTER_AUTH_SECRET` aparecen como bindings runtime, aplicar migraciones desde CI o una estación autorizada, verificar backup reciente y completar `release-checklist.md`. Después: `/api/health`, home, búsqueda, login, dashboard, refresh de `/admin`, logout, acceso anónimo rechazado, export e importación controlada.

Configurar Workers Logs y alertas por errores 5xx, eventos `database_pool_error`, `*_failed`, latencia y consumo. Crear rate limiting WAF por IP en rutas sensibles; los límites por usuario de la aplicación siguen activos.
