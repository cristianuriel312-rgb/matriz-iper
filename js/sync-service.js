/**
 * Sincronización local ⇄ Google Sheets / Drive.
 * Flujo: guardar local → intentar sincronizar → si falla queda Pendiente/Error → reintentar.
 * Evita duplicados usando el mismo ID en todos los destinos (upsert por ID en el backend).
 */
import { ahoraISO } from "./utils.js";
import { leerTodosLocales, obtenerLocal, guardarLocal, eliminarLocal, eliminarFotosDeRegistro } from "./storage-service.js";
import { crearRegistroRemoto, eliminarRegistroRemoto, obtenerRegistrosRemotos } from "./sheets-service.js";
import { subirFotografia } from "./drive-service.js";
import { ESTADOS_SYNC } from "./data-service.js";
import { SinConexionError, BackendNoConfiguradoError } from "./api-client.js";

let enCurso = false;
export function sincronizacionEnCurso() { return enCurso; }

function esErrorDeTransporte(e) {
    return e instanceof SinConexionError || e instanceof BackendNoConfiguradoError;
}

function marcarError(id, mensaje) {
    const actual = obtenerLocal(id);
    if (!actual) return;
    actual.sincronizacion = { ...(actual.sincronizacion || {}), estado: ESTADOS_SYNC.ERROR, mensajeError: mensaje };
    guardarLocal(actual);
}

/**
 * Sincroniza un registro. Devuelve {resultado:"ok"|"eliminado"|"conflicto", remoto?}.
 * Lanza errores de transporte para que el llamador detenga el lote.
 */
export async function sincronizarRegistro(registro, { forzar = false } = {}) {
    if (registro.eliminado) {
        await eliminarRegistroRemoto(registro.id);
        eliminarLocal(registro.id);
        await eliminarFotosDeRegistro(registro.id).catch(() => {});
        return { resultado: "eliminado" };
    }

    // 1) Subir fotografías pendientes a Drive.
    const fotos = [];
    const erroresFoto = [];
    for (const f of registro.fotografias || []) {
        try {
            fotos.push(await subirFotografia(registro.id, f));
        } catch (e) {
            if (esErrorDeTransporte(e)) throw e;
            erroresFoto.push(e.message);
            fotos.push({ ...f, estadoCarga: "error" });
        }
    }
    const aEnviar = { ...registro, fotografias: fotos };
    // Guardar inmediatamente IDs de Drive para no volver a subir en el próximo intento.
    persistirFotos(registro.id, fotos);
    if (erroresFoto.length) throw new Error(`Fotografías no subidas: ${erroresFoto.join("; ")}`);

    // 2) Upsert en Sheets.
    const r = await crearRegistroRemoto(aEnviar, { forzar });
    if (r.conflicto) return { resultado: "conflicto", remoto: r.remoto };

    // 3) Confirmar localmente. Si el usuario editó durante la sincronización, queda Pendiente.
    const actual = obtenerLocal(registro.id) || aEnviar;
    const sinCambios = actual.fechaActualizacion === registro.fechaActualizacion;
    actual.version = r.version;
    actual.sincronizacion = {
        estado: sinCambios ? ESTADOS_SYNC.SINCRONIZADO : ESTADOS_SYNC.PENDIENTE,
        ultimaSincronizacion: ahoraISO(),
        mensajeError: ""
    };
    guardarLocal(actual);
    return { resultado: "ok" };
}

function persistirFotos(id, fotos) {
    const actual = obtenerLocal(id);
    if (!actual) return;
    const porId = new Map(fotos.map(f => [f.id, f]));
    actual.fotografias = (actual.fotografias || []).map(f => {
        const s = porId.get(f.id);
        return s?.storageId ? { ...f, storageId: s.storageId, url: s.url, estadoCarga: "subida" } : (s ? { ...f, estadoCarga: s.estadoCarga } : f);
    });
    guardarLocal(actual);
}

/**
 * Sincroniza todos los pendientes y luego descarga cambios remotos.
 * Devuelve {enviados, eliminados, errores:[{id,mensaje}], conflictos:[{local,remoto}], descargados, borradosRemotos}.
 */
export async function sincronizarTodo({ descargar = true } = {}) {
    if (enCurso) return { omitido: true };
    enCurso = true;
    const resumen = { enviados: 0, eliminados: 0, errores: [], conflictos: [], descargados: 0, borradosRemotos: 0 };
    try {
        const pendientes = leerTodosLocales().filter(r => r.sincronizacion?.estado !== ESTADOS_SYNC.SINCRONIZADO);
        for (const reg of pendientes) {
            try {
                const res = await sincronizarRegistro(reg);
                if (res.resultado === "ok") resumen.enviados++;
                else if (res.resultado === "eliminado") resumen.eliminados++;
                else if (res.resultado === "conflicto") resumen.conflictos.push({ local: reg, remoto: res.remoto });
            } catch (e) {
                if (esErrorDeTransporte(e)) throw e;
                marcarError(reg.id, e.message);
                resumen.errores.push({ id: reg.id, actividad: reg.actividad, mensaje: e.message });
            }
        }

        if (descargar) {
            const remotos = await obtenerRegistrosRemotos();
            const idsRemotos = new Set(remotos.map(r => r.id));
            const idsEnConflicto = new Set(resumen.conflictos.map(c => c.local.id));
            for (const remoto of remotos) {
                const local = obtenerLocal(remoto.id);
                if (!local) {
                    guardarLocal(conEstadoSincronizado(remoto));
                    resumen.descargados++;
                } else if (local.eliminado || idsEnConflicto.has(local.id)) {
                    continue;
                } else if ((remoto.version || 0) > (local.version || 0)) {
                    if (local.sincronizacion?.estado === ESTADOS_SYNC.SINCRONIZADO) {
                        guardarLocal(conEstadoSincronizado(remoto));
                        resumen.descargados++;
                    } else {
                        resumen.conflictos.push({ local, remoto });
                    }
                }
            }
            // Registros sincronizados previamente que ya no existen en Sheets: fueron eliminados por otro usuario.
            for (const local of leerTodosLocales()) {
                if (local.version > 0 && !idsRemotos.has(local.id) && local.sincronizacion?.estado === ESTADOS_SYNC.SINCRONIZADO) {
                    eliminarLocal(local.id);
                    await eliminarFotosDeRegistro(local.id).catch(() => {});
                    resumen.borradosRemotos++;
                }
            }
        }
        return resumen;
    } finally {
        enCurso = false;
    }
}

function conEstadoSincronizado(remoto) {
    return { ...remoto, eliminado: false, sincronizacion: { estado: ESTADOS_SYNC.SINCRONIZADO, ultimaSincronizacion: ahoraISO(), mensajeError: "" } };
}

/* ---------- Resolución de conflictos ---------- */

/** Conserva la versión local: toma como base la versión remota y fuerza el envío. */
export async function conservarVersionLocal(local, remoto) {
    const base = { ...(obtenerLocal(local.id) || local), version: remoto.version || 0 };
    guardarLocal(base);
    return sincronizarRegistro(base, { forzar: true });
}

/** Reemplaza la versión local por la remota. */
export function usarVersionRemota(remoto) {
    guardarLocal(conEstadoSincronizado(remoto));
}
