# Imágenes de producto con Cloudflare R2

## Configuración

1. Crea un bucket R2 para las imágenes de JombuBox.
2. Genera un token R2 con permiso **Object Read & Write**, limitado solo a ese bucket, y guarda su Access Key ID y Secret Access Key.
3. Conecta un dominio público al bucket (recomendado para CDN/producción) o habilita su URL `r2.dev` solo para desarrollo.
4. Configura estas variables solo en el servidor:

```env
CLOUDFLARE_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
R2_PUBLIC_URL=https://images.example.com
```

`R2_PUBLIC_URL` debe ser la base pública del bucket, sin slash final. Debe existir durante `next build` para que `next/image` autorice exactamente ese host y ruta. Ninguna credencial usa `NEXT_PUBLIC_*`.

## Flujo

ADMIN o EDITOR envía cada archivo al route handler autenticado de JombuBox. El servidor valida producto, cupo, extensión, MIME, tamaño y firma binaria; genera `products/<sku-sanitizado>/<uuid>.<ext>`; sube el objeto a R2; y guarda solo esa clave en `product_images.storage_key`. El catálogo construye la URL pública en tiempo de ejecución con `R2_PUBLIC_URL`.

Formatos: JPEG, PNG y WEBP. Límites: 10 MiB por archivo, 11 MiB por petición completa (incluye un margen de 1 MiB para el sobre `multipart/form-data`) y 10 imágenes por producto. Cada archivo viaja en una petición independiente, por lo que seleccionar varias imágenes no suma todos sus bytes en una sola petición.

El endpoint de subida no coincide con el middleware `/admin/:path*`, por lo que `experimental.proxyClientMaxBodySize` de Next.js no controla esta ruta y no se aumenta globalmente. El proxy o CDN que esté delante de la aplicación debe aceptar al menos 11 MiB por petición. Cloudflare admite ese tamaño con sus límites estándar; si el `Maximum Upload Size` de la zona se redujo manualmente, debe mantenerse por encima de 11 MiB.

Los errores de la ruta usan JSON. Si una capa anterior a la aplicación (por ejemplo, el proxy de despliegue) devuelve texto o HTML, el cliente inspecciona `Content-Type` y el estado HTTP antes de mostrar un mensaje; nunca intenta interpretar ciegamente esa respuesta como JSON ni presenta HTML al usuario.

El borrado conserva primero el registro y su clave, marca la operación pendiente, elimina el objeto de R2 y solo después elimina la fila y normaliza el orden. Si R2 falla, la fila queda recuperable para reintentar. Si una subida llega a R2 pero falla el registro en PostgreSQL, JombuBox intenta eliminar el objeto huérfano y registra cualquier fallo de limpieza.

Archivar un producto no borra sus imágenes. La aplicación no incluye borrado permanente de productos.
