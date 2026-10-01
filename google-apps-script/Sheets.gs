/**
 * Persistencia en Google Sheets.
 *  - Matriz_IPER: vista tabular legible (una fila por peligro). Se regenera en cada guardado.
 *  - Registros_JSON: registro completo (fuente para restaurar en otros dispositivos y detectar conflictos).
 */

var COLUMNAS_MATRIZ = [
  'ID', 'Fecha creación', 'Fecha actualización', 'Sub área', 'Proceso', 'Actividad', 'Tareas', 'Tipo actividad',
  'Modo ocurrencia', 'Modo ocurrencia asistido IA', 'Tipo peligro', 'Subtipo', 'Daño', 'Norma principal',
  'Criterio aplicación', 'Normas complementarias', 'Severidad', 'Código severidad', 'Valor severidad',
  'Frecuencia', 'Código frecuencia', 'Valor frecuencia', 'NRI inicial', 'Nivel riesgo inicial',
  'Controles S', 'Controles T', 'Controles O', 'Controles P', 'Fotografía URL', 'Fotografía ID',
  'Análisis IA fotografía', 'Observaciones', 'Usuario creador', 'Usuario última modificación',
  'ID peligro', 'Versión'
];

var COLUMNAS_JSON = ['ID', 'Versión', 'Fecha actualización', 'Usuario', 'JSON'];
var TAM_FRAGMENTO = 45000; // límite por celda de Sheets: 50,000 caracteres

function obtenerLibro_() {
  var id = prop_('SPREADSHEET_ID');
  if (id) return SpreadsheetApp.openById(id);
  var activo = SpreadsheetApp.getActiveSpreadsheet();
  if (!activo) throw new Error('Defina la propiedad SPREADSHEET_ID o cree el script desde Extensiones → Apps Script en la hoja.');
  return activo;
}

function hoja_(nombre, encabezados) {
  var libro = obtenerLibro_();
  var hoja = libro.getSheetByName(nombre);
  if (!hoja) hoja = libro.insertSheet(nombre);
  if (hoja.getLastRow() === 0) {
    hoja.getRange(1, 1, 1, encabezados.length).setValues([encabezados]).setFontWeight('bold')
      .setBackground('#0f3d63').setFontColor('#ffffff');
    hoja.setFrozenRows(1);
  }
  return hoja;
}
function hojaMatriz_() { return hoja_(CONFIG.HOJA_MATRIZ, COLUMNAS_MATRIZ); }
function hojaJson_() { return hoja_(CONFIG.HOJA_JSON, COLUMNAS_JSON); }

/** Evita inyección de fórmulas en celdas. */
function celda_(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number' || typeof v === 'boolean') return v;
  if (v instanceof Date) return isNaN(v.getTime()) ? '' : v;
  var s = String(v);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function validarId_(id) {
  if (!/^[A-Za-z0-9-]{8,64}$/.test(String(id || ''))) throw new Error('ID de registro inválido.');
  return String(id);
}

/* ---------- Registros_JSON ---------- */

function buscarJson_(id) {
  var hoja = hojaJson_();
  var n = hoja.getLastRow() - 1;
  if (n < 1) return null;
  var ids = hoja.getRange(2, 1, n, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === id) {
      var fila = i + 2;
      var ancho = hoja.getLastColumn();
      var valores = hoja.getRange(fila, 1, 1, ancho).getValues()[0];
      return { fila: fila, version: Number(valores[1]) || 0, data: JSON.parse(unirFragmentos_(valores) || 'null') };
    }
  }
  return null;
}

function unirFragmentos_(fila) {
  return fila.slice(4).map(function (s) { return String(s || '').replace(/^~/, ''); }).join('');
}

function escribirJson_(registro, filaExistente) {
  var hoja = hojaJson_();
  var json = JSON.stringify(registro);
  var partes = [];
  // Cada fragmento lleva el prefijo "~" para que Sheets nunca lo interprete como fórmula o número.
  for (var i = 0; i < json.length; i += TAM_FRAGMENTO) partes.push('~' + json.substring(i, i + TAM_FRAGMENTO));
  var fila = [registro.id, registro.version, registro.fechaActualizacion || '', registro.usuarioModificacion || ''].concat(partes);
  var destino = filaExistente || hoja.getLastRow() + 1;
  if (filaExistente) {
    var ancho = Math.max(hoja.getLastColumn(), fila.length);
    hoja.getRange(destino, 1, 1, ancho).clearContent();
  }
  hoja.getRange(destino, 1, 1, fila.length).setValues([fila]);
}

/* ---------- Matriz_IPER ---------- */

function textoControles_(p, cat) {
  var ex = (p.controlesExistentes || []).filter(function (c) { return c.categoria === cat; })
    .map(function (c) { return '(Existente) ' + c.control; });
  var ad = ((p.controlesSTOP || {})[cat] || []).map(function (c) {
    return '[' + c.estado + '] ' + c.control + (c.responsable ? ' — Resp.: ' + c.responsable : '') + (c.fechaObjetivo ? ' — Fecha: ' + c.fechaObjetivo : '');
  });
  return ex.concat(ad).join('\n');
}

/** ISO → Date para que Sheets la muestre como fecha local. */
function fecha_(iso) {
  if (!iso) return '';
  var d = new Date(iso);
  return isNaN(d.getTime()) ? String(iso) : d;
}

