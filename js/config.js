/**
 * Configuración de la aplicación (por dispositivo).
 * NO contiene secretos: las claves del proveedor de IA y de Google viven en el backend
 * (Propiedades del Script de Google Apps Script). Aquí solo se guarda la URL pública del
 * backend, el código de acceso que el propio usuario introduce y preferencias.
 */
const CLAVE = "matrizIPER_config";

export const CONFIG_DEFECTO = Object.freeze({
    // URL pública del Web App de Google Apps Script (no es secreta; el acceso lo protege claveAcceso).
    backendUrl: "https://script.google.com/macros/s/AKfycbyD5Ho1AV-ych8IR8_ov6Rdmg6a-vUsjdTEjdcyu355EJqrAlZra89xLB9OuF-CJYVt/exec",
    claveAcceso: "",         // Código de acceso compartido definido en el backend (APP_ACCESS_KEY)
    usuario: "",             // Nombre del usuario para "Usuario creador / última modificación"
    maxFotoMB: 10,           // Límite de tamaño del archivo original
    maxDimension: 1920,      // Dimensión máxima tras compresión (1600–2048 px)
    calidadJpeg: 0.8,        // Calidad JPEG (0.75–0.85)
    sincronizarAlGuardar: true
});

export function obtenerConfig() {
    try {
        const guardada = JSON.parse(localStorage.getItem(CLAVE) || "{}");
        return { ...CONFIG_DEFECTO, ...guardada };
    } catch {
        return { ...CONFIG_DEFECTO };
    }
}

export function guardarConfig(parcial) {
    const nueva = { ...obtenerConfig(), ...parcial };
    nueva.maxFotoMB = Math.min(Math.max(Number(nueva.maxFotoMB) || 10, 1), 50);
    nueva.maxDimension = Math.min(Math.max(Number(nueva.maxDimension) || 1920, 1600), 2048);
    nueva.calidadJpeg = Math.min(Math.max(Number(nueva.calidadJpeg) || 0.8, 0.75), 0.85);
    localStorage.setItem(CLAVE, JSON.stringify(nueva));
    return nueva;
}

export function backendConfigurado() {
    return /^https:\/\//.test(obtenerConfig().backendUrl.trim());
}
