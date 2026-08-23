# Modelo de datos de JombuBox

Este documento describe el núcleo de persistencia de la Fase 1. El schema Drizzle es la fuente de verdad y vive en `src/db/schema`; la migración SQL generada está en `drizzle/`.

## Product no es InventoryItem

`Product` describe **qué es** una refacción. Conserva su identidad comercial, clasificación, precio y datos de catálogo. `InventoryItem` describe una existencia física o lote de ese producto, con cantidad, condición, estado y ubicación propios.

```text
Product
  SKU: SAM-MB-BN9407820F
  Nombre: MAINBOARD BN94-07820F | SAMSUNG UN58H5200SXZX

  ├── InventoryItem INV-000001 — Caja 03 > Bolsa 012 — cantidad 1
  └── InventoryItem INV-000002 — Caja 08 > Bolsa 004 — cantidad 1
```

Mover una pieza cambia `InventoryItem.locationId` y crea un movimiento; nunca cambia `Product.sku`.

## Relaciones conceptuales

```text
Brand
  ├── BrandAlias
  └── Product ── ComponentType ── ComponentTypeAlias
        ├── ProductCompatibility ── Brand
        ├── ProductImage
        └── InventoryItem
              ├── Location ── parent Location
              └── InventoryMovement
                    ├── from Location
                    └── to Location

AuditLog                  ImportJob
```

- Una marca y un tipo de componente clasifican muchos productos.
- Un producto admite muchas compatibilidades, imágenes y existencias físicas.
- Una compatibilidad enlaza el producto con una marca y un modelo de televisor normalizado.
- Una ubicación puede tener cero o un padre y cualquier cantidad de hijos.
- Un inventario físico conserva su historial mediante muchos movimientos.
- `AuditLog` e `ImportJob` quedan desacoplados de usuarios hasta que exista autenticación.

## Tablas

### Catálogos y aliases

- `brands`: nombre visible, nombre normalizado, código de SKU y slug. Los tres identificadores normalizados son únicos.
- `brand_aliases`: variantes legacy que apuntan a una marca canónica. `normalized_alias` es único y permite ampliar aliases desde admin en el futuro.
- `component_types`: catálogo de clases de pieza y sus códigos estables de SKU.
- `component_type_aliases`: variantes legacy de tipo de componente con la misma arquitectura que las marcas.

Los generadores no contienen un `switch` de marcas o tipos. Reciben los códigos almacenados en los catálogos. Las funciones puras de alias trabajan con definiciones cargables desde estas tablas.

### Productos

- `products`: identidad comercial, SKU, slug estable, marca, tipo, número de parte original y normalizado, título, descripción, precio de venta, moneda, estado de catálogo, publicación y soft delete.
- `product_compatibilities`: pares marca/modelo compatibles. El mismo producto no puede repetir `brandId + normalizedModel`.
- `product_images`: `storage_key` es la referencia canónica para objetos R2; las columnas heredadas se conservan para compatibilidad del schema. Admite orden y como máximo una imagen primaria por producto.

El número de parte original no se destruye: `BN94-07820F` se almacena en `part_number`; `BN9407820F` se usa en `normalized_part_number` para comparación.

### Ubicaciones e inventario

- `locations`: árbol de profundidad variable con `parent_id`, código administrativo único, tipo y estado activo.
- `inventory_items`: existencia o lote, con código visible, producto, ubicación nullable, cantidad, condición, estado, adquisición, costo y trazabilidad legacy.
- `inventory_movements`: historial inmutable de entradas, salidas, movimientos, ajustes, ventas y devoluciones.

El helper de breadcrumb recorre padres hasta la raíz y produce, por ejemplo:

```text
Almacén principal > Estante J1 > Caja 03 > Bolsa 012
```

No asume una profundidad fija, rechaza padres inexistentes, detecta ciclos y aplica un límite defensivo de 64 niveles. Antes de cambiar un padre, `assertValidLocationParent` impide colocar una ubicación debajo de uno de sus descendientes. PostgreSQL también impide que un nodo sea su propio padre; los ciclos indirectos se validan en la capa de dominio porque un `CHECK` de una sola fila no puede recorrer el árbol.

### Operación futura

- `audit_logs`: evento, entidad, snapshots JSONB y metadata. `user_id` queda nullable y sin FK hasta la fase de autenticación.
- `import_jobs`: estado y conteos de un proceso de importación, errores/metadata JSONB y autor nullable. No almacena el XLSX.

## SKU de producto

El formato base es `{BRAND_CODE}-{COMPONENT_CODE}-{IDENTIFIER}`. El identificador se obtiene por esta prioridad:

1. número de parte normalizado;
2. primer modelo compatible elegido explícitamente por la capa de creación;
3. fallback controlado proporcionado por esa capa.

Si no existe información suficiente, `generateSku` lanza `InvalidSkuInputError`. No usa aleatoriedad ni timestamps. `resolveStableSku` conserva el SKU persistido: editar marca, tipo, part number o modelo no lo regenera silenciosamente.

La restricción única de PostgreSQL es la protección definitiva. Frente a una colisión, `assessSkuCollision` diferencia entre reutilizar el mismo producto y solicitar revisión para otro producto. En el segundo caso solamente propone `-02`, `-03`, etc.; no crea ni fusiona automáticamente.

## Slug

El slug semántico se calcula una sola vez al crear el producto y tiene constraint único. `resolveStableProductSlug` conserva el valor existente aunque cambie el título. Una colisión puede recibir un sufijo determinista (`-2`, `-3`) después de consultar la base. El título es editable y no es identidad.

