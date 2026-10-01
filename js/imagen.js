/**
 * Compresión de imágenes en el navegador antes de almacenarlas o subirlas.
 * Mantiene calidad suficiente para análisis visual con IA.
 */
export const FORMATOS_PERMITIDOS = ["image/jpeg", "image/jpg", "image/png", "image/webp"];

export function formatoPermitido(file) {
    if (FORMATOS_PERMITIDOS.includes(file.type)) return true;
    return /\.(jpe?g|png|webp)$/i.test(file.name || "");
}

async function decodificar(file) {
    if ("createImageBitmap" in globalThis) {
        try { return await createImageBitmap(file, { imageOrientation: "from-image" }); }
        catch { /* Safari antiguo: usar <img> */ }
    }
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("No fue posible leer la imagen.")); };
        img.src = url;
    });
}

/** Devuelve {blob (JPEG), ancho, alto}. */
export async function comprimirImagen(file, { maxDimension = 1920, calidad = 0.8 } = {}) {
    const fuente = await decodificar(file);
    const w0 = fuente.width || fuente.naturalWidth;
    const h0 = fuente.height || fuente.naturalHeight;
    if (!w0 || !h0) throw new Error("La imagen no tiene dimensiones válidas.");
    const escala = Math.min(1, maxDimension / Math.max(w0, h0));
    const ancho = Math.round(w0 * escala);
    const alto = Math.round(h0 * escala);

    const canvas = document.createElement("canvas");
    canvas.width = ancho;
    canvas.height = alto;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff"; // PNG/WEBP con transparencia → fondo blanco en JPEG
    ctx.fillRect(0, 0, ancho, alto);
    ctx.drawImage(fuente, 0, 0, ancho, alto);
    if (typeof fuente.close === "function") fuente.close();

    const blob = await new Promise((resolve, reject) =>
        canvas.toBlob(b => (b ? resolve(b) : reject(new Error("No fue posible comprimir la imagen."))), "image/jpeg", calidad));
    return { blob, ancho, alto };
}

/** Base64 sin prefijo data: */
export function blobABase64(blob) {
    return new Promise((resolve, reject) => {
        const lector = new FileReader();
        lector.onload = () => resolve(String(lector.result).split(",")[1] || "");
        lector.onerror = () => reject(lector.error);
        lector.readAsDataURL(blob);
    });
}
