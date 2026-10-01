/**
 * Lógica de evaluación de riesgo: NRI, clasificación y validación de la matriz 5×5.
 * Sin dependencias de la UI; reutilizable para la evaluación residual.
 */
import { severidades, frecuencias, riesgosBajos, riesgosMedios, riesgosAltos } from "./catalogo.js";

export const CODIGOS_SEVERIDAD = ["A", "B", "C", "D", "E"];
export const CODIGOS_FRECUENCIA = ["1", "2", "3", "4", "5"];

/** NRI = Código de severidad + Código de frecuencia (concatenación, no multiplicación). */
export function calcularNRI(severidad, frecuencia) {
    if (!severidad || !frecuencia) return "";
    return `${severidad}${frecuencia}`;
}

/** Devuelve "BAJO" | "MEDIO" | "ALTO" | "" según el NRI. */
export function clasificarRiesgo(nri) {
    if (riesgosAltos.includes(nri)) return "ALTO";
    if (riesgosMedios.includes(nri)) return "MEDIO";
    if (riesgosBajos.includes(nri)) return "BAJO";
    return "";
}

/**
 * Construye un objeto de evaluación completo a partir de los códigos elegidos por el usuario.
 * Se usa para evaluación inicial y, en el futuro, para evaluación residual.
 */
export function construirEvaluacion(codigoSeveridad, codigoFrecuencia) {
    const s = severidades[codigoSeveridad];
    const f = frecuencias[codigoFrecuencia];
    const nri = s && f ? calcularNRI(codigoSeveridad, codigoFrecuencia) : "";
    return {
        severidad: s ? { codigo: codigoSeveridad, nombre: s.nombre, valor: s.valor } : null,
        frecuencia: f ? { codigo: String(codigoFrecuencia), nombre: f.nombre, valor: f.valor } : null,
        nri,
        nivelRiesgo: clasificarRiesgo(nri)
    };
}

/** Verifica 9 BAJO + 6 MEDIO + 10 ALTO = 25, sin duplicados y cubriendo A1–E5. */
export function validarMatrizRiesgos() {
    const errores = [];
    if (riesgosBajos.length !== 9) errores.push(`Se esperaban 9 riesgos BAJO y hay ${riesgosBajos.length}.`);
    if (riesgosMedios.length !== 6) errores.push(`Se esperaban 6 riesgos MEDIO y hay ${riesgosMedios.length}.`);
    if (riesgosAltos.length !== 10) errores.push(`Se esperaban 10 riesgos ALTO y hay ${riesgosAltos.length}.`);
    const todos = [...riesgosBajos, ...riesgosMedios, ...riesgosAltos];
    const unicos = new Set(todos);
    if (unicos.size !== todos.length) errores.push("Existen combinaciones duplicadas entre niveles.");
    for (const s of CODIGOS_SEVERIDAD) {
        for (const f of CODIGOS_FRECUENCIA) {
            if (!unicos.has(s + f)) errores.push(`Falta la combinación ${s}${f}.`);
        }
    }
    if (unicos.size !== 25) errores.push(`Total de combinaciones: ${unicos.size} (se esperaban 25).`);
    return { valida: errores.length === 0, errores, total: unicos.size };
}
