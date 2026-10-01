/**
 * AI Service — abstracción desacoplada del proveedor de IA.
 * El frontend solo envía {tipoSolicitud, contexto[, imagen]} al backend; el backend
 * (google-apps-script/IA.gs) contiene los prompts internos y la API key en Propiedades del Script.
 * Para cambiar de proveedor solo se modifica el backend.
 */
import { llamarBackend } from "./api-client.js";
import { blobABase64 } from "./imagen.js";
import { obtenerFotoLocal } from "./storage-service.js";
import { arbolCatalogo } from "./catalogo.js";

export const TIPOS_SOLICITUD_IA = Object.freeze({
    MEJORAR_MODO_OCURRENCIA: "MEJORAR_MODO_OCURRENCIA",
    IDENTIFICAR_PELIGROS: "IDENTIFICAR_PELIGROS",
    SUGERIR_CONTROLES_STOP: "SUGERIR_CONTROLES_STOP",
    ANALIZAR_FOTOGRAFIA: "ANALIZAR_FOTOGRAFIA",
    ANALIZAR_ACTIVIDAD_COMPLETA: "ANALIZAR_ACTIVIDAD_COMPLETA"
});

export async function solicitarIA({ tipoSolicitud, contexto, imagenes = [] }) {
    if (!TIPOS_SOLICITUD_IA[tipoSolicitud]) throw new Error(`Tipo de solicitud IA no soportado: ${tipoSolicitud}`);
    const r = await llamarBackend("ia", { tipoSolicitud, contexto, imagenes }, { timeoutMs: 180000 });
    return r.resultado;
}

/* ---------- Construcción de contexto (solo datos capturados; nunca se inventan) ---------- */

function textoPlano(v) { return (v ?? "").toString().trim(); }

export function hallazgosConfirmados(registro) {
    return (registro.fotografias || []).flatMap(f =>
        (f.analisisVisualIA?.hallazgos || [])
            .filter(h => h.estado === "confirmado")
            .map(h => ({ observacion: h.observacion, posiblePeligro: h.posiblePeligro, subtipoSugerido: h.subtipoSugerido, danoSugerido: h.danoSugerido })));
}

export function contextoActividad(registro) {
    return {
        subArea: textoPlano(registro.subArea),
        proceso: textoPlano(registro.proceso),
        actividad: textoPlano(registro.actividad),
        tareas: textoPlano(registro.tareas),
        tipoActividad: textoPlano(registro.tipoActividad),
        modoOcurrencia: textoPlano(registro.modoOcurrencia?.texto)
    };
}

export function contextoPeligro(p) {
    if (!p) return null;
    const ev = p.evaluacionInicial || {};
    return {
        tipo: p.tipo, subtipo: p.subtipo, dano: p.dano,
        normaPrincipal: p.normaPrincipal, criterioAplicacion: p.criterioAplicacion,
        normasComplementarias: p.normasComplementarias || "No especificadas",
        severidad: ev.severidad ? `${ev.severidad.codigo} — ${ev.severidad.nombre}` : "",
        frecuencia: ev.frecuencia ? `${ev.frecuencia.codigo} — ${ev.frecuencia.nombre}` : "",
        nri: ev.nri || "", nivelRiesgo: ev.nivelRiesgo || "",
        controlesExistentes: (p.controlesExistentes || []).map(c => `${c.categoria}: ${c.control}`)
    };
}

export function contextoMejorarModo(registro, peligro) {
    return { ...contextoActividad(registro), peligro: peligro?.tipo ? contextoPeligro(peligro) : null, hallazgosVisualesConfirmados: hallazgosConfirmados(registro) };
}

export function contextoControles(registro, peligro) {
    const yaRegistrados = ["S", "T", "O", "P"].flatMap(k => (peligro.controlesSTOP?.[k] || []).map(c => `${k}: ${c.control}`));
    return { ...contextoActividad(registro), peligro: contextoPeligro(peligro), hallazgosVisualesConfirmados: hallazgosConfirmados(registro), controlesAdicionalesYaRegistrados: yaRegistrados };
}

export function contextoFotografia(registro) {
    return {
        ...contextoActividad(registro),
        peligrosIdentificados: (registro.peligros || []).filter(p => p.tipo).map(p => `${p.tipo} — ${p.subtipo || "?"} — ${p.dano || "?"}`),
        catalogo: arbolCatalogo()
    };
}

export function contextoCompleto(registro) {
    return {
        ...contextoActividad(registro),
        peligros: (registro.peligros || []).filter(p => p.tipo).map(contextoPeligro),
        hallazgosVisualesConfirmados: hallazgosConfirmados(registro),
        numeroFotografias: (registro.fotografias || []).length,
        catalogo: arbolCatalogo()
    };
}

/** Prepara imágenes locales (base64 JPEG) para análisis multimodal. */
export async function prepararImagenes(fotos, maximo = 3) {
    const salida = [];
    for (const f of fotos.slice(0, maximo)) {
        const local = await obtenerFotoLocal(f.id);
        if (local?.blob) salida.push({ fotoId: f.id, mimeType: local.blob.type || "image/jpeg", base64: await blobABase64(local.blob) });
    }
    return salida;
}
