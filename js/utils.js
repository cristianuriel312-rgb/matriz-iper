/**
 * Utilidades generales. Toda inserción de contenido del usuario se hace con textContent
 * a través de h(); no se usa innerHTML con datos no confiables.
 */

export function uuid() {
    if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
    // Fallback RFC4122 v4 con getRandomValues (o Math.random como último recurso).
    const bytes = new Uint8Array(16);
    if (globalThis.crypto?.getRandomValues) crypto.getRandomValues(bytes);
    else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map(b => b.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Crea un elemento DOM de forma segura.
 * attrs: class, text, on{Evento}, dataset, aria-*, y atributos normales.
 * children: nodos o strings (los strings se insertan como texto).
 */
export function h(tag, attrs = {}, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
        if (v === undefined || v === null || v === false) continue;
        if (k === "class") el.className = v;
        else if (k === "text") el.textContent = v;
        else if (k === "dataset") Object.assign(el.dataset, v);
        else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
        else if (k === "value") el.value = v;
        else if (k === "checked" || k === "disabled" || k === "selected" || k === "hidden" || k === "required" || k === "readOnly") el[k] = Boolean(v);
        else el.setAttribute(k, v === true ? "" : String(v));
    }
    for (const c of children.flat()) {
        if (c === null || c === undefined || c === false) continue;
        el.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return el;
}

export function vaciar(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
    return el;
}

export function $(sel, root = document) { return root.querySelector(sel); }
export function $$(sel, root = document) { return [...root.querySelectorAll(sel)]; }

export function formatBytes(bytes) {
    if (!Number.isFinite(bytes)) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export function debounce(fn, ms = 600) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

export function ahoraISO() { return new Date().toISOString(); }

export function formatoFecha(iso, conHora = true) {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString("es-MX", conHora
        ? { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }
        : { year: "numeric", month: "2-digit", day: "2-digit" });
}

/** Minúsculas y sin acentos, para búsquedas. */
export function normalizar(texto) {
    return String(texto ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export function clonar(obj) {
    return typeof structuredClone === "function" ? structuredClone(obj) : JSON.parse(JSON.stringify(obj));
}

/** Log solo en desarrollo (localhost). Nunca se registran datos sensibles. */
export function logDev(...args) {
    if (["localhost", "127.0.0.1", "[::1]"].includes(location.hostname)) console.debug("[IPER]", ...args);
}
