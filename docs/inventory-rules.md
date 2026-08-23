# Reglas de inventario e identidad

## Entidades

- `Product` representa la identidad comercial compartida: marca, tipo, parte/modelos, título y SKU.
- `InventoryItem` representa una existencia o lote físico con su propio `InventoryCode`, cantidad, condición, estado y ubicación.
- `Location` representa el lugar físico actual del inventario; no forma parte de la identidad del producto.
- `Movement` es el historial inmutable de altas, entradas, salidas, ventas, devoluciones, movimientos y ajustes.

## Identificadores

- El SKU identifica al producto comercial y se genera al crear. Es único, legible y no cambia al editar marca, tipo, parte, título o compatibilidades.
- `InventoryCode` identifica una existencia física. PostgreSQL lo genera con una secuencia (`INV-000001…`); es único y nunca se reutiliza.
- La columna legacy llamada `SKU` con valores `J1B#` se conserva exclusivamente como `legacyLocationCode`. No es un SKU de producto.
- `LegacyBagNumber`, `legacyLocationCode` y notas legacy son trazabilidad; no forman la identidad nueva ni se publican.
- Mover una pieza cambia `InventoryItem.locationId`; nunca cambia el SKU.

## Stock y concurrencia

- La cantidad nunca puede ser negativa. `AVAILABLE`, `RESERVED` y `DAMAGED` exigen cantidad positiva; `SOLD` y `SCRAPPED`, cantidad cero.
- Cada IN, OUT, SALE, RETURN, MOVE o ajuste bloquea la fila con `FOR UPDATE`, actualiza inventario e inserta movimiento/auditoría en la misma transacción.
- Las salidas vuelven a verificar `quantity >= salida` en el `UPDATE`; dos solicitudes simultáneas no pueden vender la misma unidad.
- Crear productos serializa la asignación del SKU y slug base con advisory locks; las restricciones únicas son la última defensa.
- Los productos se archivan, no se eliminan físicamente. Las FKs restringen borrar productos o ubicaciones con inventario/movimientos.

## Importaciones

- Previsualizar no crea inventario. Confirmar vuelve a leer el archivo, comprueba el hash y reanaliza todas las filas.
- Una fila se aplica en transacción y genera auditoría. Duplicados internos, archivos ya completados y huellas previas requieren decisiones explícitas.
- `ENABLE_IMPORTS=false` es el interruptor operativo. No elimina historial ni bloquea la plantilla.

## Preparación para QR y etiquetas post-MVP

`InventoryCode` es estable y puede resolver una existencia futura mediante QR. Una etiqueta podría mostrar InventoryCode, SKU, número de parte y ubicación, pero el QR no debe codificar la ubicación como dato permanente porque esta puede cambiar.
