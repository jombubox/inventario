# Reglas de inventario e identidad

## Entidades

- `Product` representa la identidad comercial compartida: marca, tipo, parte/modelos, seriales de modelo, título y SKU.
- `InventoryItem` representa una existencia o lote físico con su propio `InventoryCode`, cantidad, condición, estado y ubicación.
- `Location` representa el lugar físico actual del inventario; no forma parte de la identidad del producto.
- `Movement` es el historial inmutable de altas, entradas, salidas, ventas, devoluciones, movimientos y ajustes.

## Identificadores

- El SKU identifica al producto comercial y se genera al crear. Es único, legible y no cambia al editar marca, tipo, parte, título o compatibilidades.
- `part_number` conserva su significado y normalización actuales. Los seriales son identificadores adicionales del modelo: un principal opcional y hasta 100 secundarios opcionales; nunca identifican unidades físicas de inventario.
- Los seriales se normalizan con Unicode NFKC, espacios exteriores recortados y comparación sin distinguir mayúsculas/minúsculas. Se conservan guiones, signos, diacríticos y espacios internos: `ABC-123`, `ABC123` y `ABC 123` son distintos.
- No hay unicidad global de seriales. Dentro de un producto no puede repetirse el mismo valor normalizado entre principal y secundarios, y la base de datos limita el principal a uno.
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

## Entrada rápida desde administración

- El CTA **Agregar producto** busca primero por SKU, título, marca, tipo, número de parte, serial principal/secundario y modelo compatible.
- Un modelo existente se reutiliza; crear otro pasa por la misma normalización, generación de SKU y protección concurrente del servicio de productos.
- Los seriales solo se capturan al crear un modelo nuevo. Elegir uno existente continúa directamente a ubicación, caja, bolsa y cantidad.
- La selección física es `ubicación -> caja -> bolsa opcional`. La caja sigue siendo una `Location` de tipo `BOX`; la bolsa libre se conserva en `inventory_items.legacy_bag_number` sin crear otra jerarquía obligatoria.
- Modelo nuevo, caja inline, existencia, movimiento y auditoría se confirman en una sola transacción. Cancelar antes de confirmar no crea registros parciales.
- Una entrada con el mismo modelo, caja, bolsa, condición `UNKNOWN` y estado `AVAILABLE` incrementa la existencia bloqueada y registra `IN`; si no existe, crea un lote y su movimiento `INITIAL`.

## Eliminación de cajas

- Una caja sin inventario, hijos ni referencias históricas puede eliminarse físicamente después de confirmación.
- Una caja con unidades físicas se bloquea con un error de negocio que indica cuántas unidades deben resolverse.
- Una caja sin stock actual pero con inventario cerrado o movimientos se desactiva para conservar el historial.

## Importaciones

- Previsualizar no crea inventario. Confirmar vuelve a leer el archivo, comprueba el hash y reanaliza todas las filas.
- Una fila se aplica en transacción y genera auditoría. Duplicados internos, archivos ya completados y huellas previas requieren decisiones explícitas.
- `ENABLE_IMPORTS=false` es el interruptor operativo. No elimina historial ni bloquea la plantilla.
- La plantilla Excel actual permanece sin cambios y `Número de Parte` conserva su comportamiento. Una ampliación futura debería representar seriales en una hoja relacional separada (`SKU del producto`, `tipo`, `serial`, `orden`) para admitir 0..N secundarios sin concatenarlos ni romper archivos existentes.

## Preparación para QR y etiquetas post-MVP

`InventoryCode` es estable y puede resolver una existencia futura mediante QR. Una etiqueta podría mostrar InventoryCode, SKU, número de parte y ubicación, pero el QR no debe codificar la ubicación como dato permanente porque esta puede cambiar.
