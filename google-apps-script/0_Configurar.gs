/**
 * ▶ CONFIGURACIÓN INICIAL — ejecute esta función UNA VEZ desde el editor (botón ▶ Ejecutar).
 *  1. Autoriza los permisos de Sheets, Drive y solicitudes externas.
 *  2. Genera el código de acceso (APP_ACCESS_KEY) si no existe.
 *  3. Crea las hojas Matriz_IPER y Registros_JSON y verifica la carpeta de evidencias.
 * Al terminar, el código de acceso aparece en el "Registro de ejecución".
 */
function inicializar() {
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('APP_ACCESS_KEY')) {
    props.setProperty('APP_ACCESS_KEY', 'IPER-' + Utilities.getUuid().replace(/-/g, '').slice(0, 20));
  }
  console.log('✔ CÓDIGO DE ACCESO para la app (⚙ Configuración): ' + props.getProperty('APP_ACCESS_KEY'));

  var libro = obtenerLibro_();
  hojaMatriz_();
  hojaJson_();
  var hojaDefecto = libro.getSheetByName('Hoja 1') || libro.getSheetByName('Sheet1');
  if (hojaDefecto && libro.getSheets().length > 1 && hojaDefecto.getLastRow() === 0) libro.deleteSheet(hojaDefecto);
  console.log('✔ Hojas listas en: ' + libro.getUrl());
  console.log('✔ Carpeta de evidencias: ' + carpetaEvidencias_().getUrl());
  console.log(prop_('ANTHROPIC_API_KEY')
    ? '✔ IA configurada.'
    : '⚠ IA sin configurar: agregue ANTHROPIC_API_KEY en Configuración del proyecto → Propiedades del script.');
}

/** Muestra de nuevo el código de acceso si lo perdió. */
function mostrarCodigoDeAcceso() {
  console.log('CÓDIGO DE ACCESO: ' + (PropertiesService.getScriptProperties().getProperty('APP_ACCESS_KEY') || '(no generado: ejecute inicializar)'));
}
