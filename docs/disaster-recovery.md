# Disaster recovery

Objetivos iniciales del MVP: RPO de 24 horas para el dump lógico externo (menor si el PITR contratado lo permite) y RTO de 4 horas. El responsable de negocio debe aceptar o ajustar ambos antes de producción.

## Restaurar PostgreSQL

1. Declarar incidente, congelar importaciones (`ENABLE_IMPORTS=false`) y conservar logs/horas.
2. Crear una rama/base Neon nueva; no restaurar encima de producción durante el diagnóstico.
3. Si el incidente está dentro de la ventana, usar la restauración temporal/PITR de Neon. Si no, usar el último dump verificado.
4. Para dump custom: `pg_restore --clean --if-exists --no-owner --no-acl --dbname "$RESTORE_DATABASE_URL" archivo.dump`.
5. Ejecutar migraciones solo si el dump precede a la versión desplegada.
6. Validar usuarios activos, productos, inventario, sumas de stock, movimientos, auditoría, importaciones y restricciones; probar login, catálogo y una mutación controlada.
7. Cambiar `DATABASE_URL`, desplegar una versión conocida y realizar smoke test. Reabrir importaciones al final.

## Restaurar imágenes

1. Comparar `product_images.storage_key` con el inventario de objetos del bucket R2 y cualquier respaldo privado.
2. Restaurar o volver a subir objetos faltantes usando credenciales R2 temporales de mínimo privilegio.
3. Conservar la misma `storage_key` cuando sea posible; si cambia, actualizarla en una transacción auditada y comprobar principal/orden/alt.
4. No borrar huérfanos hasta que la base restaurada y la ventana del incidente estén confirmadas.

## Cloudflare Worker

- Un despliegue defectuoso se revierte a una versión previamente desplegada desde Workers & Pages/rollbacks.
- Si la migración ya fue aplicada, preferir una corrección compatible hacia adelante. Las migraciones son inmutables y no se revierte una destructiva sin un runbook específico.

## Secret comprometido

1. Revocar el valor en Neon o Cloudflare y preservar logs/request IDs sin copiar el secreto.
2. Crear una credencial nueva de mínimo privilegio, actualizar el secret del Worker y desplegar.
3. Si fue `BETTER_AUTH_SECRET`, asumir invalidadas todas las sesiones y avisar a operadores; si fue DB, comprobar conexiones anómalas.
4. Verificar login, importación o imágenes según la credencial afectada y retirar definitivamente la credencial anterior.

## Importación incorrecta

1. Configurar `ENABLE_IMPORTS=false` y conservar job, hash, CSV de incidencias, movimientos y auditoría.
2. No borrar en cascada ni ejecutar un “undo” genérico. Identificar exactamente productos/existencias creados por el job.
3. Comparar en una rama restaurada o clon; decidir correcciones auditadas, archivo de productos o restauración completa según impacto.
4. Reconciliar stock y catálogo antes de reactivar importaciones.

## ADMIN bloqueado

1. Confirmar que el problema no sea URL/origen, cookie o secreto rotado.
2. Un operador DB autorizado puede reactivar una cuenta ADMIN conocida dentro de una transacción: `active=true`, `banned=false`, limpiar razón/expiración y eliminar sus sesiones para forzar login nuevo.
3. Registrar manualmente el incidente y la intervención. No cambiar roles masivamente ni editar hashes.
4. Tras recuperar acceso, crear un segundo ADMIN nominal desde la UI, verificarlo y desactivar la cuenta comprometida para revocar sus sesiones.

Después del incidente: cronología, causa raíz, datos afectados, RPO/RTO reales, controles nuevos y evidencia de recuperación.