function filasMatriz_(r) {
  var fotos = r.fotografias || [];
  var urls = fotos.map(function (f) { return f.url || ''; }).filter(String).join('\n');
  var idsFotos = fotos.map(function (f) { return f.storageId || ''; }).filter(String).join('\n');
  var analisis = fotos.map(function (f) {
    var a = f.analisisVisualIA;
    if (!a) return '';
    var conf = (a.hallazgos || []).filter(function (h) { return h.estado === 'confirmado'; })
      .map(function (h) { return '• ' + h.observacion + (h.posiblePeligro ? ' → ' + h.posiblePeligro : ''); });
    return (f.nombreOriginal || '') + ': ' + (a.resumen || '') + (conf.length ? '\nHallazgos confirmados:\n' + conf.join('\n') : '');
  }).filter(String).join('\n\n');
  var modo = r.modoOcurrencia || {};

  return (r.peligros || []).map(function (p) {
    var ev = p.evaluacionInicial || {};
    var s = ev.severidad || {};
    var f = ev.frecuencia || {};
    return [
      r.id, fecha_(r.fechaCreacion), fecha_(r.fechaActualizacion), r.subArea, r.proceso, r.actividad, r.tareas, r.tipoActividad,
      modo.texto, modo.asistidoIA ? 'Sí' : 'No', p.tipo, p.subtipo, p.dano, p.normaPrincipal,
      p.criterioAplicacion, p.normasComplementarias || 'No especificadas', s.nombre, s.codigo, s.valor,
      f.nombre, f.codigo, f.valor, ev.nri, ev.nivelRiesgo,
      textoControles_(p, 'S'), textoControles_(p, 'T'), textoControles_(p, 'O'), textoControles_(p, 'P'),
      urls, idsFotos, analisis, r.observaciones, r.usuarioCreador, r.usuarioModificacion,
      p.id, r.version
    ].map(celda_);
  });
}

function eliminarFilasMatriz_(id) {
  var hoja = hojaMatriz_();
  var n = hoja.getLastRow() - 1;
  if (n < 1) return;
  var ids = hoja.getRange(2, 1, n, 1).getValues();
  for (var i = ids.length - 1; i >= 0; i--) {
    if (String(ids[i][0]) === id) hoja.deleteRow(i + 2);
  }
}

/* ---------- Operaciones ---------- */

function guardarRegistro_(p, usuario) {
  var r = p.registro || {};
  var id = validarId_(r.id);
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    aplicarFormatoSiHaceFalta_();
    var existente = buscarJson_(id);
    var base = Number(p.baseVersion) || 0;
    if (existente && !p.forzar && existente.version > base) {
      return { ok: false, conflicto: true, remoto: existente.data };
    }
    r.version = (existente ? existente.version : 0) + 1;
    if (usuario) r.usuarioModificacion = usuario;
    if (!r.usuarioCreador) r.usuarioCreador = (existente && existente.data && existente.data.usuarioCreador) || usuario;
    delete r.sincronizacion;
    delete r.eliminado;

    // Enviar a la papelera fotos que se quitaron del registro (recuperables desde Drive).
    if (existente && existente.data) {
      var vigentes = {};
      (r.fotografias || []).forEach(function (f) { if (f.storageId) vigentes[f.storageId] = true; });
      (existente.data.fotografias || []).forEach(function (f) {
        if (f.storageId && !vigentes[f.storageId]) enviarAPapelera_(f.storageId);
      });
    }

    escribirJson_(r, existente ? existente.fila : null);
    eliminarFilasMatriz_(id);
    var filas = filasMatriz_(r);
    if (filas.length) {
      var hoja = hojaMatriz_();
      hoja.getRange(hoja.getLastRow() + 1, 1, filas.length, COLUMNAS_MATRIZ.length).setValues(filas);
    }
    return { ok: true, version: r.version };
  } finally {
    lock.releaseLock();
  }
}

function eliminarRegistro_(idCrudo) {
  var id = validarId_(idCrudo);
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var existente = buscarJson_(id);
    if (existente) {
      ((existente.data && existente.data.fotografias) || []).forEach(function (f) { if (f.storageId) enviarAPapelera_(f.storageId); });
      hojaJson_().deleteRow(existente.fila);
    }
    eliminarFilasMatriz_(id);
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

function listarRegistros_(desplazamiento, limite) {
  desplazamiento = Math.max(0, Number(desplazamiento) || 0);
  limite = Math.min(500, Math.max(1, Number(limite) || 200));
  var hoja = hojaJson_();
  var total = hoja.getLastRow() - 1;
  if (total < 1 || desplazamiento >= total) return { ok: true, registros: [], hayMas: false, total: Math.max(total, 0) };
  var cantidad = Math.min(limite, total - desplazamiento);
  var valores = hoja.getRange(2 + desplazamiento, 1, cantidad, hoja.getLastColumn()).getValues();
  var registros = [];
  valores.forEach(function (fila) {
    try {
      var data = JSON.parse(unirFragmentos_(fila));
      data.version = Number(fila[1]) || data.version || 0;
      registros.push(data);
    } catch (e) { console.warn('Registro JSON ilegible en ID ' + fila[0]); }
  });
  return { ok: true, registros: registros, hayMas: desplazamiento + cantidad < total, total: total };
}

function obtenerRegistro_(idCrudo) {
  var existente = buscarJson_(validarId_(idCrudo));
  return existente ? existente.data : null;
}
