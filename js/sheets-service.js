/**
 * Google Sheets Service — CRUD remoto a través del backend de Apps Script.
 * La hoja "Matriz_IPER" contiene la vista tabular (una fila por peligro) y la hoja
 * "Registros_JSON" conserva el registro completo para restaurarlo en otros dispositivos.
 */
import { llamarBackend } from "./api-client.js";

/** Registro listo para enviar: sin campos exclusivamente locales. */
function serializable(registro) {
    const { sincronizacion, ...resto } = registro;
    return resto;
}

/**
 * Crea o actualiza (upsert por ID). baseVersion permite detectar conflictos:
 * si la versión remota es más reciente que la que conoce este dispositivo, el backend
 * responde {conflicto:true, remoto}. forzar=true conserva la versión local.
 */
export async function crearRegistroRemoto(registro, { forzar = false } = {}) {
    return llamarBackend("guardarRegistro", { registro: serializable(registro), baseVersion: registro.version || 0, forzar });
}

export async function actualizarRegistroRemoto(registro, { forzar = false } = {}) {
    return llamarBackend("guardarRegistro", { registro: serializable(registro), baseVersion: registro.version || 0, forzar });
}

export async function eliminarRegistroRemoto(id) {
    return llamarBackend("eliminarRegistro", { id });
}

/** Descarga incremental paginada (evita traer miles de registros en una sola respuesta). */
export async function obtenerRegistrosRemotos({ tamanoPagina = 200 } = {}) {
    const resultado = [];
    let desplazamiento = 0;
    for (;;) {
        const r = await llamarBackend("listarRegistros", { desplazamiento, limite: tamanoPagina });
        resultado.push(...(r.registros || []));
        if (!r.hayMas) break;
        desplazamiento += tamanoPagina;
    }
    return resultado;
}

export async function obtenerRegistroRemoto(id) {
    const r = await llamarBackend("obtenerRegistro", { id });
    return r.registro || null;
}

export async function probarConexion() {
    return llamarBackend("ping", {}, { timeoutMs: 20000 });
}
