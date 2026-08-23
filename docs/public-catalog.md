# Catálogo público — Fase 4

## Frontera de privacidad

Un producto público cumple las tres condiciones directamente en SQL:

```text
products.status = ACTIVE
products.is_public = true
products.deleted_at is null
```

La misma cláusula se usa en listado, detalle, opciones, relacionados, sitemap y consultas auxiliares. El detalle privado, draft, archivado, eliminado o inexistente termina en la misma UI de no encontrado y recibe `noindex` mediante `notFound()`.

Los DTOs públicos solo incluyen:

- identidad pública: slug, SKU, título, número de parte;
- marca y tipo con nombre/slug;
- precio de venta y moneda;
- imagen pública y compatibilidades sin notas;
- disponibilidad categórica y condiciones de unidades disponibles;
- descripción e imágenes completas únicamente en el DTO de detalle.

No se seleccionan ni serializan `purchaseCost`, `acquisitionSource`, notas internas, `locationId`, ubicación física, códigos de caja/bolsa legacy, cantidades exactas, usuarios, correos, movimientos, auditoría ni datos de importación. Las pruebas PostgreSQL insertan valores centinela privados y comprueban que no aparecen en el DTO serializado.

## URL, búsqueda y filtros

`/catalogo` usa como fuente de verdad estos parámetros validados con Zod en el servidor:

```text
q, marca, tipo, modelo, condicion, disponibilidad,
precioMin, precioMax, sort, page
```

Los filtros y orden conservan el resto de parámetros y omiten `page` para volver a la primera página. La paginación usa 24 registros. Parámetros inválidos vuelven a defaults seguros; si el precio mínimo supera al máximo, ambos se normalizan.

La búsqueda PostgreSQL cubre SKU, título, número de parte, marca, tipo y modelo compatible, en forma visible y normalizada. El orden de relevancia favorece:

1. SKU exacto;
2. número de parte exacto;
3. modelo normalizado exacto;
4. prefijos de identificadores;
5. marca o tipo exactos;
6. coincidencias parciales/título.

Los comodines introducidos por el visitante se escapan. No hay motor externo: el volumen actual y los índices existentes hacen suficiente esta estrategia.

## Disponibilidad pública

Solo `inventory_items.status = AVAILABLE` suma disponibilidad. `RESERVED`, `DAMAGED`, `SOLD` y `SCRAPPED` no están a la venta. La cantidad exacta nunca cruza el DTO público.

```text
0 unidades      → Agotado
1–2 unidades    → Pocas piezas
3+ unidades     → Disponible
```

El umbral está centralizado en `LOW_STOCK_THRESHOLD = 2`. Las condiciones mostradas/filtradas también provienen únicamente de unidades `AVAILABLE` con cantidad positiva. Los productos agotados permanecen visibles.

## Consultas y rendimiento

- El listado ejecuta una consulta paginada y una consulta de conteo en paralelo.
- Stock y condiciones se agregan por producto en PostgreSQL.
- Imagen primaria, preview y conteo de compatibilidades son subconsultas del query de página, no consultas por tarjeta.
- El detalle selecciona primero el producto público y luego carga imágenes y compatibilidades en dos lotes paralelos.
- Relacionados pondera tipo, marca y modelos compartidos; excluye el producto actual y vuelve a aplicar la frontera pública.

La migración de cierre habilita `pg_trgm` y añade índices GIN sobre SKU, título, parte, modelos compatibles, marca y tipo; conserva además índices B-tree para filtros exactos y stock. Esto acelera coincidencias parciales sin cambiar la semántica ni la frontera pública.

## Caché e invalidación

Las consultas de catálogo no usan Data Cache persistente: cada request obtiene datos actuales desde Neon. React `cache()` deduplica el detalle entre `generateMetadata` y la página dentro de la misma solicitud, sin compartir datos entre visitantes. Esto prioriza que publicación, precio, imagen, condición y stock sean visibles en la siguiente petición.

Tras mutaciones de producto, inventario, imagen o importación, `revalidatePublicCatalog()` invalida `/`, `/catalogo`, el patrón de detalle y `/sitemap.xml`; también limpia el Router Cache del cliente cuando aplica. El admin sigue dinámico y sin caché pública.

## SEO

- `metadataBase` usa `NEXT_PUBLIC_SITE_URL`; localhost solo es fallback de desarrollo.
- Home, catálogo y producto tienen título, descripción, canonical, Open Graph y Twitter card.
- Búsquedas/filtros se marcan `noindex,follow` y canonicalizan a `/catalogo`.
- El producto usa su imagen primaria o `/opengraph-image`, generado por App Router con el logo oficial de JombuBox.
- JSON-LD `Product` usa datos reales; `Offer` solo existe si hay `salePrice` y mapea la disponibilidad pública.
- `sitemap.xml` enumera home, catálogo y productos públicos con `updatedAt`.
- `robots.txt` permite el catálogo y bloquea admin, login y APIs.

En respuestas RSC transmitidas, Next puede mantener HTTP 200 después de iniciar el stream aunque `notFound()` renderice la frontera 404; la señal SEO `noindex` y la pantalla son idénticas para slug privado e inexistente. La consulta de detalle, por su parte, retorna `null` para ambos casos y está cubierta por integración real.

## Pruebas

La suite cubre:

- frontera pública y ausencia de campos privados;
- búsqueda por SKU/parte/modelo/marca/tipo y término inexistente;
- filtros individuales/combinados, precio y disponibilidad con estados mixtos;
- páginas 1/2, parámetros inválidos y preservación de URL;
- detalle público y rechazo uniforme de privado/draft/archivado/eliminado;
- relacionados y opciones respaldadas por productos públicos;
- helpers de disponibilidad, imágenes, canonical URL y JSON-LD;
- E2E de home → BN94 → marca → producto → SKU/disponibilidad y slug privado/inexistente, en escritorio y móvil.

Para OpenNext/Cloudflare configura `NEXT_PUBLIC_SITE_URL` también durante build/preview. El fallback social pesa aproximadamente 1.2 MB y mide 1200×630.
