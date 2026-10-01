/**
 * Matriz IPER — Backend (Google Apps Script Web App)
 *
 * Enrutador de acciones. Todas las peticiones llegan por POST con cuerpo JSON (text/plain):
 *   { accion, clave, usuario, payload }
 *
 * Propiedades del Script (Configuración del proyecto → Propiedades del script):
 *   APP_ACCESS_KEY     (obligatoria) Código de acceso compartido que los usuarios capturan en la app.
 *   SPREADSHEET_ID     (opcional)    ID del Google Sheets. Si se omite se usa la hoja vinculada al script.
 *   DRIVE_FOLDER_ID    (opcional)    ID de carpeta de evidencias. Si se omite se crea "Evidencias_Matriz_IPER".
 *   ANTHROPIC_API_KEY  (opcional)    API key del proveedor de IA. Sin ella, las funciones de IA quedan deshabilitadas.
 *   AI_MODEL           (opcional)    Modelo de IA. Predeterminado: claude-opus-5-5.
 *
 * Nunca coloque secretos en el código fuente ni en el frontend.
 */

var CONFIG = {
  HOJA_MATRIZ: 'Matriz_IPER',
  HOJA_JSON: 'Registros_JSON',
  CARPETA: 'Evidencias_Matriz_IPER',
  VERSION: '1.0.0'
};

function prop_(nombre) {
  var valor = PropertiesService.getScriptProperties().getProperty(nombre);
  if (valor) return valor;
  return (typeof IDS_PREDETERMINADOS !== 'undefined' && IDS_PREDETERMINADOS[nombre]) || '';
}

function respuesta_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** Comparación en tiempo constante para el código de acceso. */
function claveValida_(recibida) {
  var esperada = prop_('APP_ACCESS_KEY');
  if (!esperada) throw new Error('El backend no tiene configurada la propiedad APP_ACCESS_KEY.');
  recibida = String(recibida || '');
  if (recibida.length !== esperada.length) return false;
  var diff = 0;
  for (var i = 0; i < esperada.length; i++) diff |= esperada.charCodeAt(i) ^ recibida.charCodeAt(i);
  return diff === 0;
}

function doGet() {
  // No expone datos: solo confirma que el servicio está activo.
  return respuesta_({ ok: true, servicio: 'Matriz IPER', version: CONFIG.VERSION });
}

function doPost(e) {
  try {
    var cuerpo = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (!claveValida_(cuerpo.clave)) return respuesta_({ ok: false, error: 'Código de acceso inválido. Verifique la Configuración de la app.' });
    var usuario = String(cuerpo.usuario || '').slice(0, 120);
    var p = cuerpo.payload || {};

    switch (cuerpo.accion) {
      case 'ping':
        return respuesta_({
          ok: true, version: CONFIG.VERSION, hoja: CONFIG.HOJA_MATRIZ,
          carpeta: carpetaEvidencias_().getName(), iaConfigurada: Boolean(prop_('ANTHROPIC_API_KEY')),
          libro: obtenerLibro_().getName()
        });
      case 'guardarRegistro':
        return respuesta_(guardarRegistro_(p, usuario));
      case 'eliminarRegistro':
        return respuesta_(eliminarRegistro_(p.id));
      case 'listarRegistros':
        return respuesta_(listarRegistros_(p.desplazamiento, p.limite));
      case 'obtenerRegistro':
        return respuesta_({ ok: true, registro: obtenerRegistro_(p.id) });
      case 'subirFotografia':
        return respuesta_(subirFotografia_(p));
      case 'ia':
        return respuesta_({ ok: true, resultado: solicitarIA_(p.tipoSolicitud, p.contexto || {}, p.imagenes || []) });
      default:
        return respuesta_({ ok: false, error: 'Acción no soportada.' });
    }
  } catch (err) {
    console.error(err && err.stack ? err.stack : err);
    return respuesta_({ ok: false, error: (err && err.message) || 'Error interno del backend.' });
  }
}

/**
 * Ejecute manualmente una vez desde el editor para autorizar permisos y crear hojas/carpeta.
 * Si no existe APP_ACCESS_KEY, genera uno aleatorio y lo muestra en el registro de ejecución.
 */
function inicializar() {
  hojaMatriz_();
  hojaJson_();
  var hojaDefecto = obtenerLibro_().getSheetByName('Hoja 1') || obtenerLibro_().getSheetByName('Sheet1');
  if (hojaDefecto && obtenerLibro_().getSheets().length > 1 && hojaDefecto.getLastRow() === 0) obtenerLibro_().deleteSheet(hojaDefecto);
  var carpeta = carpetaEvidencias_();
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('APP_ACCESS_KEY')) {
    props.setProperty('APP_ACCESS_KEY', 'IPER-' + Utilities.getUuid().replace(/-/g, '').slice(0, 20));
  }
  console.log('Hojas listas en: ' + obtenerLibro_().getUrl());
  console.log('Carpeta de evidencias: ' + carpeta.getUrl());
  console.log('CÓDIGO DE ACCESO para la app (⚙ Configuración): ' + props.getProperty('APP_ACCESS_KEY'));
  if (!prop_('ANTHROPIC_API_KEY')) console.warn('ANTHROPIC_API_KEY no definida: agréguela en Configuración del proyecto → Propiedades del script para habilitar la IA.');
}
