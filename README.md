# Matriz IPER — Identificación de Peligros y Evaluación de Riesgos

Aplicación web progresiva (PWA), *mobile-first*, para centros de trabajo en México: identifica actividades y peligros, evalúa el riesgo inicial (NRI), gestiona controles operacionales con metodología **STOP**, usa IA como asistente (texto e imágenes), trabaja sin conexión y sincroniza con **Google Sheets** y **Google Drive**.

> La aplicabilidad normativa deberá validarse conforme a las condiciones específicas del centro de trabajo y la normativa vigente.

## Estructura

```
/
├── index.html              Interfaz (stepper de 6 pasos + vista Matriz)
├── styles.css              Estilos mobile-first, impresión (@media print)
├── app.js                  Capa UI (controlador)
├── manifest.json           Manifiesto PWA
├── service-worker.js       Caché offline del app shell
├── assets/                 Iconos (SVG + PNG 192/512/maskable)
├── js/
│   ├── catalogo.js         DATOS: catálogo de peligros, severidades, frecuencias, niveles, STOP
│   ├── riesgo.js           calcularNRI, clasificarRiesgo, construirEvaluacion, validarMatrizRiesgos
│   ├── data-service.js     Data Service (crear/actualizar/eliminar/listar/obtener; siempre local primero)
│   ├── storage-service.js  Storage Service (localStorage + IndexedDB para fotos)
│   ├── sync-service.js     Sincronización, anti-duplicados y resolución de conflictos
│   ├── sheets-service.js   Google Sheets Service (CRUD remoto)
│   ├── drive-service.js    Google Drive Service (evidencias)
│   ├── ai-service.js       AI Service: solicitarIA({tipoSolicitud, contexto}) + constructores de contexto
│   ├── api-client.js       Cliente HTTP hacia el backend
│   ├── imagen.js           Compresión de imágenes (máx. 1920 px, JPEG 0.8)
│   ├── exportar.js         CSV UTF-8 (Excel) y aplanado de la matriz
│   ├── config.js           Configuración por dispositivo (sin secretos)
│   └── utils.js            h() seguro (textContent), uuid, utilidades
├── google-apps-script/     Backend: Code.gs, Sheets.gs, Drive.gs, IA.gs, appsscript.json, README.md
└── tests/pruebas.html      Pruebas funcionales en el navegador
```

Las capas están separadas (UI → Servicios → Datos) y usan módulos ES nativos sin dependencias ni compilación, por lo que pueden migrarse a React/Vue/Angular o a un backend dedicado reemplazando solo la capa correspondiente.

## Ejecutar localmente

Los módulos ES y el service worker requieren servirse por HTTP (no abrir `index.html` con doble clic):

```bash
python -m http.server 8080
```

Abra `http://localhost:8080`. Pruebas funcionales: `http://localhost:8080/tests/pruebas.html` (28 pruebas: 25 combinaciones de riesgo, casos A1…E5, catálogo/normas, XSS, CSV, UUID).

**Sin backend configurado la app funciona completa en modo local**: captura, edición, cálculo de NRI, clasificación, matriz 5×5, STOP manual, fotos (guardadas en el dispositivo), búsqueda, filtros, CSV, impresión, borrador automático y offline. Solo IA y sincronización requieren el backend.

## Configuración que debe proporcionar

| Dónde | Qué | Notas |
|---|---|---|
| Propiedades del script (Apps Script) | `APP_ACCESS_KEY` | Código de acceso compartido (obligatorio) |
| Propiedades del script | `ANTHROPIC_API_KEY` | Habilita las funciones ✨ de IA |
| Propiedades del script | `AI_MODEL`, `SPREADSHEET_ID`, `DRIVE_FOLDER_ID` | Opcionales |
| App → ⚙ Configuración | URL del Web App (`…/exec`), código de acceso, nombre de usuario | Se guarda solo en el dispositivo |

No hay secretos en el frontend ni en este repositorio.

## Google Sheets y Google Drive

Siga **[google-apps-script/README.md](google-apps-script/README.md)**. En resumen: cree un Google Sheets → *Extensiones → Apps Script* → pegue los `.gs` → defina las propiedades → ejecute `inicializar` → *Implementar como aplicación web* (Ejecutar como: Yo; Acceso: Cualquier usuario) → pegue la URL en ⚙ Configuración.

- **Hoja `Matriz_IPER`**: todas las columnas solicitadas (ID, fechas, actividad, peligro, normas, severidad/frecuencia con códigos y valores, NRI, nivel, Controles S/T/O/P, fotos, análisis IA, usuarios) + `ID peligro` y `Versión`. Una fila por peligro; el `ID` del registro se repite para agrupar.
- **Hoja `Registros_JSON`**: registro completo con número de versión (para restaurar en otros dispositivos y detectar conflictos).
- **Drive `Evidencias_Matriz_IPER`**: fotos con acceso restringido; Sheets guarda solo ID y URL.

## Integración de IA

