# Movimientos de inventario y auditoría

## Operaciones de stock

Cada cambio de cantidad crea un `inventory_movement` en la misma transacción que actualiza `inventory_items`:

| Tipo | Efecto |
|---|---|
| `INITIAL` | Alta inicial |
| `IN` | Suma existencias y exige estado físico activo |
| `OUT` | Resta; si llega a cero usa `SOLD` o `SCRAPPED` explícito |
| `MOVE` | Cambia ubicación sin cambiar cantidad |
| `ADJUSTMENT` | Fija cantidad/estado tras conteo, conservando delta |
| `SALE` | Resta y normalmente termina en `SOLD` al llegar a cero |
| `RETURN` | Suma y reactiva `AVAILABLE`, `RESERVED` o `DAMAGED` |

`IN`/`RETURN` requieren `INVENTORY_IN`; `OUT`/`SALE`, `INVENTORY_OUT`; `MOVE`, `INVENTORY_MOVE`; `ADJUSTMENT`, `INVENTORY_UPDATE`. ADMIN y EDITOR pueden operar; VIEWER solo consulta.

La fila se bloquea con `SELECT FOR UPDATE`. Las restas usan además `quantity >= amount` en el `UPDATE`, por lo que una carrera no puede dejar cantidad negativa. PostgreSQL refuerza cantidad/estado: `AVAILABLE`, `RESERVED` y `DAMAGED` necesitan cantidad positiva; `SOLD` y `SCRAPPED`, cantidad cero. Si una actualización o movimiento fallan, toda la transacción se revierte.

`/admin/movimientos` filtra por texto, tipo, usuario, ubicación y fechas, con paginación. Muestra origen/destino, actor, producto, cantidad y motivo.

## Productos sin ubicación

El dashboard cuenta productos distintos que tienen al menos un `inventoryItem` físico activo (`AVAILABLE`, `RESERVED` o `DAMAGED`) con `quantity > 0` y `locationId IS NULL`. Un producto sin inventario no se considera “sin ubicación”.

## Auditoría

`/admin/auditoria` requiere `AUDIT_READ`, exclusivo de ADMIN. Los filtros cubren acción, entidad, usuario, fechas y texto. Cada detalle muestra campos cambiados como Antes/Después y metadata legible.

Además de producto, ubicación y usuarios, se auditan preview/inicio/fin/fallo de importación, `IN/OUT/SALE/RETURN`, imágenes y movimientos existentes. Los snapshots son listas explícitas y no incluyen contraseñas, sesiones, tokens Cloudflare, archivos XLSX ni secretos.
