/**
 * Storage Service — persistencia local.
 *  - Registros IPER y borrador: localStorage (JSON, sin imágenes).
 *  - Fotografías comprimidas: IndexedDB (los blobs no caben en localStorage).
 */
const CLAVE_REGISTROS = "matrizIPER_registros";
const CLAVE_BORRADOR = "matrizIPER_borrador";

export class AlmacenamientoLlenoError extends Error {
    constructor() { super("El almacenamiento local del navegador está lleno. Sincronice y libere espacio."); }
}

function escribir(clave, valor) {
    try {
        localStorage.setItem(clave, JSON.stringify(valor));
    } catch (e) {
        if (e && (e.name === "QuotaExceededError" || e.code === 22)) throw new AlmacenamientoLlenoError();
        throw e;
    }
}

/* ---------- Registros ---------- */

/** Todos los registros locales, incluidas las lápidas (eliminado:true) pendientes de borrar en remoto. */
export function leerTodosLocales() {
    try {
        const datos = JSON.parse(localStorage.getItem(CLAVE_REGISTROS) || "[]");
        return Array.isArray(datos) ? datos : [];
    } catch {
        return [];
    }
}

export function escribirTodosLocales(registros) {
    escribir(CLAVE_REGISTROS, registros);
}

export function obtenerLocal(id) {
    return leerTodosLocales().find(r => r.id === id) || null;
}

/** Inserta o reemplaza por ID (nunca duplica). */
export function guardarLocal(registro) {
    const todos = leerTodosLocales();
    const i = todos.findIndex(r => r.id === registro.id);
    if (i >= 0) todos[i] = registro; else todos.push(registro);
    escribirTodosLocales(todos);
    return registro;
}

export function eliminarLocal(id) {
    escribirTodosLocales(leerTodosLocales().filter(r => r.id !== id));
}

/* ---------- Borrador ---------- */

export function guardarBorrador(borrador) {
    try { escribir(CLAVE_BORRADOR, { ...borrador, guardadoEn: new Date().toISOString() }); }
    catch { /* el autoguardado nunca debe interrumpir la captura */ }
}

export function leerBorrador() {
    try { return JSON.parse(localStorage.getItem(CLAVE_BORRADOR) || "null"); }
    catch { return null; }
}

export function eliminarBorrador() {
    localStorage.removeItem(CLAVE_BORRADOR);
}

/* ---------- Fotografías (IndexedDB) ---------- */

const DB_NOMBRE = "matrizIPER";
const DB_VERSION = 1;
const STORE_FOTOS = "fotos";
let dbPromesa = null;

function abrirDB() {
    if (dbPromesa) return dbPromesa;
    dbPromesa = new Promise((resolve, reject) => {
        if (!("indexedDB" in globalThis)) { reject(new Error("IndexedDB no disponible en este navegador.")); return; }
        const req = indexedDB.open(DB_NOMBRE, DB_VERSION);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(STORE_FOTOS)) {
                const store = db.createObjectStore(STORE_FOTOS, { keyPath: "id" });
                store.createIndex("registroId", "registroId", { unique: false });
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => { dbPromesa = null; reject(req.error); };
    });
    return dbPromesa;
}

function transaccion(modo, fn) {
    return abrirDB().then(db => new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_FOTOS, modo);
        const store = tx.objectStore(STORE_FOTOS);
        let resultado;
        Promise.resolve(fn(store, r => { resultado = r; })).catch(reject);
        tx.oncomplete = () => resolve(resultado);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error("Transacción cancelada"));
    }));
}

/** foto: {id, registroId, blob, mimeType, nombre} */
export function guardarFotoLocal(foto) {
    return transaccion("readwrite", store => { store.put(foto); });
}

export function obtenerFotoLocal(id) {
    return transaccion("readonly", (store, set) => {
        const req = store.get(id);
        req.onsuccess = () => set(req.result || null);
    });
}

export function eliminarFotoLocal(id) {
    return transaccion("readwrite", store => { store.delete(id); });
}

/** Reasigna fotos al ID de registro definitivo (p. ej. al guardar un borrador). */
export async function asignarFotosARegistro(ids, registroId) {
    for (const id of ids) {
        const foto = await obtenerFotoLocal(id);
        if (foto && foto.registroId !== registroId) await guardarFotoLocal({ ...foto, registroId });
    }
}

export function eliminarFotosDeRegistro(registroId) {
    return transaccion("readwrite", store => {
        const req = store.index("registroId").openCursor(IDBKeyRange.only(registroId));
        req.onsuccess = () => {
            const cursor = req.result;
            if (cursor) { cursor.delete(); cursor.continue(); }
        };
    });
}

/** IDs de fotos almacenadas para un registro (para limpiar huérfanas). */
export function listarIdsFotos(registroId) {
    return transaccion("readonly", (store, set) => {
        const req = store.index("registroId").getAllKeys(IDBKeyRange.only(registroId));
        req.onsuccess = () => set(req.result || []);
    });
}
