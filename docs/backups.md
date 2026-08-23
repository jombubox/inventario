# Backups

El export XLSX es una herramienta operativa, no un backup. PostgreSQL y Cloudflare R2 tienen ciclos de respaldo distintos.

## PostgreSQL / Neon

- Activar y verificar la retención de restore/PITR del plan de Neon antes del lanzamiento.
- Además, generar cada noche un dump lógico cifrado con `pg_dump --format=custom --no-owner --no-acl`. Guardarlo en almacenamiento privado distinto de Neon, con retención sugerida: 7 diarios, 4 semanales y 12 mensuales.
- La tarea debe fallar si el archivo queda vacío y registrar tamaño, checksum SHA-256, fecha UTC, versión de PostgreSQL y destino; nunca registrar `DATABASE_URL`.
- Usar una URL directa para trabajos de backup si Neon la recomienda; la aplicación usa el driver WebSocket transaccional.

Ejemplo manual seguro (la variable debe inyectarse desde el gestor de secretos):

```bash
pg_dump "$DATABASE_URL" --format=custom --no-owner --no-acl --file "jombubox_$(date -u +%Y%m%dT%H%M%SZ).dump"
sha256sum jombubox_*.dump
```

Probar restauración al menos mensualmente en una base nueva y registrar duración, responsable y conteos básicos.

## Cloudflare R2

- PostgreSQL respalda metadata y claves, no los bytes almacenados por R2.
- Habilitar versionado del bucket o mantener una copia privada separada si el RPO requiere recuperar objetos borrados.
- Exportar periódicamente el inventario de claves de R2 y compararlo con `product_images.storage_key`; alertar huérfanos en ambos sentidos.
- Tokens de backup/listado requieren el privilegio mínimo y rotación documentada.

## Checklist de verificación

- [ ] PITR/retención y límites del plan confirmados en Neon.
- [ ] Último dump custom existe, no está vacío y su SHA-256 coincide.
- [ ] Copia cifrada reside fuera de Neon con acceso de mínimo privilegio.
- [ ] Restauración mensual completada en una base aislada y RTO registrado.
- [ ] Conteos y sumas de productos, inventario, movimientos, usuarios e importaciones reconciliados.
- [ ] Objetos R2 y relación con `storage_key` recuperables.
- [ ] Responsable y fecha de la próxima prueba asignados.