- Frontend: `js/ai-service.js` → `solicitarIA({tipoSolicitud, contexto, imagenes})` con los tipos `MEJORAR_MODO_OCURRENCIA`, `SUGERIR_CONTROLES_STOP`, `ANALIZAR_FOTOGRAFIA`, `ANALIZAR_ACTIVIDAD_COMPLETA`.
- Backend: `google-apps-script/IA.gs` contiene los prompts internos y la llamada a la API de Claude (`claude-opus-5-5`, con respaldo automático del servidor si una solicitud es declinada por política). Para usar otro proveedor reemplace `llamarProveedorIA_()`.
- La IA **nunca** reemplaza texto, agrega peligros ni selecciona controles automáticamente: todo pasa por aprobación (Aceptar / Editar antes de aceptar / Cancelar; Confirmar / Descartar / Agregar como peligro; casillas sin marcar). Las sugerencias de tipo/subtipo/daño se validan contra el catálogo.

## Desplegar como PWA

1. Publique la carpeta (sin `google-apps-script/` ni `tests/` si lo prefiere) en un hosting estático **HTTPS**: GitHub Pages, Netlify, Firebase Hosting, Cloudflare Pages o un servidor interno.
2. Abra la URL en el teléfono → *Agregar a pantalla de inicio* (Chrome Android / Samsung Internet: menú → Instalar app; Safari iOS: Compartir → Agregar a inicio).
3. Al publicar una nueva versión, incremente `VERSION_CACHE` en `service-worker.js`; los usuarios verán el aviso "Hay una nueva versión disponible".

## Funcionamiento

- **Flujo (stepper):** 1 Actividad → 2 Modo de ocurrencia y fotografías → 3 Identificación del peligro → 4 Evaluación inicial → 5 Controles STOP → 6 Revisión y guardado. Se puede saltar entre pasos; la validación completa ocurre al guardar y enlaza a cada campo faltante.
- **Varios peligros por actividad:** la información general se captura una vez; cada peligro tiene su Tipo/Subtipo/Daño, evaluación y controles.
- **NRI:** `Código severidad + Código frecuencia` (p. ej. `C3`), clasificado con las listas BAJO/MEDIO/ALTO; `validarMatrizRiesgos()` verifica 9+6+10 = 25 al iniciar.
- **Sincronización:** guardar local → Pendiente → envío (upsert por ID, sin duplicados) → Sincronizado / Error de sincronización. Se reintenta al pulsar 🔄 Sincronizar, al reconectar y al abrir la app. Si otro dispositivo guardó una versión más reciente se ofrece *Ver versión remota / Conservar versión local / Usar versión remota*.
- **Eliminación:** registros nunca sincronizados se borran localmente; los sincronizados quedan como pendiente de borrado hasta confirmar en Sheets.
- **Borrador automático** en `localStorage` (`matrizIPER_borrador`), con aviso *Continuar borrador / Descartar* al reabrir.
- **Riesgo residual:** cada peligro tiene `evaluacionResidual: null` y `construirEvaluacion()` es reutilizable; la UI residual se agregará en una fase posterior (la IA nunca la modificará).

## Decisiones de diseño (no especificadas)

- Stepper en todos los tamaños de pantalla (consistencia y menos código); en escritorio la matriz se muestra como tabla y en móvil como tarjetas.
- Fotos en **IndexedDB** (localStorage no admite blobs y tiene ~5 MB).
- Controles sugeridos por IA se agregan como **Propuesto**; el usuario los marca para pasar a **Seleccionado**.
- CSV separado por comas con BOM UTF-8 (Excel en es-MX) y neutralización de fórmulas.
- La paginación de la matriz es de 25 filas ("Cargar más"); la descarga remota es paginada (200 por solicitud).
- El código de acceso protege el Web App; la identidad del usuario es declarativa (ver limitaciones).

## Limitaciones conocidas

- **Autenticación:** `APP_ACCESS_KEY` es compartida; no hay inicio de sesión individual ni permisos por rol. Para eso se requiere un backend con OAuth.
- **Fotos entre dispositivos:** las miniaturas se ven en el dispositivo que las capturó; en otros dispositivos se muestran como enlace a Drive (requiere acceso compartido a la carpeta).
- **IA:** requiere conexión y `ANTHROPIC_API_KEY`; tiene costo por uso. Los tiempos de respuesta dependen del proveedor y de los límites de Apps Script. La calidad debe revisarse siempre por el especialista.
- **Conflictos:** se resuelven a nivel de registro completo (no hay fusión campo por campo).
- **Almacenamiento local:** limitado por el navegador; Safari puede depurar datos de sitios no usados en semanas si la app no está instalada en inicio. Sincronice con regularidad (o use ⚙ → Respaldo JSON).
- **Cámara:** `capture="environment"` abre la cámara en Android/iOS; en escritorio abre el selector de archivos.
- Validado en Chromium (escritorio y emulación 360×800 / 390×844). Se recomienda probar en dispositivos reales iOS Safari y Samsung Internet antes de producción.
