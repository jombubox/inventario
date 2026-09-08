# Checklist de lanzamiento

## Código y datos

- [x] Lint, TypeScript, unitarias e integración en verde.
- [x] Build Next y OpenNext ejecutados en entorno Linux/CI.
- [x] Migración `0005` probada desde una base vacía.
- [x] Concurrencia de stock y SKU probada sobre PostgreSQL real.
- [x] Roles, filtrado público, XLSX e imágenes cubiertos por E2E/fakes.
- [ ] Tomar backup verificado inmediatamente antes del lanzamiento.
- [ ] Aplicar migraciones a producción y conservar salida de CI.

## Plataforma

- [ ] Cloudflare preview ejecutado con base no productiva y smoke test aprobado.
- [ ] Dominio final confirmado en ambas URLs públicas.
- [ ] `BETTER_AUTH_SECRET` y los tres bindings runtime `ADMIN_BOOTSTRAP_*` creados/rotados y no compartidos por chat.
- [ ] Retención PITR/restore de Neon confirmada contractualmente.
- [ ] Objetos de imágenes respaldados o versionados en Cloudflare R2.
- [ ] Workers Logs, alertas, WAF rate limits y health monitor activos.
- [ ] Responsable, RPO/RTO y ventana de despliegue aceptados.

## Smoke test

- [ ] `/api/health` devuelve 200 y un `X-Request-Id`.
- [ ] Home, búsqueda, filtros, detalle, 404 privada y sitemap.
- [ ] Login ENV ADMIN con credencial correcta; refresh y navegación conservan la sesión.
- [ ] Correo incorrecto y contraseña incorrecta se rechazan sin crear cookie.
- [ ] Logout elimina la sesión y `/admin` vuelve a redirigir a `/login`.
- [ ] Crear producto, existencia, movimiento y ubicación de prueba.
- [ ] Exportar XLSX y abrir las cuatro hojas.
- [ ] Importar un archivo controlado; desactivar `ENABLE_IMPORTS` después si la migración terminó.
- [ ] Subir, ordenar, promover y eliminar una imagen de prueba.
- [ ] Confirmar auditoría y logs sin datos sensibles.
- [ ] Verificar navegación, foco, labels y contraste con teclado.
- [ ] Revisar 320, 375, 390, 768, 1024, 1280, 1440 y 1920 px sin scroll horizontal.
- [ ] Verificar `robots.txt`, `sitemap.xml`, canonical, Open Graph y JSON-LD.
- [ ] Abrir el XLSX en Excel/LibreOffice y confirmar tipos, filtros y fórmulas neutralizadas.

## Rendimiento y caché

- [ ] Lighthouse de home, catálogo y producto dentro del presupuesto acordado.
- [ ] Consultas representativas revisadas con `EXPLAIN (ANALYZE, BUFFERS)` en un clon, no en producción caliente.
- [ ] No existe caché pública en admin; publicación, stock, precio e imágenes se reflejan en la siguiente petición pública.
- [ ] Assets estáticos tienen caché larga y los documentos XLSX/API privados usan `no-store`.

## Go/no-go

- No-go ante cualquier blocker/crítico/alto abierto, backup sin verificar, migración fallida, origen HTTPS incorrecto, logs ausentes o rollback no disponible.
