/**
 * Data Service — punto único de acceso a registros IPER para la UI.
 * Siempre escribe primero en local (no se pierden datos sin conexión) y marca Pendiente;
 * la sincronización con Google Sheets la realiza sync-service.
 */
import { ahoraISO, clonar } from "./utils.js";
import { obtenerConfig } from "./config.js";
import {
    leerTodosLocales, obtenerLocal, guardarLocal, eliminarLocal,
    eliminarFotosDeRegistro, eliminarFotoLocal, listarIdsFotos
} from "./storage-service.js";

export const ESTADOS_SYNC = Object.freeze({
    SINCRONIZADO: "Sincronizado",
    PENDIENTE: "Pendiente",
    ERROR: "Error de sincronización"
});

function marcarPendiente(registro) {
    registro.sincronizacion = { ...(registro.sincronizacion || {}), estado: ESTADOS_SYNC.PENDIENTE, mensajeError: "" };
    return registro;
}

/** Borra blobs locales de fotos que ya no forman parte del registro. */
export async function limpiarFotosHuerfanas(registroId, fotografias) {
    try {
        const vigentes = new Set((fotografias || []).map(f => f.id));
        const ids = await listarIdsFotos(registroId);
        for (const id of ids) if (!vigentes.has(id)) await eliminarFotoLocal(id);
    } catch { /* IndexedDB no disponible: nada que limpiar */ }
}

export const dataService = {
    async crear(registro) {
        const r = clonar(registro);
        const ahora = ahoraISO();
        const { usuario } = obtenerConfig();
        r.fechaCreacion = r.fechaCreacion || ahora;
        r.fechaActualizacion = ahora;
        r.usuarioCreador = r.usuarioCreador || usuario || "";
        r.usuarioModificacion = usuario || "";
        r.version = r.version || 0;
        r.eliminado = false;
        marcarPendiente(r);
        guardarLocal(r);
        await limpiarFotosHuerfanas(r.id, r.fotografias);
        return r;
    },

    async actualizar(registro) {
        const existente = obtenerLocal(registro.id);
        if (!existente) return this.crear(registro);
        const r = clonar(registro);
        r.fechaCreacion = existente.fechaCreacion;
        r.usuarioCreador = existente.usuarioCreador;
        r.version = existente.version || 0;
        r.fechaActualizacion = ahoraISO();
        r.usuarioModificacion = obtenerConfig().usuario || "";
        r.eliminado = false;
        marcarPendiente(r);
        guardarLocal(r);
        await limpiarFotosHuerfanas(r.id, r.fotografias);
        return r;
    },

    /**
     * Si el registro nunca se sincronizó se borra localmente de inmediato.
     * Si ya existe en Sheets se deja una lápida Pendiente hasta confirmar el borrado remoto.
     */
    async eliminar(id) {
        const existente = obtenerLocal(id);
        if (!existente) return;
        if (!existente.version) {
            eliminarLocal(id);
            await eliminarFotosDeRegistro(id).catch(() => {});
            return { remotoPendiente: false };
        }
        guardarLocal(marcarPendiente({ ...existente, eliminado: true, fechaActualizacion: ahoraISO() }));
        return { remotoPendiente: true };
    },

    async listar() {
        return leerTodosLocales().filter(r => !r.eliminado);
    },

    async obtener(id) {
        const r = obtenerLocal(id);
        return r && !r.eliminado ? r : null;
    },

    pendientes() {
        return leerTodosLocales().filter(r => r.sincronizacion?.estado !== ESTADOS_SYNC.SINCRONIZADO);
    }
};