## InventoryCode

`inventory_items.inventory_code` usa la secuencia PostgreSQL `inventory_code_seq` y un default de base de datos:

```sql
'INV-' || lpad(nextval('inventory_code_seq')::text, 6, '0')
```

`nextval` resuelve asignaciones concurrentes de forma atómica; no se usa `MAX + 1`. El UUID sigue siendo la llave interna. La secuencia puede dejar huecos tras rollbacks, lo cual es correcto: garantiza unicidad y concurrencia, no numeración contable sin huecos. El constraint acepta seis o más dígitos para no truncar al superar `999999`.

## Cantidad y estado

La misma regla existe en Zod, dominio y PostgreSQL:

- `AVAILABLE`, `RESERVED` y `DAMAGED`: `quantity > 0`;
- `SOLD` y `SCRAPPED`: `quantity = 0`;
- ninguna cantidad puede ser negativa.

Un movimiento siempre lleva cantidad positiva y motivo no vacío. `MOVE` exige origen y destino diferentes. La operación futura de mover inventario deberá ejecutar en una transacción: bloquear/validar el item, actualizar `location_id`, insertar `inventory_movement` e insertar `audit_log`.

## Dinero

`sale_price` y `purchase_cost` usan `numeric(12,2)`, nunca tipos flotantes. Drizzle está configurado con `mode: "string"`, por lo que los valores cruzan la frontera de JavaScript como strings decimales (por ejemplo, `"1299.90"`) y no pierden precisión binaria. Ambos importes tienen checks de no negatividad; `currency` es un código de tres letras y usa `MXN` por defecto.

## Datos legacy y futuro Excel

`legacy_bag_number` conserva `N° Bolsa`. `legacy_location_code` conserva literalmente valores como `J1B1`, `J1B2`, etc. **Los códigos `J1B#` no son y no se usan como el nuevo SKU de producto.** Tampoco se reinterpretan silenciosamente como ubicaciones normalizadas.

El modelo puede representar el formato futuro así:

| Columna futura | Destino |
| --- | --- |
| `LegacyBagNumber` | `inventory_items.legacy_bag_number` |
| `ExistingSKU` | búsqueda/reconciliación con `products.sku` |
| `Brand` | `brands` / `brand_aliases` |
| `CompatibleModel` | `product_compatibilities` |
| `ComponentType` | `component_types` / aliases |
| `PartNumber` | `products.part_number` y su forma normalizada |
| `Condition`, `Quantity`, `InventoryStatus` | `inventory_items` |
| `SalePrice`, `Currency` | `products` |
| `AcquiredAt`, `AcquisitionSource`, `PurchaseCost` | `inventory_items` |
| `BoxCode`, `LocationCode` | resolución hacia `locations`; el valor dudoso puede conservarse como legacy |
| `IsPublic`, `TitleOverride`, `Description` | `products` |
| `InternalNotes` | `inventory_items.notes` o metadata del job según alcance de la fila |

El importador futuro debe clasificar ambigüedades como warning/error; esta fase no fusiona ni corrige filas dudosas.

## Duplicados

Los índices ayudan a presentar candidatos, pero no imponen una fusión destructiva:

- señal fuerte: `brandId + componentTypeId + normalizedPartNumber`;
- sin número de parte: mismo tipo y compatibilidad `brandId + normalizedModel`, mediante join;
- una coincidencia genera revisión en el futuro importador, no una unión automática.

## Borrado y conservación histórica

- Los productos se archivan con `deleted_at`; no se borran físicamente por defecto.
- Marcas y tipos referidos por productos usan `RESTRICT`.
- Ubicaciones referidas por inventario, movimientos o hijos usan `RESTRICT`; nunca se pierde inventario al borrar una ubicación.
- InventoryItems referidos por movimientos usan `RESTRICT` para conservar historia.
- Compatibilidades e imágenes son hijos propios del producto y usan `CASCADE` únicamente ante un borrado físico excepcional.
- Aliases son hijos propios de sus catálogos y usan `CASCADE`.

## Índices y constraints destacados

- únicos: SKU, slug, inventory code, códigos/slugs/nombres normalizados de catálogos, código de ubicación y alias normalizados;
- índice parcial de candidatos duplicados para productos no eliminados;
- índice parcial de catálogo público por estado/publicación;
- índice único parcial para una sola imagen primaria por producto;
- búsquedas por marca, tipo, part number normalizado, compatibilidad, producto/localización/estado de inventario y fecha de movimiento;
- enums PostgreSQL para estados, condición, tipo de movimiento, tipo de ubicación e importación;
- checks de formato, textos no vacíos, precios, cantidades, conteos, imágenes y movimientos;
- UUIDs y timestamps con zona horaria; `updatedAt` se actualiza mediante Drizzle en escrituras de aplicación.

## Seeds y acceso a datos

El seed usa los mismos validadores/normalizadores que el dominio. Las inserciones de catálogos usan `ON CONFLICT DO NOTHING` para no cambiar códigos que ya puedan formar parte de SKUs reales; los aliases usan upsert por alias normalizado. Todo se ejecuta dentro de una transacción mediante el driver PostgreSQL de Node. El runtime usa fetch para consultas simples y WebSocket de un solo uso para las transacciones interactivas requeridas por inventario, movimientos, importación y auditoría.

Las consultas iniciales viven en `features/*/data`, no en componentes. Las fábricas aceptan tanto la conexión normal como un executor transaccional, de modo que los servicios futuros puedan componer actualización, movimiento y auditoría atómicamente.
