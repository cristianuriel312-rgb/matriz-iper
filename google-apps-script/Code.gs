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
 *   GEMINI_API_KEY     (recomendada) API key GRATUITA de Google AI Studio (aistudio.google.com/apikey).
 *   ANTHROPIC_API_KEY  (opcional)    API key de pago de Anthropic (Claude). Se usa si no hay GEMINI_API_KEY.
 *   AI_PROVIDER        (opcional)    'gemini' o 'anthropic' para forzar un proveedor.
 *   GEMINI_MODEL / AI_MODEL (opcional) Modelo de Gemini / Claude.
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
  if (!esperada) throw new Error('El backend aún no está inicializado: abra el editor de Apps Script, elija la función "inicializar" y pulse ▶ Ejecutar.');
  recibida = String(recibida || '');
  if (recibida.length !== esperada.length) return false;
  var diff = 0;
  for (var i = 0; i < esperada.length; i++) diff |= esperada.charCodeAt(i) ^ recibida.charCodeAt(i);
  return diff === 0;
}

function doGet() {
  // No expone datos ni secretos: solo estado sí/no para diagnóstico.
  return respuesta_({
    ok: true, servicio: 'Matriz IPER', version: CONFIG.VERSION,
    inicializado: Boolean(PropertiesService.getScriptProperties().getProperty('APP_ACCESS_KEY')),
    iaConfigurada: Boolean(proveedorIA_()), proveedorIA: proveedorIA_() || 'ninguno',
    modeloIA: proveedorIA_() === 'gemini' ? modelosGemini_()[0] : (prop_('AI_MODEL') || IA_MODELO_PREDETERMINADO)
  });
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
          carpeta: carpetaEvidencias_().getName(), iaConfigurada: Boolean(proveedorIA_()), proveedorIA: proveedorIA_() || 'ninguno',
          proveedoresIA: proveedoresDisponibles_(),
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
        var resultadoIA = solicitarIA_(p.tipoSolicitud, p.contexto || {}, p.imagenes || [], p.modelo);
        return respuesta_({ ok: true, resultado: resultadoIA, modelo: ultimoModeloUsado_ });
      default:
        return respuesta_({ ok: false, error: 'Acción no soportada.' });
    }
  } catch (err) {
    console.error(err && err.stack ? err.stack : err);
    return respuesta_({ ok: false, error: (err && err.message) || 'Error interno del backend.' });
  }
}

// La función inicializar() está en 0_Configurar.gs.
