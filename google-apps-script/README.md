# Backend — Google Apps Script

Este backend conecta la PWA con **Google Sheets** (registros), **Google Drive** (fotografías) y el **proveedor de IA**. Las claves y secretos viven solo aquí, en *Propiedades del script*; nunca en el frontend.

| Archivo | Función |
|---|---|
| `Code.gs` | Enrutador `doPost`, verificación del código de acceso, `inicializar()` |
| `Sheets.gs` | Hojas `Matriz_IPER` (vista tabular, 1 fila por peligro) y `Registros_JSON` (registro completo, versión para conflictos) |
| `Drive.gs` | Subida idempotente de fotos a `Evidencias_Matriz_IPER` (acceso restringido) |
| `IA.gs` | Prompts internos y llamada a la API de Claude (Messages API) |
| `appsscript.json` | Manifiesto: zona horaria, permisos y configuración del Web App |

## Despliegue paso a paso

1. **Cree la hoja de cálculo.** En Google Drive cree un Google Sheets nuevo (p. ej. *Matriz IPER*).
2. **Abra Apps Script.** En la hoja: *Extensiones → Apps Script*. Así el script queda vinculado y no necesita `SPREADSHEET_ID`.
3. **Copie los archivos.** Cree en el editor los archivos `Code.gs`, `Sheets.gs`, `Drive.gs` e `IA.gs` y pegue el contenido de esta carpeta.
   Para el manifiesto: *Configuración del proyecto (⚙) → Mostrar el archivo de manifiesto "appsscript.json"* y reemplace su contenido.
   *(Alternativa: `npm i -g @google/clasp`, `clasp login`, `clasp clone <scriptId>` y `clasp push` desde esta carpeta.)*
4. **Defina las Propiedades del script** (*Configuración del proyecto → Propiedades del script*):

   | Propiedad | Obligatoria | Valor |
   |---|---|---|
   | `APP_ACCESS_KEY` | Sí | Código de acceso largo y aleatorio (p. ej. 32+ caracteres). Compártalo solo con usuarios autorizados. |
   | `ANTHROPIC_API_KEY` | Para IA | API key de [console.anthropic.com](https://console.anthropic.com). Sin ella la app funciona, pero los botones ✨ responderán "IA no configurada". |
   | `AI_MODEL` | No | Predeterminado `claude-opus-5-5`. |
   | `SPREADSHEET_ID` | No | Solo si el script **no** está vinculado a la hoja. |
   | `DRIVE_FOLDER_ID` | No | Carpeta existente para evidencias. Si se omite, se crea `Evidencias_Matriz_IPER` y se guarda su ID automáticamente. |

5. **Inicialice.** En el editor seleccione la función `inicializar` y pulse **Ejecutar**. Acepte los permisos (Sheets, Drive, solicitudes externas). Se crean las hojas `Matriz_IPER`, `Registros_JSON` y la carpeta de evidencias.
6. **(Opcional) Pruebe la IA.** Ejecute `probarIA` y revise el registro de ejecución.
7. **Despliegue como aplicación web.** *Implementar → Nueva implementación → Tipo: Aplicación web*:
   - *Ejecutar como:* **Yo** (propietario).
   - *Quién tiene acceso:* **Cualquier usuario** (necesario para que la PWA pueda llamar con `fetch` sin sesión de Google; la protección es `APP_ACCESS_KEY`).
   - Copie la **URL del Web App** (termina en `/exec`).
8. **Configure la PWA.** En la app: **⚙ Configuración** → pegue la URL, el código de acceso y su nombre → **Probar conexión** → **Guardar**.

> Cada vez que modifique el código del script cree una **nueva versión** de la implementación (*Implementar → Gestionar implementaciones → Editar → Nueva versión*) para que la URL `/exec` use el código actualizado.

## Google Drive y privacidad de fotografías

- Las fotos se guardan como archivos privados del propietario del script en `Evidencias_Matriz_IPER`. **No se hacen públicas.**
- Para que otros usuarios abran el enlace "Abrir en Drive", comparta la carpeta solo con las cuentas autorizadas (*Compartir → Lector*).
- Al quitar una foto de un registro o eliminar el registro, el archivo se envía a la **papelera** de Drive (recuperable 30 días).
- Sheets solo guarda `Fotografía ID` y `Fotografía URL`; nunca imágenes en Base64.

## Modelo de seguridad y límites

- `APP_ACCESS_KEY` es un secreto compartido de nivel de aplicación: protege contra accesos casuales, pero **no identifica usuarios individuales**. El campo "Usuario creador/última modificación" lo captura cada usuario en la app. Si requiere autenticación por usuario, migre a un backend con Google Sign-In / OAuth.
- La API key de IA solo existe en Propiedades del script.
- Las celdas se protegen contra inyección de fórmulas (`=`, `+`, `-`, `@`).
- Se usa `LockService` para evitar escrituras concurrentes.
- Cuotas de Apps Script (cuenta gratuita): ~20,000 llamadas `UrlFetch`/día, 6 min por ejecución. Las llamadas de IA usan esfuerzo bajo/medio para responder en segundos; si una respuesta excede los límites de tiempo, reintente.
- Si el proveedor de IA declina una solicitud por política de seguridad, se reintenta automáticamente con el modelo de respaldo recomendado (`fallbacks: "default"`).

## Cambiar de proveedor de IA

Solo reemplace `llamarProveedorIA_(sistema, contenido, esfuerzo)` en `IA.gs` para que devuelva el texto de la respuesta. El contrato con el frontend (`{tipoSolicitud, contexto, imagenes}` → objeto JSON) no cambia.
