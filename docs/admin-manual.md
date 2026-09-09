# Manual operativo breve

## Acceso

Entra por `/login` con el correo y la contraseña administrativos configurados en el entorno del servidor. El servidor vuelve a validar la sesión firmada en todas las páginas, acciones y APIs administrativas, aunque una operación se invoque fuera de la UI.

## Flujo recomendado

1. Crea primero las ubicaciones físicas en **Ubicaciones**.
2. Crea el producto con marca, tipo y número de parte o al menos un modelo compatible. Revisa el SKU generado; después será inmutable.
3. En **Inventario**, crea cada existencia física con cantidad, condición, estado y ubicación.
4. Usa **Ajustar** para corregir cantidad/estado y escribe un motivo verificable. Usa **Mover** para cambiar ubicación. No edites stock por otra vía.
5. En el producto, agrega imágenes, texto alternativo, orden y principal. Activa estado **Activo** y **Visible en el catálogo público** solo al terminar la revisión.
6. Confirma la ficha pública sin iniciar sesión. El catálogo muestra disponibilidad categórica, nunca cantidad exacta ni ubicación.

Para retirar un producto usa **Archivar producto** en su edición. La operación conserva SKU, inventario, movimientos y auditoría, y fuerza que deje de ser público; no borres registros directamente.

## Importación legacy

Descarga la plantilla desde **Importar**, trabaja sobre una copia y conserva encabezados. Sube el XLSX, revisa errores/advertencias y confirma solo después de inspeccionar el preview. Un preview no escribe inventario. Si la migración masiva terminó, configura `ENABLE_IMPORTS=false`; el historial seguirá visible.

No fuerces duplicados sin comprobar hash, SKU, número de bolsa y modelo. Descarga el CSV de incidencias para corregir filas. Nunca uses la columna legacy `J1B#` como SKU nuevo.

## Exportación

El administrador descarga **Exportar inventario** desde Inventario. El archivo contiene `Inventario`, `Productos`, `Ubicaciones` y `README`; es una fotografía del momento, no una fuente para editar la base. Su contenido es interno: puede incluir costos, adquisición, notas y ubicaciones.

## Incidentes

- Stock incorrecto: no borres filas; registra un ajuste con motivo.
- Ubicación incorrecta: usa movimiento para conservar trazabilidad.
- Imagen defectuosa: retírala desde el producto y comprueba la entrega pública.
- Credencial comprometida: rota `ADMIN_PASSWORD` y `AUTH_SECRET` en la plataforma y vuelve a desplegar; cambiar `AUTH_SECRET` invalida todas las sesiones anteriores.
- Importación problemática: desactiva `ENABLE_IMPORTS`, conserva job/CSV y sigue `disaster-recovery.md`.
- Error de plataforma: registra el `X-Request-Id`, hora UTC y acción, sin copiar cookies, tokens ni `DATABASE_URL`.

Antes de publicar completa `release-checklist.md`; para restauraciones sigue `backups.md` y `disaster-recovery.md`.
