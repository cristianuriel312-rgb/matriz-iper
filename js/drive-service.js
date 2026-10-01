/**
 * Google Drive Service — sube evidencias fotográficas a la carpeta "Evidencias_Matriz_IPER".
 * Los archivos quedan con acceso restringido (no públicos). Sheets solo guarda ID y URL.
 */
import { llamarBackend } from "./api-client.js";
import { blobABase64 } from "./imagen.js";
import { obtenerFotoLocal } from "./storage-service.js";

/** Sube una foto si aún no tiene storageId. Devuelve la foto actualizada. */
export async function subirFotografia(registroId, foto) {
    if (foto.storageId) return foto;
    const local = await obtenerFotoLocal(foto.id);
    if (!local?.blob) throw new Error(`La fotografía "${foto.nombreOriginal}" no está disponible en este dispositivo.`);
    const base64 = await blobABase64(local.blob);
    const r = await llamarBackend("subirFotografia", {
        registroId,
        fotoId: foto.id,
        nombre: foto.nombreOriginal,
        mimeType: local.blob.type || "image/jpeg",
        base64
    }, { timeoutMs: 120000 });
    return { ...foto, storageId: r.fileId, url: r.url, estadoCarga: "subida" };
}
