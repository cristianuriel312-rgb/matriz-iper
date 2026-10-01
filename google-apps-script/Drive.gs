/**
 * Evidencias fotográficas en Google Drive.
 * Los archivos se crean en la carpeta "Evidencias_Matriz_IPER" con acceso restringido
 * (solo el propietario y las personas con quienes se comparta la carpeta). No se hacen públicos.
 */

var MIME_PERMITIDOS = ['image/jpeg', 'image/png', 'image/webp'];
var MAX_BYTES_FOTO = 15 * 1024 * 1024;

function carpetaEvidencias_() {
  var props = PropertiesService.getScriptProperties();
  var id = prop_('DRIVE_FOLDER_ID');
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (e) { /* se recrea abajo */ }
  }
  var existentes = DriveApp.getFoldersByName(CONFIG.CARPETA);
  var carpeta = existentes.hasNext() ? existentes.next() : DriveApp.createFolder(CONFIG.CARPETA);
  props.setProperty('DRIVE_FOLDER_ID', carpeta.getId());
  return carpeta;
}

function subirFotografia_(p) {
  var registroId = validarId_(p.registroId);
  var fotoId = validarId_(p.fotoId);
  var mime = String(p.mimeType || 'image/jpeg').toLowerCase();
  if (MIME_PERMITIDOS.indexOf(mime) < 0) throw new Error('Formato de imagen no permitido.');
  var bytes = Utilities.base64Decode(String(p.base64 || ''));
  if (!bytes.length) throw new Error('La imagen está vacía.');
  if (bytes.length > MAX_BYTES_FOTO) throw new Error('La imagen supera el tamaño máximo permitido en el servidor.');

  var extension = mime === 'image/png' ? '.png' : mime === 'image/webp' ? '.webp' : '.jpg';
  var nombre = registroId + '_' + fotoId + extension;
  var carpeta = carpetaEvidencias_();

  // Idempotente: si ya existe (reintento), se devuelve el mismo archivo y no se duplica.
  var existentes = carpeta.getFilesByName(nombre);
  if (existentes.hasNext()) {
    var f = existentes.next();
    return { ok: true, fileId: f.getId(), url: f.getUrl() };
  }
  var archivo = carpeta.createFile(Utilities.newBlob(bytes, mime, nombre));
  archivo.setDescription('Matriz IPER — Registro ' + registroId + ' — Original: ' + String(p.nombre || '').slice(0, 200));
  return { ok: true, fileId: archivo.getId(), url: archivo.getUrl() };
}

function enviarAPapelera_(fileId) {
  try { DriveApp.getFileById(fileId).setTrashed(true); }
  catch (e) { console.warn('No se pudo enviar a la papelera el archivo ' + fileId); }
}
