/**
 * Cliente HTTP hacia el backend (Google Apps Script Web App).
 * Se envía Content-Type text/plain para evitar el preflight CORS que Apps Script no soporta.
 * El frontend nunca contiene API keys ni secretos: solo la URL pública del Web App
 * y el código de acceso que el usuario captura en Configuración.
 */
import { obtenerConfig } from "./config.js";

export class BackendNoConfiguradoError extends Error {
    constructor() {
        super("El backend no está configurado. Abra ⚙ Configuración e indique la URL del Web App de Google Apps Script.");
        this.codigo = "NO_CONFIGURADO";
    }
}

export class SinConexionError extends Error {
    constructor() { super("Sin conexión a Internet. La información se conserva localmente."); this.codigo = "SIN_CONEXION"; }
}

export class BackendError extends Error {
    constructor(mensaje, datos) { super(mensaje); this.codigo = "BACKEND"; this.datos = datos; }
}

export async function llamarBackend(accion, payload = {}, { timeoutMs = 60000 } = {}) {
    const cfg = obtenerConfig();
    const url = (cfg.backendUrl || "").trim();
    if (!/^https:\/\//.test(url)) throw new BackendNoConfiguradoError();
    if (!navigator.onLine) throw new SinConexionError();

    const ctrl = new AbortController();
    const temporizador = setTimeout(() => ctrl.abort(), timeoutMs);
    let respuesta;
    try {
        respuesta = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify({ accion, clave: cfg.claveAcceso, usuario: cfg.usuario, payload }),
            redirect: "follow",
            cache: "no-store",
            signal: ctrl.signal
        });
    } catch (e) {
        if (e.name === "AbortError") throw new BackendError("El servidor tardó demasiado en responder. Intente nuevamente.");
        if (!navigator.onLine) throw new SinConexionError();
        throw new BackendError("No fue posible contactar al backend. Verifique la URL, el despliegue del Web App y su conexión.");
    } finally {
        clearTimeout(temporizador);
    }

    if (!respuesta.ok) throw new BackendError(`El backend respondió con estado HTTP ${respuesta.status}.`);
    let datos;
    try {
        datos = await respuesta.json();
    } catch {
        throw new BackendError("Respuesta inválida del backend. Verifique que el Web App esté desplegado con acceso correcto.");
    }
    // Un conflicto no es un error de transporte: se devuelve para que la capa de sincronización decida.
    if (!datos.ok && !datos.conflicto) throw new BackendError(datos.error || "Error desconocido en el backend.", datos);
    return datos;
}
