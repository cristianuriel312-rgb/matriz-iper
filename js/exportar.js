/**
 * Exportación CSV (UTF-8 con BOM, compatible con Excel) y utilidades de aplanado de la matriz.
 */
import { CATEGORIAS_STOP } from "./catalogo.js";

/** Una fila por peligro; la información general de la actividad se comparte. */
export function filasMatriz(registros) {
    const filas = [];
    for (const r of registros) {
        (r.peligros || []).forEach((p, idx) => filas.push({ registro: r, peligro: p, indicePeligro: idx }));
    }
    return filas;
}

/** Texto de controles de una categoría (incluye existentes marcados). */
export function textoControles(peligro, cat) {
    const existentes = (peligro.controlesExistentes || []).filter(c => c.categoria === cat).map(c => `(Existente) ${c.control}`);
    const adicionales = (peligro.controlesSTOP?.[cat] || []).map(c => `[${c.estado}] ${c.control}${c.responsable ? ` — Resp.: ${c.responsable}` : ""}${c.fechaObjetivo ? ` — Fecha: ${c.fechaObjetivo}` : ""}`);
    return [...existentes, ...adicionales].join(" | ");
}

export function conteoSTOP(peligro) {
    const out = {};
    for (const k of Object.keys(CATEGORIAS_STOP)) {
        out[k] = (peligro.controlesSTOP?.[k] || []).filter(c => c.estado !== "No aplicable").length
            + (peligro.controlesExistentes || []).filter(c => c.categoria === k).length;
    }
    return out;
}

const COLUMNAS_CSV = [
    ["Sub área", f => f.registro.subArea],
    ["Proceso", f => f.registro.proceso],
    ["Actividad", f => f.registro.actividad],
    ["Tareas", f => f.registro.tareas],
    ["Tipo actividad", f => f.registro.tipoActividad],
    ["Modo ocurrencia", f => f.registro.modoOcurrencia?.texto],
    ["Tipo peligro", f => f.peligro.tipo],
    ["Subtipo", f => f.peligro.subtipo],
    ["Daño", f => f.peligro.dano],
    ["Norma", f => f.peligro.normaPrincipal],
    ["Criterio", f => f.peligro.criterioAplicacion],
    ["Normas complementarias", f => f.peligro.normasComplementarias || "No especificadas"],
    ["Severidad", f => f.peligro.evaluacionInicial?.severidad?.nombre],
    ["Código severidad", f => f.peligro.evaluacionInicial?.severidad?.codigo],
    ["Valor S", f => f.peligro.evaluacionInicial?.severidad?.valor],
    ["Frecuencia", f => f.peligro.evaluacionInicial?.frecuencia?.nombre],
    ["Código frecuencia", f => f.peligro.evaluacionInicial?.frecuencia?.codigo],
    ["Valor F", f => f.peligro.evaluacionInicial?.frecuencia?.valor],
    ["NRI", f => f.peligro.evaluacionInicial?.nri],
    ["Nivel", f => f.peligro.evaluacionInicial?.nivelRiesgo],
    ["Controles S", f => textoControles(f.peligro, "S")],
    ["Controles T", f => textoControles(f.peligro, "T")],
    ["Controles O", f => textoControles(f.peligro, "O")],
    ["Controles P", f => textoControles(f.peligro, "P")],
    ["Fotografías", f => (f.registro.fotografias || []).map(x => x.url || x.nombreOriginal).join(" | ")]
];

function celdaCSV(v) {
    let s = v === undefined || v === null ? "" : String(v);
    // Evita inyección de fórmulas al abrir en Excel.
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return `"${s.replace(/"/g, '""')}"`;
}

export function generarCSV(registros) {
    const filas = filasMatriz(registros);
    const lineas = [COLUMNAS_CSV.map(c => celdaCSV(c[0])).join(",")];
    for (const f of filas) lineas.push(COLUMNAS_CSV.map(c => celdaCSV(c[1](f))).join(","));
    return "﻿" + lineas.join("\r\n");
}

export function descargarArchivo(contenido, nombre, tipo = "text/csv;charset=utf-8") {
    const blob = new Blob([contenido], { type: tipo });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nombre;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
}
