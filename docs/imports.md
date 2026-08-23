# Importación XLSX y migración legacy

## Flujo

`/admin/importar` está disponible en lectura para ADMIN, EDITOR y VIEWER. Solo ADMIN y EDITOR tienen `IMPORT_EXECUTE`: seleccionan un `.xlsx`, eligen defaults, revisan el mapeo detectado y una previsualización paginada, corrigen filas y vuelven a validar. La previsualización crea únicamente un `ImportJob`; nunca crea productos ni inventario.

La confirmación exige una casilla explícita. El servidor vuelve a leer el archivo, verifica que su SHA-256 sea el mismo, reaplica mapping, defaults y correcciones, consulta otra vez la base y procesa cada fila importable en su propia transacción. Un error de una fila se registra sin deshacer las filas correctas. El historial conserva conteos, mensajes por número de fila, snapshots raw/normalizados y vínculos al producto e inventario creados.

## Mapping legacy

| Encabezado Humeberto | Destino JombuBox |
|---|---|
| N° Bolsa | `legacyBagNumber` |
| Marca | `Brand` |
| Modelo | `CompatibleModel` |
| Tarjeta | `ComponentType` |
| SKU / J1B# | `legacyLocationCode` |
| Número de Parte | `PartNumber` |
| Título | `legacyTitle`, solo referencia |
| FECHA DE COMPRA | `AcquiredAt` |
| DSC | `AcquisitionSource` |

`ExistingSKU` solo se reconoce con `ExistingSKU`, `Existing SKU` o `SKU existente`. El encabezado legacy exacto `SKU` se dirige deliberadamente a `legacyLocationCode`. Los códigos `J1B#` nunca participan en `generateSku`; el SKU nuevo se genera en servidor con marca, tipo y parte o modelo.

El último campo legacy desconocido se conserva como `legacyExtra`. Solo se interpreta como costo si es un importe inequívoco; en cualquier otro caso se añade a notas internas con advertencia.

## Normalización y clasificación

Los catálogos resuelven nombre normalizado y aliases activos. El seed incluye `HISSENSE → Hisense`, `T-COM → T-Con`, `T. U. → Tarjeta Única` y `T.U. → Tarjeta Única`. Espacios y acentos se normalizan solo para comparación; se conserva el valor raw en `import_job_rows`.

- Fechas: ISO `YYYY-MM-DD`, fecha Excel y legacy `DD/MM/YYYY` o `DD-MM-YYYY` con convención mexicana.
- Dinero: número, `$`, `MXN` y separadores de miles; texto ambiguo se conserva para revisión.
- Booleanos: `TRUE/FALSE`, `Sí/No` y `1/0`.
- Defaults: condición `UNKNOWN`, estado `AVAILABLE`, moneda `MXN`, visibilidad interna y cantidad 1 cuando falta.

`ERROR` significa que la fila no es importable: catálogo requerido no resuelto, cantidad/estado incompatibles, identidad insuficiente, ExistingSKU inexistente o conflicto fuerte, importe inválido, etc. `WARNING` se puede importar: default, alias, campo opcional ausente, ubicación pendiente, título distinto, costo ambiguo o fila ya vista. Una coincidencia solo por modelo se marca `POSSIBLE_MATCH` y requiere ExistingSKU o confirmar manualmente un producto nuevo. `VALID` no contiene advertencias ni errores.

## Duplicados e idempotencia

Cada fila física recibe una huella SHA-256 de su identidad lógica. Se marcan duplicados posteriores dentro del archivo y huellas que ya produjeron inventario. El archivo completo también recibe SHA-256; un hash con `ImportJob COMPLETED` bloquea la confirmación accidental. Repetir archivo, filas duplicadas o huellas anteriores requiere switches separados y explícitos.

Las identidades de producto se comparan por ExistingSKU, después marca + tipo + parte normalizada y finalmente modelo como coincidencia posible. Las colisiones ambiguas nunca crean productos silenciosamente.

## Plantilla JombuBox

`GET /api/imports/template` genera `JombuBox_Inventario_Template.xlsx` con catálogos actuales y tres hojas:

- `Inventario`: 20 encabezados exactos, autofiltro, fila congelada, formatos y validaciones hasta la fila 2,001.
- `Catalogos`: marcas, tipos, condiciones, estados, moneda, booleanos y ubicaciones activas con breadcrumb.
- `README`: instrucciones, formatos y la advertencia crítica sobre `J1B#`.

Los valores de base que comienzan con `=`, `+`, `-` o `@` se neutralizan antes de escribir el XLSX. El reporte CSV de advertencias/errores aplica la misma defensa.

Campos operativos principales:

- `ExistingSKU`: enlaza de forma explícita un producto JombuBox existente; no acepta J1B#.
- `Brand`, `ComponentType`: deben resolver un catálogo o alias activo.
- `CompatibleModel`: identifica compatibilidad y puede aportar identidad cuando no hay parte.
- `PartNumber`: número de parte técnico, no código de caja.
- `Quantity`: entero positivo compatible con el estado inicial.
- `LocationCode`: código de una ubicación activa; vacío significa ubicación pendiente.

Errores frecuentes: renombrar encabezados, usar el legacy `SKU/J1B#` como `ExistingSKU`, marca/tipo desconocidos, cantidad cero con AVAILABLE, ubicación inexistente y repetir un archivo ya completado. Corrige el preview o el CSV de incidencias antes de confirmar.

## Límites y seguridad

Se aceptan `.xlsx` ZIP no cifrados con MIME permitido: máximo 8 MB comprimidos, 50 MB expandidos, 500 entradas ZIP, ratio 100:1, 5 hojas, 64 columnas y 2,000 filas. Antes de descomprimir se inspecciona el directorio central. La petición multipart también se rechaza temprano por `Content-Length` cuando excede el margen. Las rutas verifican sesión, permiso y mismo origen; nunca registran el archivo completo.
