/**
 * Formato profesional de la hoja Matriz_IPER.
 * Se aplica automáticamente una vez (y cada vez que cambie FORMATO_VERSION) al guardar el primer registro
 * o al ejecutar inicializar(). Para reaplicarlo manualmente, ejecute la función aplicarFormato().
 */

var FORMATO_VERSION = 'v1';

// Ancho (px) por columna; las técnicas se ocultan (siguen existiendo para la sincronización).
var ANCHOS_COLUMNAS = {
  'ID': 80, 'Fecha creación': 115, 'Fecha actualización': 115, 'Sub área': 130, 'Proceso': 140, 'Actividad': 190,
  'Tareas': 240, 'Tipo actividad': 105, 'Modo ocurrencia': 420, 'Modo ocurrencia asistido IA': 90,
  'Tipo peligro': 130, 'Subtipo': 170, 'Daño': 170, 'Norma principal': 160, 'Criterio aplicación': 260,
  'Normas complementarias': 200, 'Severidad': 105, 'Código severidad': 75, 'Valor severidad': 70,
  'Frecuencia': 115, 'Código frecuencia': 80, 'Valor frecuencia': 75, 'NRI inicial': 70, 'Nivel riesgo inicial': 95,
  'Controles S': 260, 'Controles T': 260, 'Controles O': 260, 'Controles P': 260, 'Fotografía URL': 200,
  'Fotografía ID': 120, 'Análisis IA fotografía': 280, 'Observaciones': 220, 'Usuario creador': 130,
  'Usuario última modificación': 130, 'ID peligro': 80, 'Versión': 60
};
var COLUMNAS_OCULTAS = ['ID', 'Fotografía ID', 'ID peligro', 'Versión'];
var COLUMNAS_CENTRADAS = ['Tipo actividad', 'Modo ocurrencia asistido IA', 'Código severidad', 'Valor severidad',
  'Código frecuencia', 'Valor frecuencia', 'NRI inicial', 'Nivel riesgo inicial'];

function columna_(nombre) { return COLUMNAS_MATRIZ.indexOf(nombre) + 1; }

function letra_(n) {
  var s = '';
  while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

/** Aplica el formato si aún no se aplicó la versión actual. Barato: solo lee una propiedad. */
function aplicarFormatoSiHaceFalta_() {
  if (PropertiesService.getScriptProperties().getProperty('FORMATO_APLICADO') === FORMATO_VERSION) return;
  try { aplicarFormato(); } catch (e) { console.warn('No se pudo aplicar formato: ' + e.message); }
}

function aplicarFormato() {
  var libro = obtenerLibro_();
  var hoja = hojaMatriz_();
  var nCols = COLUMNAS_MATRIZ.length;
  var nFilas = Math.max(hoja.getMaxRows(), 2);

  // Encabezado
  hoja.getRange(1, 1, 1, nCols).setValues([COLUMNAS_MATRIZ])
    .setFontWeight('bold').setFontColor('#ffffff').setBackground('#0f3d63')
    .setWrap(true).setVerticalAlignment('middle').setHorizontalAlignment('center');
  hoja.setRowHeight(1, 48);
  hoja.setFrozenRows(1);

  // Cuerpo: texto ajustado, alineado arriba, fuente legible
  var cuerpo = hoja.getRange(2, 1, nFilas - 1, nCols);
  cuerpo.setWrap(true).setVerticalAlignment('top').setFontSize(10).setFontFamily('Arial');

  // Anchos, centrado y columnas ocultas
  COLUMNAS_MATRIZ.forEach(function (nombre, i) {
    hoja.setColumnWidth(i + 1, ANCHOS_COLUMNAS[nombre] || 140);
  });
  COLUMNAS_CENTRADAS.forEach(function (nombre) {
    hoja.getRange(2, columna_(nombre), nFilas - 1, 1).setHorizontalAlignment('center');
  });
  COLUMNAS_OCULTAS.forEach(function (nombre) { hoja.hideColumns(columna_(nombre)); });

  // Fechas legibles
  ['Fecha creación', 'Fecha actualización'].forEach(function (nombre) {
    hoja.getRange(2, columna_(nombre), nFilas - 1, 1).setNumberFormat('dd/mm/yyyy hh:mm');
  });

  // Colores por nivel de riesgo (texto + color) en "NRI inicial" y "Nivel riesgo inicial"
  var colNivel = letra_(columna_('Nivel riesgo inicial'));
  var rangosNivel = [
    hoja.getRange(2, columna_('NRI inicial'), nFilas - 1, 1),
    hoja.getRange(2, columna_('Nivel riesgo inicial'), nFilas - 1, 1)
  ];
  var reglas = hoja.getConditionalFormatRules().filter(function (r) {
    // Quitar reglas previas de esta función para no duplicarlas
    return !r.getRanges().some(function (rg) { return rg.getColumn() === columna_('NRI inicial') || rg.getColumn() === columna_('Nivel riesgo inicial'); });
  });
  [['ALTO', '#fde4e2', '#b3261e'], ['MEDIO', '#fff1c2', '#8a5a00'], ['BAJO', '#e3f4e7', '#1e7b34']].forEach(function (n) {
    reglas.push(SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=$' + colNivel + '2="' + n[0] + '"')
      .setBackground(n[1]).setFontColor(n[2]).setBold(true)
      .setRanges(rangosNivel).build());
  });
  hoja.setConditionalFormatRules(reglas);

  // Bandas alternas suaves y filtro en el encabezado
  hoja.getBandings().forEach(function (b) { b.remove(); });
  hoja.getRange(1, 1, nFilas, nCols).applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, true, false)
    .setHeaderRowColor('#0f3d63');
  if (hoja.getFilter()) hoja.getFilter().remove();
  hoja.getRange(1, 1, nFilas, nCols).createFilter();

  // Hoja técnica oculta, hoja vacía por defecto eliminada, Matriz_IPER primero
  var json = hojaJson_();
  json.hideSheet();
  var vacia = libro.getSheetByName('Hoja 1') || libro.getSheetByName('Sheet1');
  if (vacia && vacia.getLastRow() === 0 && libro.getSheets().length > 1) libro.deleteSheet(vacia);
  libro.setActiveSheet(hoja);
  libro.moveActiveSheet(1);

  PropertiesService.getScriptProperties().setProperty('FORMATO_APLICADO', FORMATO_VERSION);
}
