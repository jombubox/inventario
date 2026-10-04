# Imágenes de producto con Cloudflare R2

## Configuración

Conserva el bucket y dominio público existentes. El token R2 necesita Object Read & Write limitado a ese bucket. Variables únicamente del servidor:

```env
CLOUDFLARE_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
R2_PUBLIC_URL=https://images.example.com
```

`R2_PUBLIC_URL` y `CLOUDFLARE_ACCOUNT_ID` deben estar disponibles durante el build: autorizan el host de imágenes y el origen S3 exacto en CSP. Ninguna credencial usa `NEXT_PUBLIC_*`. La URL firmada incluye el identificador no secreto de la llave como parte de SigV4; nunca incluye su secret access key.

Antes de desplegar este transporte, agrega las reglas mínimas de CORS y expiración temporal descritas en [la revisión y pasos de despliegue](direct-image-upload-review.md). No reemplaces reglas existentes sin revisarlas. La política nueva permite PUT y Content-Type desde los orígenes de producción definidos, sin comodines. La regla de ciclo de vida expira únicamente `product-image-uploads/` después de un día.

## Flujo

Quick Add crea primero producto e inventario. Tanto Quick Add como edición usan el mismo transporte:

1. POST JSON pequeño a `/api/products/images/upload`: sesión admin, mismo origen, cupo, nombre, MIME, extensión, tamaño, firma declarada y fingerprint.
2. PUT del archivo **directamente a R2**, mediante URL firmada de cinco minutos para una clave temporal generada por el servidor.
3. POST del token a `/api/products/images/confirm`. El servidor verifica HEAD, longitud, MIME, ETag, bytes reales, SHA-256 y firma binaria. Copia condicionalmente dentro de R2 a la clave final y registra la imagen en PostgreSQL.

No se aceptan archivos multipart en las rutas de imágenes. Los cuerpos de autorización/confirmación están limitados a 8 KiB. JPEG, PNG y WebP siguen permitidos, con máximo de **10 MiB por foto** y **10 fotos por producto**. La lectura de verificación es de R2 al servidor y está limitada; los bytes no pasan por el cuerpo de una solicitud del navegador a Vercel.

Las imágenes finales siguen usando `products/<sku-sanitizado>/<uuid>.<ext>`, `product_images.storage_key` y la URL pública de `R2_PUBLIC_URL`. Las URLs firmadas no son URLs de publicación. El navegador no elige claves finales ni obtiene permisos para sobrescribir imágenes guardadas.

## Estados, orden y recuperación

Cada foto muestra selección, subida con porcentaje, guardada o error, con reintento. Una falla permite continuar con otras fotos. El reintento omite fotos confirmadas y restaura la posición elegida dentro del lote. La primera imagen es principal; orden y `isPrimary` se actualizan transaccionalmente y las vistas se revalidan.

Una respuesta perdida después de registrar no duplica imagen ni objeto final. Una falla en el registro revierte la transacción e intenta borrar solo la copia final sin asociación. La confirmación intenta borrar el temporal. Si el navegador abandona la subida, la regla de expiración temporal evita conservar ese objeto indefinidamente.

El borrado mantiene la recuperación existente: marca `deletionPending`, elimina el objeto R2 correcto y luego elimina la fila y normaliza orden/principal. Una falla de R2 conserva la fila para reintentar. Archivar un producto no elimina sus imágenes.

Los errores usan mensajes españoles y el parser seguro de respuestas. No registres ni compartas URLs firmadas: son autorizaciones temporales.
