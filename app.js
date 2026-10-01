/**
 * Matriz IPER — capa de UI (controlador principal).
 * Capas:
 *   UI (este archivo) → Servicios (js/*-service.js) → Datos (js/catalogo.js, localStorage, IndexedDB, Sheets/Drive)
 * Toda la información capturada por el usuario se inserta en el DOM con textContent (vía h()).
 */
import {
    obtenerTipos, obtenerSubtipos, obtenerDanos, obtenerNormativa,
    severidades, frecuencias, CATEGORIAS_STOP, ESTADOS_CONTROL
} from "./js/catalogo.js";
import { construirEvaluacion, calcularNRI, clasificarRiesgo, validarMatrizRiesgos, CODIGOS_SEVERIDAD } from "./js/riesgo.js";
import { uuid, h, vaciar, $, $$, formatBytes, debounce, formatoFecha, normalizar, clonar, ahoraISO } from "./js/utils.js";
import { obtenerConfig, guardarConfig, backendConfigurado } from "./js/config.js";
import {
    guardarBorrador, leerBorrador, eliminarBorrador, guardarFotoLocal, obtenerFotoLocal,
    eliminarFotosDeRegistro, leerTodosLocales, obtenerLocal
} from "./js/storage-service.js";
import { dataService, ESTADOS_SYNC, limpiarFotosHuerfanas } from "./js/data-service.js";
import { sincronizarTodo, sincronizarRegistro, conservarVersionLocal, usarVersionRemota, sincronizacionEnCurso } from "./js/sync-service.js";
import { probarConexion } from "./js/sheets-service.js";
import {
    solicitarIA, TIPOS_SOLICITUD_IA, contextoMejorarModo, contextoControles,
    contextoFotografia, contextoCompleto, prepararImagenes, hallazgosConfirmados
} from "./js/ai-service.js";
import { comprimirImagen, formatoPermitido } from "./js/imagen.js";
import { filasMatriz, generarCSV, descargarArchivo, conteoSTOP } from "./js/exportar.js";

const VERSION_APP = "1.1.1";
const PASOS = [
    { n: 1, nombre: "Actividad" },
    { n: 2, nombre: "Modo de ocurrencia y fotografías" },
    { n: 3, nombre: "Identificación del peligro" },
    { n: 4, nombre: "Evaluación inicial" },
    { n: 5, nombre: "Controles STOP" },
    { n: 6, nombre: "Revisión y guardado" }
];
const POR_PAGINA = 25;
const mqEscritorio = window.matchMedia("(min-width: 1024px)");

/* =========================================================
   Modelo
   ========================================================= */

function nuevoPeligro() {
    return {
        id: uuid(),
        tipo: "", subtipo: "", dano: "",
        normaPrincipal: "", criterioAplicacion: "", normasComplementarias: "",
        evaluacionInicial: { severidad: null, frecuencia: null, nri: "", nivelRiesgo: "" },
        controlesExistentes: [],
        controlesSTOP: { S: [], T: [], O: [], P: [] },
        // Preparado para evaluación residual: {severidad, frecuencia, nri, nivelRiesgo} seleccionados por el usuario.
        evaluacionResidual: null
    };
}

function nuevoRegistro() {
    return {
        id: uuid(),
        subArea: "", proceso: "", actividad: "", tareas: "", tipoActividad: "",
        modoOcurrencia: { texto: "", textoOriginal: "", asistidoIA: false },
        peligros: [nuevoPeligro()],
        fotografias: [],
        observaciones: "",
        version: 0,
        sincronizacion: { estado: ESTADOS_SYNC.PENDIENTE, ultimaSincronizacion: "", mensajeError: "" },
        fechaCreacion: "", fechaActualizacion: "",
        usuarioCreador: "", usuarioModificacion: ""
    };
}

function nuevoControl({ categoria, control, justificacion = "", origen = "usuario", estado = "Propuesto" }) {
    return {
        id: uuid(), categoria, categoriaNombre: CATEGORIAS_STOP[categoria].nombre,
        control, justificacion, origen, estado,
        responsable: "", fechaObjetivo: "", observaciones: ""
    };
}

const estado = {
    registro: nuevoRegistro(),
    editandoId: null,
    paso: 1,
    peligroIdx: 0,
    urlsFotos: new Map(),
    sugerencias: [],
    analisisCompleto: null,
    borradorPendiente: false,
    paginaMatriz: 1
};

const peligroActivo = () => estado.registro.peligros[estado.peligroIdx];

function registroTieneContenido(r) {
    if (!r) return false;
    return Boolean(r.subArea || r.proceso || r.actividad || r.tareas || r.tipoActividad || r.observaciones
        || r.modoOcurrencia?.texto || (r.fotografias || []).length
        || (r.peligros || []).some(p => p.tipo || p.evaluacionInicial?.severidad || p.controlesExistentes.length
            || Object.values(p.controlesSTOP).some(l => l.length)));
}

/* =========================================================
   Utilidades de UI: avisos, carga, modal
   ========================================================= */

function aviso(mensaje, tipo = "info", ms = 5000) {
    const el = h("div", { class: `aviso aviso--${tipo}`, role: tipo === "error" ? "alert" : "status" }, mensaje);
    $("#avisos").append(el);
    setTimeout(() => el.remove(), ms);
}

function mostrarCargando(texto = "Procesando…") {
    $("#cargando-texto").textContent = texto;
    $("#cargando").hidden = false;
}
function ocultarCargando() { $("#cargando").hidden = true; }

let modalResolver = null;
let modalFocoPrevio = null;

/**
 * Modal genérico. acciones: [{texto, clase, valor, onClick(ctx) → false para mantener abierto}]
 * Devuelve una promesa con el valor de la acción elegida (null si se cierra).
 */
function abrirModal({ titulo, cuerpo, acciones = [] }) {
    const dlg = $("#modal");
    if (dlg.open) cerrarModal(null);
    modalFocoPrevio = document.activeElement;
    $("#modal-titulo").textContent = titulo;
    vaciar($("#modal-cuerpo")).append(...[].concat(cuerpo));
    const ctx = {
        cuerpo: $("#modal-cuerpo"),
        cerrar: v => cerrarModal(v),
        setAcciones: nuevas => pintarAcciones(nuevas, ctx)
    };
    pintarAcciones(acciones, ctx);
    return new Promise(resolve => {
        modalResolver = resolve;
        dlg.showModal();
        const primero = $("#modal-cuerpo [autofocus]") || $("#modal-pie .btn") || $("#modal-cerrar");
        primero?.focus();
    });
}

function pintarAcciones(acciones, ctx) {
    const pie = vaciar($("#modal-pie"));
    for (const a of acciones) {
        pie.append(h("button", {
            type: "button", class: `btn ${a.clase || "btn--fantasma"}`,
            onclick: async () => {
                if (a.onClick) {
                    const r = await a.onClick(ctx);
                    if (r === false) return;
                }
                cerrarModal(a.valor ?? null);
            }
        }, a.texto));
    }
}

function cerrarModal(valor) {
    const dlg = $("#modal");
    if (dlg.open) dlg.close();
    const r = modalResolver;
    modalResolver = null;
    if (r) r(valor);
    modalFocoPrevio?.focus?.();
}

async function confirmar(mensaje, { textoAceptar = "Aceptar", peligro = false, titulo = "Confirmar" } = {}) {
    const v = await abrirModal({
        titulo,
        cuerpo: h("p", {}, mensaje),
        acciones: [
            { texto: "Cancelar", valor: false },
            { texto: textoAceptar, valor: true, clase: peligro ? "btn--peligro" : "btn--primario" }
        ]
    });
    return v === true;
}

async function conBoton(boton, fn) {
    if (boton.disabled) return;
    boton.disabled = true;
    boton.classList.add("ocupado");
    boton.setAttribute("aria-busy", "true");
    try { return await fn(); }
    finally {
        boton.disabled = false;
        boton.classList.remove("ocupado");
        boton.removeAttribute("aria-busy");
    }
}

function etiquetaNivel(nivel) {
    if (!nivel) return h("span", {}, "—");
    return h("span", { class: `etiqueta-nivel nivel-${nivel}` }, nivel);
}

/* =========================================================
   Inicialización
   ========================================================= */

function poblarSelect(sel, opciones, placeholder = "Seleccione...") {
    vaciar(sel);
    if (placeholder !== null) sel.append(h("option", { value: "" }, placeholder));
    for (const o of opciones) {
        const [valor, texto] = Array.isArray(o) ? o : [o, o];
        sel.append(h("option", { value: valor }, texto));
    }
}

function construirEstructuraEstatica() {
    poblarSelect($("#f-tipo-peligro"), obtenerTipos());
    poblarSelect($("#f-severidad"), CODIGOS_SEVERIDAD.map(c => [c, `${severidades[c].nombre} (${c})`]));
    poblarSelect($("#f-frecuencia"), ["5", "4", "3", "2", "1"].map(c => [c, `${frecuencias[c].nombre} (${c})`]));
    const cats = Object.entries(CATEGORIAS_STOP).map(([k, v]) => [k, `${k} — ${v.nombre}`]);
    poblarSelect($("#f-existente-cat"), cats, null);
    poblarSelect($("#f-adicional-cat"), cats, null);
    poblarSelect($("#flt-tipo"), obtenerTipos(), "Todos");

    // Stepper
    const ol = $("#stepper");
    for (const p of PASOS) {
        ol.append(h("li", {}, h("button", {
            type: "button", "data-ir-paso": p.n, "aria-label": `Paso ${p.n}: ${p.nombre}`,
            onclick: () => irAPaso(p.n)
        }, String(p.n), h("span", { class: "stepper__nombre" }, ` ${p.nombre}`))));
    }

    // Jerarquía STOP
    const jer = $("#stop-jerarquia");
    for (const [k, v] of Object.entries(CATEGORIAS_STOP)) {
        jer.append(h("li", {}, h("strong", {}, `${k} = ${v.nombre}. `), v.descripcion));
    }

    // Matriz 5×5
    const tabla = $("#matriz-riesgo");
    const thead = h("thead", {}, h("tr", {},
        h("th", { scope: "col" }, h("span", { class: "visualmente-oculto" }, "Severidad / Frecuencia")),
        ...["1", "2", "3", "4", "5"].map(f => h("th", { scope: "col", title: frecuencias[f].nombre }, f))));
    const tbody = h("tbody");
    for (const s of CODIGOS_SEVERIDAD) {
        const tr = h("tr", {}, h("th", { scope: "row", title: severidades[s].nombre }, s));
        for (const f of ["1", "2", "3", "4", "5"]) {
            const nri = calcularNRI(s, f);
            const nivel = clasificarRiesgo(nri);
            tr.append(h("td", {}, h("button", {
                type: "button", class: `celda-riesgo nivel-${nivel}`, "data-nri": nri,
                "aria-label": `${nri}: ${nivel}. Severidad ${severidades[s].nombre}, frecuencia ${frecuencias[f].nombre}`,
                "aria-pressed": "false",
                onclick: () => seleccionarCelda(s, f)
            }, h("strong", {}, nri), h("span", {}, nivel))));
        }
        tbody.append(tr);
    }
    tabla.append(thead, tbody);
}

function enlazarEventos() {
    // Pestañas
    $("#tab-captura").addEventListener("click", () => activarTab("captura"));
    $("#tab-matriz").addEventListener("click", () => activarTab("matriz"));
    $$(".pestana").forEach(t => t.addEventListener("keydown", e => {
        if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
            const destino = t.id === "tab-captura" ? "matriz" : "captura";
            activarTab(destino);
            $(`#tab-${destino}`).focus();
        }
    }));

    // Campos generales de la actividad
    $$("[data-campo]").forEach(el => el.addEventListener("input", () => {
        estado.registro[el.dataset.campo] = el.value;
        el.removeAttribute("aria-invalid");
        cambio();
    }));
    $("#f-modo").addEventListener("input", e => {
        estado.registro.modoOcurrencia.texto = e.target.value;
        e.target.removeAttribute("aria-invalid");
        cambio();
    });

    // Peligro: Tipo → Subtipo → Daño
    $("#f-tipo-peligro").addEventListener("change", e => {
        const p = peligroActivo();
        p.tipo = e.target.value;
        p.subtipo = ""; p.dano = "";
        aplicarNormativa(p);
        renderPeligro(); cambio();
    });
    $("#f-subtipo").addEventListener("change", e => {
        const p = peligroActivo();
        p.subtipo = e.target.value; p.dano = "";
        aplicarNormativa(p);
        renderPeligro(); cambio();
    });
    $("#f-dano").addEventListener("change", e => {
        const p = peligroActivo();
        p.dano = e.target.value;
        aplicarNormativa(p);
        renderPeligro(); cambio();
    });
    $("#btn-agregar-peligro").addEventListener("click", () => {
        estado.registro.peligros.push(nuevoPeligro());
        estado.peligroIdx = estado.registro.peligros.length - 1;
        renderPeligro(); cambio();
        $("#f-tipo-peligro").focus();
        aviso(`Peligro ${estado.peligroIdx + 1} agregado.`);
    });
    $("#btn-eliminar-peligro").addEventListener("click", eliminarPeligroActivo);

    // Evaluación
    $("#f-severidad").addEventListener("change", e => actualizarEvaluacion(e.target.value, peligroActivo().evaluacionInicial.frecuencia?.codigo));
    $("#f-frecuencia").addEventListener("change", e => actualizarEvaluacion(peligroActivo().evaluacionInicial.severidad?.codigo, e.target.value));

    // STOP
    $("#btn-agregar-existente").addEventListener("click", agregarControlExistente);
    $("#f-existente-texto").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); agregarControlExistente(); } });
    $("#btn-agregar-adicional").addEventListener("click", agregarControlAdicional);
    $("#f-adicional-texto").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); agregarControlAdicional(); } });
    $("#btn-sugerir-controles").addEventListener("click", e => conBoton(e.currentTarget, sugerirControles));

    // IA y fotos
    $("#btn-mejorar-modo").addEventListener("click", e => conBoton(e.currentTarget, mejorarModoOcurrencia));
    $("#f-foto-camara").addEventListener("change", e => cargarFotos(e.target));
    $("#f-foto-galeria").addEventListener("change", e => cargarFotos(e.target));
    $("#btn-analisis-completo").addEventListener("click", e => conBoton(e.currentTarget, analizarActividadCompleta));

    // Navegación de pasos
    $("#btn-anterior").addEventListener("click", () => irAPaso(estado.paso - 1));
    $("#btn-siguiente").addEventListener("click", () => irAPaso(estado.paso + 1));

    // Guardado
    $("#btn-guardar").addEventListener("click", e => conBoton(e.currentTarget, guardarRegistro));
    $("#btn-limpiar").addEventListener("click", limpiarFormulario);
    $("#btn-cancelar-edicion").addEventListener("click", limpiarFormulario);
    $("#form-iper").addEventListener("submit", e => e.preventDefault());

    // Borrador
    $("#btn-continuar-borrador").addEventListener("click", continuarBorrador);
    $("#btn-descartar-borrador").addEventListener("click", descartarBorrador);

    // Encabezado
    $("#btn-sincronizar").addEventListener("click", () => sincronizarUI({ silencioso: false }));
    $("#btn-config").addEventListener("click", abrirConfiguracion);

    // Matriz
    const rerender = () => { estado.paginaMatriz = 1; renderMatriz(); };
    $("#f-buscar").addEventListener("input", debounce(rerender, 250));
    ["#flt-tipo", "#flt-nivel", "#flt-subarea", "#flt-proceso", "#flt-desde", "#flt-hasta"]
        .forEach(s => $(s).addEventListener("change", rerender));
    $("#btn-limpiar-filtros").addEventListener("click", () => {
        ["#flt-tipo", "#flt-nivel", "#flt-subarea", "#flt-proceso", "#flt-desde", "#flt-hasta"].forEach(s => { $(s).value = ""; });
        rerender();
    });
    $("#btn-cargar-mas").addEventListener("click", () => { estado.paginaMatriz++; renderMatriz(); });
    $("#btn-exportar-csv").addEventListener("click", exportarCSV);
    $("#btn-imprimir").addEventListener("click", e => conBoton(e.currentTarget, imprimirMatriz));
    $("#btn-nuevo").addEventListener("click", nuevoDesdeMatriz);
    // Cambio tabla ⇄ tarjetas al rotar o redimensionar (resize como respaldo del evento del media query).
    let modoEscritorio = mqEscritorio.matches;
    const revisarModo = () => { if (mqEscritorio.matches !== modoEscritorio) { modoEscritorio = mqEscritorio.matches; renderMatriz(); } };
    mqEscritorio.addEventListener("change", revisarModo);
    window.addEventListener("resize", debounce(revisarModo, 200));

    // Modal
    $("#modal-cerrar").addEventListener("click", () => cerrarModal(null));
    $("#modal").addEventListener("cancel", e => { e.preventDefault(); cerrarModal(null); });

    // Conexión
    window.addEventListener("online", () => { actualizarEstadoConexion(); sincronizarUI({ silencioso: true }); });
    window.addEventListener("offline", actualizarEstadoConexion);
    window.addEventListener("afterprint", () => vaciar($("#area-impresion")));
}

/* =========================================================
   Autoguardado y borrador
   ========================================================= */

const autoguardar = debounce(() => {
    if (estado.borradorPendiente) return;
    if (!registroTieneContenido(estado.registro)) { eliminarBorrador(); return; }
    guardarBorrador({ registro: estado.registro, editandoId: estado.editandoId, paso: estado.paso, peligroIdx: estado.peligroIdx });
}, 700);

function cambio() {
    autoguardar();
    marcarPasosCompletos();
}

function revisarBorrador() {
    const b = leerBorrador();
    if (!b?.registro || !registroTieneContenido(b.registro)) { eliminarBorrador(); return; }
    estado.borradorPendiente = true;
    $("#banner-borrador-detalle").textContent =
        `${b.registro.actividad ? `Actividad: “${b.registro.actividad}”. ` : ""}Guardado: ${formatoFecha(b.guardadoEn)}.`;
    $("#banner-borrador").hidden = false;
}

function continuarBorrador() {
    const b = leerBorrador();
    $("#banner-borrador").hidden = true;
    estado.borradorPendiente = false;
    if (!b?.registro) return;
    cargarEnFormulario(b.registro, { editandoId: b.editandoId || null, paso: b.paso || 1, peligroIdx: b.peligroIdx || 0 });
    aviso("Borrador recuperado.", "exito");
}

async function descartarBorrador() {
    const b = leerBorrador();
    $("#banner-borrador").hidden = true;
    estado.borradorPendiente = false;
    if (b?.registro) await descartarFotosNoGuardadas(b.registro.id, b.editandoId);
    eliminarBorrador();
    aviso("Borrador descartado.");
}

/** Elimina blobs de fotos que solo existían en el formulario (no en el registro guardado). */
async function descartarFotosNoGuardadas(registroId, editandoId) {
    const guardado = editandoId ? obtenerLocal(editandoId) : obtenerLocal(registroId);
    if (guardado) await limpiarFotosHuerfanas(guardado.id, guardado.fotografias);
    else await eliminarFotosDeRegistro(registroId).catch(() => {});
}

/* =========================================================
   Formulario: carga, pasos y render
   ========================================================= */

function normalizarRegistro(r) {
    const base = nuevoRegistro();
    const reg = { ...base, ...clonar(r) };
    reg.modoOcurrencia = { ...base.modoOcurrencia, ...(reg.modoOcurrencia || {}) };
    reg.peligros = (reg.peligros?.length ? reg.peligros : [nuevoPeligro()]).map(p => {
        const np = { ...nuevoPeligro(), ...p };
        np.controlesSTOP = { S: [], T: [], O: [], P: [], ...(p.controlesSTOP || {}) };
        np.controlesExistentes = p.controlesExistentes || [];
        np.evaluacionInicial = p.evaluacionInicial || nuevoPeligro().evaluacionInicial;
        return np;
    });
    reg.fotografias = reg.fotografias || [];
    return reg;
}

function cargarEnFormulario(registro, { editandoId = null, paso = 1, peligroIdx = 0 } = {}) {
    liberarUrlsFotos();
    estado.registro = normalizarRegistro(registro);
    estado.editandoId = editandoId;
    estado.peligroIdx = Math.min(peligroIdx, estado.registro.peligros.length - 1);
    estado.sugerencias = [];
    estado.analisisCompleto = null;
    renderFormularioCompleto();
    irAPaso(paso, { enfocar: false });
}

function renderFormularioCompleto() {
    const r = estado.registro;
    $$("[data-campo]").forEach(el => { el.value = r[el.dataset.campo] ?? ""; el.removeAttribute("aria-invalid"); });
    $("#f-modo").value = r.modoOcurrencia.texto || "";
    $("#f-modo").removeAttribute("aria-invalid");
    $("#badge-modo-ia").hidden = !r.modoOcurrencia.asistidoIA;
    $("#banner-edicion").hidden = !estado.editandoId;
    $("#banner-edicion-nombre").textContent = r.actividad || "(sin actividad)";
    $("#btn-guardar").textContent = estado.editandoId ? "Guardar cambios" : "Agregar a matriz";
    $("#errores-validacion").hidden = true;
    $("#panel-sugerencias").hidden = true;
    $("#panel-analisis-completo").hidden = true;
    renderFotos();
    renderPeligro();
    marcarPasosCompletos();
}

function irAPaso(n, { enfocar = true } = {}) {
    n = Math.min(Math.max(n, 1), PASOS.length);
    estado.paso = n;
    $$("#form-iper .paso").forEach(fs => { fs.hidden = Number(fs.dataset.paso) !== n; });
    $$("#stepper [data-ir-paso]").forEach(b => {
        if (Number(b.dataset.irPaso) === n) b.setAttribute("aria-current", "step"); else b.removeAttribute("aria-current");
    });
    $("#paso-indicador").textContent = `Paso ${n} de ${PASOS.length} — ${PASOS[n - 1].nombre}`;
    $("#btn-anterior").disabled = n === 1;
    $("#btn-siguiente").hidden = n === PASOS.length;
    if (n === 3 || n === 4 || n === 5) renderPeligro();
    if (n === 6) renderRevision();
    if (enfocar) {
        $("#paso-indicador").setAttribute("tabindex", "-1");
        $("#paso-indicador").focus({ preventScroll: true });
        $("#stepper").scrollIntoView({ block: "start", behavior: "auto" });
    }
    autoguardar();
}

function marcarPasosCompletos() {
    const r = estado.registro;
    const completos = {
        1: Boolean(r.subArea && r.proceso && r.actividad && r.tareas && r.tipoActividad),
        2: Boolean(r.modoOcurrencia.texto?.trim()),
        3: r.peligros.every(p => p.tipo && p.subtipo && p.dano),
        4: r.peligros.every(p => p.evaluacionInicial?.nri),
        5: r.peligros.some(p => p.controlesExistentes.length || Object.values(p.controlesSTOP).some(l => l.length)),
        6: false
    };
    $$("#stepper [data-ir-paso]").forEach(b => b.classList.toggle("completo", completos[b.dataset.irPaso]));
}

/* ---------- Peligro ---------- */

function aplicarNormativa(p) {
    const n = obtenerNormativa(p.tipo, p.subtipo, p.dano);
    p.normaPrincipal = n?.normaPrincipal || "";
    p.criterioAplicacion = n?.criterioAplicacion || "";
    p.normasComplementarias = n ? (n.normasComplementarias || "") : "";
}

function descripcionPeligro(p, i) {
    if (!p.tipo) return `${i + 1}. Peligro sin identificar`;
    return `${i + 1}. ${p.tipo}${p.subtipo ? ` — ${p.subtipo}` : ""}`;
}

function renderPeligro() {
    const p = peligroActivo();
    const lista = vaciar($("#lista-peligros"));
    estado.registro.peligros.forEach((pp, i) => {
        lista.append(h("div", { role: "listitem" }, h("button", {
            type: "button", class: "chip",
            "aria-current": i === estado.peligroIdx ? "true" : "false",
            title: descripcionPeligro(pp, i),
            onclick: () => { estado.peligroIdx = i; renderPeligro(); }
        }, descripcionPeligro(pp, i))));
    });

    // Selects dependientes
    $("#f-tipo-peligro").value = p.tipo;
    const selSub = $("#f-subtipo");
    if (p.tipo) {
        poblarSelect(selSub, obtenerSubtipos(p.tipo));
        selSub.disabled = false;
        selSub.value = p.subtipo;
    } else {
        poblarSelect(selSub, [], "Seleccione tipo primero...");
        selSub.disabled = true;
    }
    const selDano = $("#f-dano");
    if (p.tipo && p.subtipo) {
        poblarSelect(selDano, obtenerDanos(p.tipo, p.subtipo));
        selDano.disabled = false;
        selDano.value = p.dano;
    } else {
        poblarSelect(selDano, [], "Seleccione subtipo primero...");
        selDano.disabled = true;
    }
    const valida = Boolean(obtenerNormativa(p.tipo, p.subtipo, p.dano));
    $("#f-norma").value = valida ? p.normaPrincipal : "";
    $("#f-criterio").value = valida ? p.criterioAplicacion : "";
    $("#f-complementarias").value = valida ? (p.normasComplementarias || "No especificadas") : "";
    ["#f-tipo-peligro", "#f-subtipo", "#f-dano"].forEach(s => $(s).removeAttribute("aria-invalid"));

    const texto = `Peligro ${estado.peligroIdx + 1} de ${estado.registro.peligros.length}: ` +
        (p.tipo ? [p.tipo, p.subtipo, p.dano].filter(Boolean).join(" — ") : "sin identificar (complete el paso 3)");
    $$("[data-peligro-activo]").forEach(el => { el.textContent = texto; });

    renderEvaluacion();
    renderControles();
}

async function eliminarPeligroActivo() {
    const r = estado.registro;
    const p = peligroActivo();
    const ok = await confirmar(
        r.peligros.length > 1 ? `¿Eliminar el peligro “${descripcionPeligro(p, estado.peligroIdx)}” de esta actividad?` : "¿Limpiar la información de este peligro?",
        { textoAceptar: "Eliminar", peligro: true });
    if (!ok) return;
    if (r.peligros.length > 1) {
        r.peligros.splice(estado.peligroIdx, 1);
        estado.peligroIdx = Math.max(0, estado.peligroIdx - 1);
    } else {
        r.peligros[0] = nuevoPeligro();
    }
    renderPeligro(); cambio();
}

/* ---------- Evaluación inicial ---------- */

function actualizarEvaluacion(s, f) {
    const p = peligroActivo();
    p.evaluacionInicial = construirEvaluacion(s || "", f || "");
    renderEvaluacion(); cambio();
}

function seleccionarCelda(s, f) {
    actualizarEvaluacion(s, f);
}

function renderEvaluacion() {
    const ev = peligroActivo().evaluacionInicial || {};
    const s = ev.severidad?.codigo || "";
    const f = ev.frecuencia?.codigo || "";
    $("#f-severidad").value = s;
    $("#f-frecuencia").value = f;
    $("#f-severidad").removeAttribute("aria-invalid");
    $("#f-frecuencia").removeAttribute("aria-invalid");
    $("#def-severidad").textContent = s ? `${s} — ${severidades[s].nombre}: ${severidades[s].definicion}` : "";
    $("#def-frecuencia").textContent = f ? `${frecuencias[f].nombre} (${f}): ${frecuencias[f].definicion} Valor F: ${frecuencias[f].valor}` : "";
    $$(".celda-riesgo").forEach(c => {
        const sel = c.dataset.nri === ev.nri;
        c.classList.toggle("seleccionada", sel);
        c.setAttribute("aria-pressed", sel ? "true" : "false");
    });
    const set = (k, v) => { const dd = $(`[data-res="${k}"]`); vaciar(dd).append(v instanceof Node ? v : document.createTextNode(v ?? "—")); };
    set("severidad", ev.severidad ? `${ev.severidad.nombre} (${ev.severidad.codigo})` : "—");
    set("valorS", ev.severidad ? String(ev.severidad.valor) : "—");
    set("frecuencia", ev.frecuencia ? `${ev.frecuencia.nombre} (${ev.frecuencia.codigo})` : "—");
    set("valorF", ev.frecuencia ? String(ev.frecuencia.valor) : "—");
    set("nri", ev.nri || "—");
    set("nivel", etiquetaNivel(ev.nivelRiesgo));
}

/* ---------- Controles STOP ---------- */

function agregarControlExistente() {
    const texto = $("#f-existente-texto").value.trim();
    if (!texto) { aviso("Escriba el control existente.", "alerta"); $("#f-existente-texto").focus(); return; }
    const c = nuevoControl({ categoria: $("#f-existente-cat").value, control: texto, origen: "usuario", estado: "Implementado" });
    c.existente = true;
    peligroActivo().controlesExistentes.push(c);
    $("#f-existente-texto").value = "";
    renderControles(); cambio();
    $("#f-existente-texto").focus();
}

function agregarControlAdicional() {
    const texto = $("#f-adicional-texto").value.trim();
    if (!texto) { aviso("Escriba el control adicional.", "alerta"); $("#f-adicional-texto").focus(); return; }
    const cat = $("#f-adicional-cat").value;
    peligroActivo().controlesSTOP[cat].push(nuevoControl({
        categoria: cat, control: texto, justificacion: $("#f-adicional-just").value.trim(), origen: "usuario", estado: "Seleccionado"
    }));
    $("#f-adicional-texto").value = "";
    $("#f-adicional-just").value = "";
    renderControles(); cambio();
    $("#f-adicional-texto").focus();
}

function renderControles() {
    // Conservar foco y paneles de detalle abiertos entre re-renders.
    const idFoco = document.activeElement?.id;
    const abiertos = new Set($$("#grupos-stop details[open]").map(d => d.dataset.controlId));
    renderControlesInterno();
    abiertos.forEach(id => { const d = $(`#grupos-stop details[data-control-id="${CSS.escape(id)}"]`); if (d) d.open = true; });
    if (idFoco && !document.activeElement?.id) document.getElementById(idFoco)?.focus();
}

function renderControlesInterno() {
    const p = peligroActivo();
    // Existentes
    const ul = vaciar($("#lista-controles-existentes"));
    if (!p.controlesExistentes.length) ul.append(h("li", { class: "ayuda" }, "No se han registrado controles existentes para este peligro."));
    p.controlesExistentes.forEach((c, i) => {
        ul.append(h("li", { class: "control control--Implementado" },
            h("div", { class: "control__cabecera" },
                h("span", { class: "stop-letra", "aria-hidden": "true" }, c.categoria),
                h("div", { class: "control__texto" },
                    h("p", {}, c.control),
                    h("div", { class: "control__meta" },
                        h("span", { class: "etiqueta etiqueta--existente" }, "Existente"),
                        h("span", { class: "etiqueta" }, `${c.categoria} — ${CATEGORIAS_STOP[c.categoria].nombre}`))),
                h("button", {
                    type: "button", class: "btn btn--icono", "aria-label": `Eliminar control existente: ${c.control}`,
                    onclick: () => { p.controlesExistentes.splice(i, 1); renderControles(); cambio(); }
                }, "🗑"))));
    });

    // Adicionales por categoría, en orden jerárquico S → T → O → P
    const cont = vaciar($("#grupos-stop"));
    for (const [cat, info] of Object.entries(CATEGORIAS_STOP)) {
        const lista = p.controlesSTOP[cat] || [];
        const ulc = h("ul", { class: "lista-controles" });
        lista.forEach((c, i) => ulc.append(renderControl(p, cat, c, i)));
        cont.append(h("section", { class: "grupo-stop", "aria-label": `${cat} — ${info.nombre}` },
            h("div", { class: "grupo-stop__cabecera" }, h("span", { class: "stop-letra", "aria-hidden": "true" }, cat), `${info.nombre} (${lista.length})`),
            lista.length ? ulc : h("p", { class: "grupo-stop__vacio" }, "Sin controles en esta categoría.")));
    }
}

function renderControl(p, cat, c, i) {
    const idBase = `ctl-${c.id}`;
    const seleccionado = c.estado === "Seleccionado" || c.estado === "Implementado";
    const actualizarCampo = campo => e => { c[campo] = e.target.value; cambio(); };
    const selEstado = h("select", { id: `${idBase}-estado` });
    poblarSelect(selEstado, ESTADOS_CONTROL, null);
    selEstado.value = c.estado;
    selEstado.addEventListener("change", e => { c.estado = e.target.value; renderControles(); cambio(); });

    return h("li", { class: `control control--${c.estado.replace(/\s/g, "-")}` },
        h("div", { class: "control__cabecera" },
            h("input", {
                type: "checkbox", id: `${idBase}-sel`, checked: seleccionado,
                "aria-label": `${seleccionado ? "Deseleccionar" : "Seleccionar"} control: ${c.control}`,
                onchange: e => { c.estado = e.target.checked ? (c.estado === "Implementado" ? "Implementado" : "Seleccionado") : "Propuesto"; renderControles(); cambio(); }
            }),
            h("div", { class: "control__texto" },
                h("p", {}, c.control),
                c.justificacion ? h("p", { class: "control__just" }, c.justificacion) : null,
                h("div", { class: "control__meta" },
                    h("span", { class: `etiqueta etiqueta--${c.origen}` }, c.origen === "IA" ? "✨ Sugerido por IA" : c.origen === "catalogo" ? "Catálogo" : "Usuario"),
                    h("span", { class: "etiqueta" }, c.estado),
                    c.responsable ? h("span", { class: "etiqueta" }, `Resp.: ${c.responsable}`) : null,
                    c.fechaObjetivo ? h("span", { class: "etiqueta" }, `Fecha: ${c.fechaObjetivo}`) : null))),
        h("details", { class: "control__detalles", "data-control-id": c.id },
            h("summary", {}, "Estado, responsable y fecha"),
            h("div", { class: "rejilla-campos" },
                h("div", { class: "campo" }, h("label", { for: `${idBase}-estado` }, "Estado"), selEstado),
                h("div", { class: "campo" }, h("label", { for: `${idBase}-resp` }, "Responsable"),
                    h("input", { id: `${idBase}-resp`, type: "text", maxlength: 200, value: c.responsable, oninput: actualizarCampo("responsable") })),
                h("div", { class: "campo" }, h("label", { for: `${idBase}-fecha` }, "Fecha objetivo"),
                    h("input", { id: `${idBase}-fecha`, type: "date", value: c.fechaObjetivo, onchange: actualizarCampo("fechaObjetivo") })),
                h("div", { class: "campo campo--ancho" }, h("label", { for: `${idBase}-obs` }, "Observaciones"),
                    h("textarea", { id: `${idBase}-obs`, rows: 2, maxlength: 1000, value: c.observaciones, oninput: actualizarCampo("observaciones") }))),
            h("div", { class: "acciones-linea" },
                h("button", {
                    type: "button", class: "btn btn--peligro btn--compacto",
                    onclick: async () => {
                        if (!(await confirmar(`¿Eliminar el control “${c.control}”?`, { textoAceptar: "Eliminar", peligro: true }))) return;
                        p.controlesSTOP[cat].splice(i, 1); renderControles(); cambio();
                    }
                }, "Eliminar control"))));
}

/* =========================================================
   IA: mejorar modo de ocurrencia
   ========================================================= */

function manejarErrorIA(e) {
    aviso(e.message || "No fue posible completar la solicitud de IA.", "error", 8000);
    if (e.codigo === "NO_CONFIGURADO") abrirConfiguracion();
}

async function mejorarModoOcurrencia() {
    const r = estado.registro;
    const original = r.modoOcurrencia.texto.trim();
    if (!original) { aviso("Escriba primero una descripción del modo de ocurrencia.", "alerta"); $("#f-modo").focus(); return; }
    let mejorado;
    try {
        mostrarCargando("La IA está mejorando la descripción…");
        const p = peligroActivo();
        const res = await solicitarIA({ tipoSolicitud: TIPOS_SOLICITUD_IA.MEJORAR_MODO_OCURRENCIA, contexto: contextoMejorarModo(r, p) });
        mejorado = String(res?.texto || "").trim();
        if (!mejorado) throw new Error("La IA no devolvió una descripción.");
    } catch (e) { manejarErrorIA(e); return; }
    finally { ocultarCargando(); }

    const preIA = h("p", { class: "comparacion__texto comparacion__texto--ia", id: "texto-mejorado" }, mejorado);
    const cuerpo = h("div", { class: "comparacion" },
        h("section", {}, h("h3", {}, "Texto original"), h("p", { class: "comparacion__texto" }, original)),
        h("section", { id: "seccion-mejorada" }, h("h3", {}, "Versión mejorada ✨"), preIA));
    const aceptar = texto => {
        const m = r.modoOcurrencia;
        r.modoOcurrencia = { texto, textoOriginal: m.asistidoIA && m.textoOriginal ? m.textoOriginal : original, asistidoIA: true };
        $("#f-modo").value = texto;
        $("#badge-modo-ia").hidden = false;
        cambio();
        aviso("Descripción asistida por IA aceptada.", "exito");
    };
    await abrirModal({
        titulo: "Mejora del modo de ocurrencia",
        cuerpo: [cuerpo, h("p", { class: "ayuda" }, "Revise que la versión no agregue equipos, sustancias, energías ni condiciones que no existan en la tarea.")],
        acciones: [
            { texto: "Cancelar", valor: null },
            {
                texto: "Editar antes de aceptar", clase: "btn--secundario",
                onClick: ctx => {
                    const ta = h("textarea", { id: "texto-mejorado-edit", "aria-label": "Versión mejorada (editable)", value: mejorado });
                    preIA.replaceWith(ta);
                    ta.focus();
                    ctx.setAcciones([
                        { texto: "Cancelar", valor: null },
                        { texto: "Aceptar versión editada", clase: "btn--primario", onClick: () => { aceptar(ta.value.trim()); } }
                    ]);
                    return false;
                }
            },
            { texto: "Aceptar versión", clase: "btn--primario", onClick: () => { aceptar(mejorado); } }
        ]
    });
}

/* =========================================================
   Fotografías
   ========================================================= */

function liberarUrlsFotos() {
    for (const u of estado.urlsFotos.values()) URL.revokeObjectURL(u);
    estado.urlsFotos.clear();
}

async function urlFotoLocal(id) {
    if (estado.urlsFotos.has(id)) return estado.urlsFotos.get(id);
    try {
        const f = await obtenerFotoLocal(id);
        if (!f?.blob) return null;
        const u = URL.createObjectURL(f.blob);
        estado.urlsFotos.set(id, u);
        return u;
    } catch { return null; }
}

async function cargarFotos(input) {
    const archivos = [...(input.files || [])];
    input.value = "";
    if (!archivos.length) return;
    const cfg = obtenerConfig();
    let agregadas = 0;
    mostrarCargando("Procesando fotografías…");
    try {
        for (const archivo of archivos) {
            if (!formatoPermitido(archivo)) { aviso(`“${archivo.name}”: formato no permitido (use JPG, PNG o WEBP).`, "error", 7000); continue; }
            if (archivo.size > cfg.maxFotoMB * 1024 * 1024) { aviso(`“${archivo.name}” supera el límite de ${cfg.maxFotoMB} MB.`, "error", 7000); continue; }
            try {
                const { blob, ancho, alto } = await comprimirImagen(archivo, { maxDimension: cfg.maxDimension, calidad: cfg.calidadJpeg });
                const id = uuid();
                await guardarFotoLocal({ id, registroId: estado.registro.id, blob, mimeType: "image/jpeg", nombre: archivo.name });
                estado.registro.fotografias.push({
                    id, nombreOriginal: archivo.name || `foto-${id.slice(0, 8)}.jpg`, tamanoOriginal: archivo.size, tamano: blob.size,
                    mimeType: "image/jpeg", ancho, alto, storageId: "", url: "", fechaCarga: ahoraISO(),
                    estadoCarga: "local", analisisVisualIA: null
                });
                agregadas++;
            } catch (e) {
                aviso(`“${archivo.name}”: ${e.message}`, "error", 7000);
            }
        }
    } finally { ocultarCargando(); }
    if (agregadas) { aviso(`${agregadas} fotografía(s) agregada(s).`, "exito"); renderFotos(); cambio(); }
}

async function eliminarFoto(foto) {
    if (!(await confirmar(`¿Eliminar la fotografía “${foto.nombreOriginal}” de este registro?`, { textoAceptar: "Eliminar", peligro: true }))) return;
    estado.registro.fotografias = estado.registro.fotografias.filter(f => f.id !== foto.id);
    const u = estado.urlsFotos.get(foto.id);
    if (u) { URL.revokeObjectURL(u); estado.urlsFotos.delete(foto.id); }
    renderFotos(); cambio();
}

let tokenRenderFotos = 0;

async function renderFotos() {
    const token = ++tokenRenderFotos;
    $("#limite-foto").textContent = `${obtenerConfig().maxFotoMB} MB`;
    const items = [];
    for (const foto of estado.registro.fotografias) {
        const urlLocal = await urlFotoLocal(foto.id);
        const mini = urlLocal
            ? h("img", { class: "foto__miniatura", src: urlLocal, alt: `Miniatura de ${foto.nombreOriginal}`, loading: "lazy" })
            : h("div", { class: "foto__miniatura", "aria-hidden": "true" }, "☁");
        const estadoTxt = { local: "Solo en este dispositivo", subida: "Guardada en Drive", error: "Error al subir" }[foto.estadoCarga] || "";
        const acciones = h("div", { class: "foto__acciones" });
        if (urlLocal) {
            acciones.append(h("button", {
                type: "button", class: "btn btn--ia btn--compacto",
                onclick: e => conBoton(e.currentTarget, () => analizarFotografia(foto))
            }, "✨ Analizar fotografía con IA"));
        }
        if (foto.url) acciones.append(h("a", { class: "btn btn--fantasma btn--compacto", href: foto.url, target: "_blank", rel: "noopener noreferrer" }, "Abrir en Drive"));
        if (foto.estadoCarga === "error") {
            acciones.append(h("button", { type: "button", class: "btn btn--secundario btn--compacto", onclick: e => conBoton(e.currentTarget, reintentarSubidaFotos) }, "Reintentar subida"));
        }
        acciones.append(h("button", { type: "button", class: "btn btn--peligro btn--compacto", onclick: () => eliminarFoto(foto) }, "Eliminar"));

        const li = h("li", { class: "foto" },
            mini,
            h("div", { class: "foto__info" },
                h("p", { class: "foto__nombre" }, foto.nombreOriginal),
                h("p", { class: "foto__meta" },
                    `${formatBytes(foto.tamano)}${foto.tamanoOriginal ? ` (original ${formatBytes(foto.tamanoOriginal)})` : ""}${foto.ancho ? ` · ${foto.ancho}×${foto.alto}px` : ""} · ${estadoTxt}`),
                acciones));
        if (foto.analisisVisualIA) li.append(renderAnalisisFoto(foto));
        items.push(li);
    }
    if (token !== tokenRenderFotos) return; // un render más reciente tomó el control
    vaciar($("#lista-fotos")).append(...items);
    renderHallazgosConfirmados();
}

async function reintentarSubidaFotos() {
    const guardado = obtenerLocal(estado.registro.id);
    if (!guardado) { aviso("Guarde primero el registro; las fotografías se suben al sincronizar.", "alerta"); return; }
    try {
        await sincronizarRegistro(guardado);
        const actualizado = obtenerLocal(estado.registro.id);
        // Mantener los cambios del formulario pero actualizar el estado de carga de las fotos.
        const porId = new Map((actualizado?.fotografias || []).map(f => [f.id, f]));
        estado.registro.fotografias = estado.registro.fotografias.map(f => {
            const s = porId.get(f.id);
            return s ? { ...f, storageId: s.storageId, url: s.url, estadoCarga: s.estadoCarga } : f;
        });
        aviso("Fotografías sincronizadas.", "exito");
    } catch (e) {
        aviso(e.message, "error", 8000);
    }
    renderFotos(); renderMatriz();
}

/* ---------- Análisis visual con IA ---------- */

function canonico(lista, valor) {
    const n = normalizar(valor).trim();
    return lista.find(x => normalizar(x) === n) || "";
}

/** Valida contra el catálogo los valores sugeridos por la IA (no se aceptan valores inventados). */
function validarSugerenciaCatalogo(tipo, subtipo, dano) {
    const t = canonico(obtenerTipos(), tipo);
    const s = t ? canonico(obtenerSubtipos(t), subtipo) : "";
    const d = s ? canonico(obtenerDanos(t, s), dano) : "";
    return { tipo: t, subtipo: s, dano: d };
}

async function analizarFotografia(foto) {
    let res;
    try {
        mostrarCargando("La IA está analizando la fotografía…");
        const imagenes = await prepararImagenes([foto], 1);
        if (!imagenes.length) throw new Error("La fotografía no está disponible en este dispositivo.");
        res = await solicitarIA({ tipoSolicitud: TIPOS_SOLICITUD_IA.ANALIZAR_FOTOGRAFIA, contexto: contextoFotografia(estado.registro), imagenes });
    } catch (e) { manejarErrorIA(e); return; }
    finally { ocultarCargando(); }

    const confianzas = ["Alta", "Media", "Baja"];
    const f = estado.registro.fotografias.find(x => x.id === foto.id);
    if (!f) return;
    f.analisisVisualIA = {
        resumen: String(res?.resumen || ""),
        limitaciones: String(res?.limitaciones || ""),
        fecha: ahoraISO(),
        hallazgos: (Array.isArray(res?.hallazgos) ? res.hallazgos : []).map(x => ({
            id: uuid(),
            observacion: String(x.observacion || ""),
            confianza: canonico(confianzas, x.confianza) || "Baja",
            posiblePeligro: String(x.posiblePeligro || ""),
            subtipoSugerido: String(x.subtipoSugerido || ""),
            danoSugerido: String(x.danoSugerido || ""),
            justificacion: String(x.justificacion || ""),
            estado: "pendiente"
        }))
    };
    renderFotos(); cambio();
    aviso(`Análisis completado: ${f.analisisVisualIA.hallazgos.length} hallazgo(s) por revisar.`, "exito");
}

function renderAnalisisFoto(foto) {
    const a = foto.analisisVisualIA;
    const cont = h("div", { class: "foto__analisis panel-analisis" },
        h("h4", {}, "✨ Análisis visual con IA"),
        a.resumen ? h("p", {}, a.resumen) : null,
        a.limitaciones ? h("p", { class: "ayuda" }, `Limitaciones: ${a.limitaciones}`) : null);
    if (!a.hallazgos.length) cont.append(h("p", { class: "ayuda" }, "La IA no identificó hallazgos visibles."));
    for (const hz of a.hallazgos) {
        const acciones = h("div", { class: "acciones-linea" });
        if (hz.estado !== "confirmado") acciones.append(h("button", { type: "button", class: "btn btn--secundario btn--compacto", onclick: () => { hz.estado = "confirmado"; renderFotos(); cambio(); } }, "Confirmar hallazgo"));
        if (hz.estado !== "descartado") acciones.append(h("button", { type: "button", class: "btn btn--fantasma btn--compacto", onclick: () => { hz.estado = "descartado"; renderFotos(); cambio(); } }, "Descartar"));
        if (hz.estado !== "descartado") acciones.append(h("button", { type: "button", class: "btn btn--primario btn--compacto", onclick: () => { hz.estado = "confirmado"; agregarPeligroSugerido(hz.posiblePeligro, hz.subtipoSugerido, hz.danoSugerido); renderFotos(); } }, "Agregar como peligro"));
        cont.append(h("div", { class: `hallazgo hallazgo--${hz.estado}` },
            h("dl", {},
                h("dt", {}, "Observación"), h("dd", {}, hz.observacion),
                h("dt", {}, "Confianza"), h("dd", {}, h("span", { class: `confianza confianza--${hz.confianza}` }, hz.confianza)),
                h("dt", {}, "Posible peligro"), h("dd", {}, hz.posiblePeligro || "—"),
                h("dt", {}, "Subtipo sugerido"), h("dd", {}, hz.subtipoSugerido || "—"),
                h("dt", {}, "Daño sugerido"), h("dd", {}, hz.danoSugerido || "—"),
                h("dt", {}, "Justificación"), h("dd", {}, hz.justificacion || "—"),
                h("dt", {}, "Estado"), h("dd", {}, { pendiente: "Pendiente de revisión", confirmado: "Confirmado", descartado: "Descartado" }[hz.estado])),
            acciones));
    }
    return cont;
}

function renderHallazgosConfirmados() {
    const lista = hallazgosConfirmados(estado.registro);
    $("#panel-hallazgos-confirmados").hidden = !lista.length;
    const ul = vaciar($("#lista-hallazgos-confirmados"));
    lista.forEach(x => ul.append(h("li", {}, `${x.observacion}${x.posiblePeligro ? ` → ${x.posiblePeligro}` : ""}${x.subtipoSugerido ? ` / ${x.subtipoSugerido}` : ""}`)));
}

/** Propone un peligro a partir de una sugerencia IA. El usuario debe revisarlo y completarlo. */
function agregarPeligroSugerido(tipo, subtipo, dano) {
    const v = validarSugerenciaCatalogo(tipo, subtipo, dano);
    const r = estado.registro;
    let idx = r.peligros.findIndex(p => !p.tipo);
    if (idx < 0) { r.peligros.push(nuevoPeligro()); idx = r.peligros.length - 1; }
    const p = r.peligros[idx];
    Object.assign(p, { tipo: v.tipo, subtipo: v.subtipo, dano: v.dano });
    aplicarNormativa(p);
    estado.peligroIdx = idx;
    cambio();
    irAPaso(3);
    if (!v.tipo) aviso("El peligro sugerido no coincide con el catálogo: seleccione Tipo, Subtipo y Daño manualmente.", "alerta", 8000);
    else if (!v.dano) aviso("Peligro propuesto parcialmente. Complete y confirme Subtipo y Daño.", "alerta", 8000);
    else aviso("Peligro propuesto a partir de la sugerencia. Revíselo y confírmelo.", "exito", 7000);
}

/* =========================================================
   IA: sugerencias STOP
   ========================================================= */

async function sugerirControles() {
    const p = peligroActivo();
    if (!p.tipo || !p.subtipo || !p.dano) { aviso("Identifique primero Tipo, Subtipo y Daño del peligro (paso 3).", "alerta"); return; }
    let res;
    try {
        mostrarCargando("La IA está proponiendo controles STOP…");
        res = await solicitarIA({ tipoSolicitud: TIPOS_SOLICITUD_IA.SUGERIR_CONTROLES_STOP, contexto: contextoControles(estado.registro, p) });
    } catch (e) { manejarErrorIA(e); return; }
    finally { ocultarCargando(); }
    estado.sugerencias = normalizarSugerencias(res?.controles);
    renderSugerencias(res?.notas);
}

function normalizarSugerencias(lista) {
    return (Array.isArray(lista) ? lista : [])
        .filter(c => CATEGORIAS_STOP[String(c.categoria || "").toUpperCase()] && String(c.control || "").trim())
        .map(c => ({ id: uuid(), categoria: String(c.categoria).toUpperCase(), control: String(c.control).trim(), justificacion: String(c.justificacion || "").trim() }))
        .sort((a, b) => "STOP".indexOf(a.categoria) - "STOP".indexOf(b.categoria));
}

function listaSugerenciasSeleccionables(sugerencias, prefijo) {
    const frag = h("div");
    for (const cat of Object.keys(CATEGORIAS_STOP)) {
        const items = sugerencias.filter(s => s.categoria === cat);
        if (!items.length) continue;
        frag.append(h("h4", {}, `${cat} — ${CATEGORIAS_STOP[cat].nombre}`));
        for (const s of items) {
            const id = `${prefijo}-${s.id}`;
            frag.append(h("div", { class: "sugerencia" },
                h("input", { type: "checkbox", id, "data-sugerencia": s.id }),
                h("label", { for: id }, h("strong", {}, s.control), s.justificacion ? h("span", { class: "control__just" }, ` — ${s.justificacion}`) : null)));
        }
    }
    return frag;
}

function renderSugerencias(notas) {
    const panel = vaciar($("#panel-sugerencias"));
    panel.hidden = false;
    panel.append(h("p", {}, h("strong", {}, "Controles sugeridos por IA (propuestos). "),
        "Marque los que desea agregar; ninguno se selecciona automáticamente ni se considera implementado."));
    if (notas) panel.append(h("p", { class: "ayuda" }, String(notas)));
    if (!estado.sugerencias.length) panel.append(h("p", {}, "La IA no propuso controles para este escenario."));
    else panel.append(listaSugerenciasSeleccionables(estado.sugerencias, "sug"));
    panel.append(h("div", { class: "acciones-linea" },
        estado.sugerencias.length ? h("button", { type: "button", class: "btn btn--primario btn--compacto", onclick: () => agregarSugerenciasMarcadas(panel, estado.sugerencias, peligroActivo()) }, "Agregar seleccionados") : null,
        h("button", { type: "button", class: "btn btn--fantasma btn--compacto", onclick: () => { estado.sugerencias = []; panel.hidden = true; } }, "Descartar sugerencias")));
    panel.scrollIntoView({ block: "nearest" });
}

function agregarSugerenciasMarcadas(panel, sugerencias, peligro) {
    const marcadas = $$("[data-sugerencia]", panel).filter(c => c.checked).map(c => c.dataset.sugerencia);
    if (!marcadas.length) { aviso("Marque al menos un control para agregarlo.", "alerta"); return; }
    let n = 0;
    for (const s of sugerencias.filter(x => marcadas.includes(x.id))) {
        const lista = peligro.controlesSTOP[s.categoria];
        if (lista.some(c => normalizar(c.control) === normalizar(s.control))) continue;
        lista.push(nuevoControl({ categoria: s.categoria, control: s.control, justificacion: s.justificacion, origen: "IA", estado: "Propuesto" }));
        n++;
    }
    // Quitar del panel las ya agregadas.
    const restantes = sugerencias.filter(x => !marcadas.includes(x.id));
    if (panel.id === "panel-sugerencias") { estado.sugerencias = restantes; renderSugerencias(); if (!restantes.length) panel.hidden = true; }
    else { marcadas.forEach(id => $(`[data-sugerencia="${id}"]`, panel)?.closest(".sugerencia")?.remove()); }
    renderControles(); cambio();
    aviso(`${n} control(es) agregado(s) como “Propuesto”. Márquelos para seleccionarlos.`, "exito", 7000);
}

/* =========================================================
   IA: análisis de actividad completa
   ========================================================= */

async function analizarActividadCompleta() {
    const r = estado.registro;
    if (!r.actividad && !r.modoOcurrencia.texto) { aviso("Capture al menos la actividad y el modo de ocurrencia.", "alerta"); return; }
    let res;
    try {
        mostrarCargando("La IA está analizando la actividad completa…");
        const imagenes = await prepararImagenes(r.fotografias, 3);
        res = await solicitarIA({ tipoSolicitud: TIPOS_SOLICITUD_IA.ANALIZAR_ACTIVIDAD_COMPLETA, contexto: contextoCompleto(r), imagenes });
    } catch (e) { manejarErrorIA(e); return; }
    finally { ocultarCargando(); }
    estado.analisisCompleto = { ...res, controlesSugeridos: normalizarSugerencias(res?.controlesSugeridos) };
    renderAnalisisCompleto();
}

function listaTexto(items) {
    const arr = (Array.isArray(items) ? items : []).map(x => (typeof x === "string" ? x : x?.texto || x?.descripcion || x?.observacion || JSON.stringify(x)));
    if (!arr.length) return h("p", { class: "ayuda" }, "Sin elementos.");
    return h("ul", { class: "lista-simple" }, arr.map(t => h("li", {}, t)));
}

function renderAnalisisCompleto() {
    const a = estado.analisisCompleto;
    const panel = vaciar($("#panel-analisis-completo"));
    panel.hidden = false;
    const calidad = a.calidadDescripcion;
    panel.append(
        h("h4", {}, "Calidad de descripción"),
        h("p", {}, typeof calidad === "string" ? calidad : [calidad?.valoracion, calidad?.comentarios].filter(Boolean).join(" — ") || "—"),
        h("h4", {}, "Información faltante"), listaTexto(a.informacionFaltante),
        h("h4", {}, "Hallazgos visuales"), listaTexto(a.hallazgosVisuales),
        h("h4", {}, "Peligros potenciales"));

    const peligros = Array.isArray(a.peligrosPotenciales) ? a.peligrosPotenciales : [];
    if (!peligros.length) panel.append(h("p", { class: "ayuda" }, "Sin elementos."));
    const ulp = h("ul", { class: "lista-simple" });
    for (const pp of peligros) {
        ulp.append(h("li", {},
            h("strong", {}, [pp.tipo, pp.subtipo, pp.dano].filter(Boolean).join(" — ") || "Peligro"),
            pp.justificacion ? ` — ${pp.justificacion}` : "", " ",
            h("button", { type: "button", class: "btn btn--secundario btn--compacto", onclick: () => agregarPeligroSugerido(pp.tipo, pp.subtipo, pp.dano) }, "Agregar como peligro")));
    }
    panel.append(ulp);

    panel.append(h("h4", {}, "Información por confirmar"), listaTexto(a.preguntasPorConfirmar),
        h("p", { class: "ayuda" }, "Estas preguntas no se responden automáticamente; confirme la información en campo."));

    panel.append(h("h4", {}, "Controles STOP sugeridos"));
    if (!a.controlesSugeridos.length) panel.append(h("p", { class: "ayuda" }, "Sin elementos."));
    else {
        const contenedor = h("div");
        contenedor.append(listaSugerenciasSeleccionables(a.controlesSugeridos, "anc"));
        const peligrosValidos = estado.registro.peligros.map((p, i) => [String(i), descripcionPeligro(p, i)]);
        const sel = h("select", { id: "anc-destino" });
        poblarSelect(sel, peligrosValidos, null);
        sel.value = String(estado.peligroIdx);
        contenedor.append(h("div", { class: "form-control-nuevo" },
            h("div", { class: "campo campo--crece" }, h("label", { for: "anc-destino" }, "Agregar al peligro"), sel),
            h("button", {
                type: "button", class: "btn btn--primario",
                onclick: () => agregarSugerenciasMarcadas(contenedor, a.controlesSugeridos, estado.registro.peligros[Number(sel.value)])
            }, "Agregar seleccionados")));
        panel.append(contenedor);
    }
    panel.append(h("div", { class: "acciones-linea" },
        h("button", { type: "button", class: "btn btn--fantasma btn--compacto", onclick: () => { estado.analisisCompleto = null; panel.hidden = true; } }, "Cerrar análisis")));
    panel.scrollIntoView({ block: "start" });
}

/* =========================================================
   Revisión, validación y guardado
   ========================================================= */

function renderRevision() {
    const r = estado.registro;
    const cont = vaciar($("#revision"));
    const dl = (pares) => h("dl", {}, pares.flatMap(([k, v]) => [h("dt", {}, k), h("dd", {}, v instanceof Node ? v : (v || "—"))]));
    cont.append(dl([
        ["Sub área", r.subArea], ["Proceso", r.proceso], ["Actividad", r.actividad], ["Tareas", r.tareas],
        ["Tipo de actividad", r.tipoActividad],
        ["Modo de ocurrencia", r.modoOcurrencia.texto + (r.modoOcurrencia.asistidoIA ? "\n✨ Descripción asistida por IA" : "")],
        ["Fotografías", `${r.fotografias.length} · Hallazgos confirmados: ${hallazgosConfirmados(r).length}`]
    ]));
    r.peligros.forEach((p, i) => {
        const ev = p.evaluacionInicial || {};
        const stop = conteoSTOP(p);
        cont.append(h("section", { class: "revision__peligro" },
            h("h4", {}, descripcionPeligro(p, i)),
            dl([
                ["Daño", p.dano], ["Norma principal", p.normaPrincipal],
                ["Normas complementarias", p.tipo && p.dano ? (p.normasComplementarias || "No especificadas") : ""],
                ["NRI", ev.nri ? `${ev.nri} (S: ${ev.severidad.nombre}, F: ${ev.frecuencia.nombre})` : ""],
                ["Nivel de riesgo inicial", etiquetaNivel(ev.nivelRiesgo)],
                ["Controles", `Existentes: ${p.controlesExistentes.length} · S: ${stop.S} · T: ${stop.T} · O: ${stop.O} · P: ${stop.P}`]
            ]),
            h("button", { type: "button", class: "btn btn--fantasma btn--compacto", onclick: () => { estado.peligroIdx = i; irAPaso(3); } }, "Revisar este peligro")));
    });
}

function validarRegistro(r) {
    const errores = [];
    const req = (valor, paso, campoId, mensaje, peligroIdx = null) => { if (!String(valor ?? "").trim()) errores.push({ paso, campoId, mensaje, peligroIdx }); };
    req(r.subArea, 1, "f-subarea", "Sub área es obligatoria.");
    req(r.proceso, 1, "f-proceso", "Proceso es obligatorio.");
    req(r.actividad, 1, "f-actividad", "Actividad es obligatoria.");
    req(r.tareas, 1, "f-tareas", "Tareas es obligatorio.");
    req(r.tipoActividad, 1, "f-tipo-actividad", "Tipo de actividad es obligatorio.");
    req(r.modoOcurrencia.texto, 2, "f-modo", "Modo de ocurrencia es obligatorio.");
    r.peligros.forEach((p, i) => {
        const pref = `Peligro ${i + 1}: `;
        req(p.tipo, 3, "f-tipo-peligro", `${pref}Tipo de peligro es obligatorio.`, i);
        req(p.subtipo, 3, "f-subtipo", `${pref}Subtipo es obligatorio.`, i);
        req(p.dano, 3, "f-dano", `${pref}Daño es obligatorio.`, i);
        if (p.tipo && p.subtipo && p.dano && !obtenerNormativa(p.tipo, p.subtipo, p.dano)) {
            errores.push({ paso: 3, campoId: "f-dano", mensaje: `${pref}la combinación Tipo + Subtipo + Daño no existe en el catálogo.`, peligroIdx: i });
        }
        req(p.evaluacionInicial?.severidad?.codigo, 4, "f-severidad", `${pref}Severidad es obligatoria.`, i);
        req(p.evaluacionInicial?.frecuencia?.codigo, 4, "f-frecuencia", `${pref}Frecuencia es obligatoria.`, i);
    });
    return errores;
}

function mostrarErrores(errores) {
    const box = vaciar($("#errores-validacion"));
    $$("#stepper [data-ir-paso]").forEach(b => b.classList.toggle("con-error", errores.some(e => e.paso === Number(b.dataset.irPaso))));
    if (!errores.length) { box.hidden = true; return; }
    box.hidden = false;
    box.append(h("strong", {}, `Faltan ${errores.length} dato(s) obligatorio(s):`),
        h("ul", {}, errores.map(e => h("li", {}, h("button", {
            type: "button",
            onclick: () => {
                if (e.peligroIdx !== null) estado.peligroIdx = e.peligroIdx;
                irAPaso(e.paso, { enfocar: false });
                const campo = document.getElementById(e.campoId);
                campo?.setAttribute("aria-invalid", "true");
                campo?.focus();
            }
        }, `Paso ${e.paso}: ${e.mensaje}`)))));
    box.focus?.();
}

async function guardarRegistro() {
    const r = estado.registro;
    const errores = validarRegistro(r);
    mostrarErrores(errores);
    if (errores.length) {
        $("#errores-validacion").setAttribute("tabindex", "-1");
        $("#errores-validacion").focus();
        aviso("Complete los datos obligatorios antes de guardar.", "error");
        return;
    }
    try {
        const guardado = estado.editandoId ? await dataService.actualizar(r) : await dataService.crear(r);
        eliminarBorrador();
        aviso(estado.editandoId ? "Cambios guardados localmente." : "Registro agregado a la matriz (guardado localmente).", "exito");
        reiniciarFormulario();
        activarTab("matriz");
        renderMatriz();
        if (obtenerConfig().sincronizarAlGuardar && navigator.onLine && backendConfigurado()) {
            sincronizarUI({ silencioso: true, idEnfocado: guardado.id });
        }
    } catch (e) {
        aviso(`No se pudo guardar: ${e.message}`, "error", 9000);
    }
}

function reiniciarFormulario() {
    liberarUrlsFotos();
    estado.registro = nuevoRegistro();
    estado.editandoId = null;
    estado.peligroIdx = 0;
    estado.sugerencias = [];
    estado.analisisCompleto = null;
    renderFormularioCompleto();
    $$("#stepper [data-ir-paso]").forEach(b => b.classList.remove("con-error"));
    irAPaso(1, { enfocar: false });
}

async function limpiarFormulario() {
    if (registroTieneContenido(estado.registro)) {
        const msg = estado.editandoId
            ? "¿Descartar los cambios no guardados de este registro? El registro guardado no se modificará."
            : "¿Limpiar el formulario? Los registros existentes en la matriz no se eliminarán.";
        if (!(await confirmar(msg, { textoAceptar: "Limpiar", peligro: true }))) return;
    }
    await descartarFotosNoGuardadas(estado.registro.id, estado.editandoId);
    eliminarBorrador();
    reiniciarFormulario();
    aviso("Formulario limpio.");
}

async function nuevoDesdeMatriz() {
    if (registroTieneContenido(estado.registro)) {
        const v = await abrirModal({
            titulo: "Nuevo registro",
            cuerpo: h("p", {}, "El formulario contiene información sin guardar."),
            acciones: [
                { texto: "Continuar con el formulario actual", clase: "btn--secundario", valor: "continuar" },
                { texto: "Empezar uno nuevo", clase: "btn--peligro", valor: "nuevo" }
            ]
        });
        if (!v) return;
        if (v === "nuevo") {
            await descartarFotosNoGuardadas(estado.registro.id, estado.editandoId);
            eliminarBorrador();
            reiniciarFormulario();
        }
    }
    activarTab("captura");
}

async function editarRegistro(id, peligroIdx = 0) {
    const reg = await dataService.obtener(id);
    if (!reg) { aviso("El registro ya no existe.", "error"); return; }
    if (registroTieneContenido(estado.registro) && estado.registro.id !== id) {
        const ok = await confirmar("El formulario contiene información sin guardar. ¿Descartarla para editar este registro?", { textoAceptar: "Descartar y editar", peligro: true });
        if (!ok) return;
        await descartarFotosNoGuardadas(estado.registro.id, estado.editandoId);
    }
    cargarEnFormulario(reg, { editandoId: id, paso: 1, peligroIdx });
    activarTab("captura");
    autoguardar();
    aviso("Registro cargado para edición.");
}

/* =========================================================
   Vista matriz: búsqueda, filtros, tabla/tarjetas, contadores
   ========================================================= */

function activarTab(nombre) {
    const esCaptura = nombre === "captura";
    $("#vista-captura").hidden = !esCaptura;
    $("#vista-matriz").hidden = esCaptura;
    $(".navegacion-pasos").hidden = !esCaptura;
    $("#tab-captura").setAttribute("aria-selected", String(esCaptura));
    $("#tab-matriz").setAttribute("aria-selected", String(!esCaptura));
    $("#tab-captura").tabIndex = esCaptura ? 0 : -1;
    $("#tab-matriz").tabIndex = esCaptura ? -1 : 0;
    if (!esCaptura) renderMatriz();
    window.scrollTo({ top: 0 });
}

async function filasFiltradas() {
    const registros = await dataService.listar();
    let filas = filasMatriz(registros).sort((a, b) =>
        (b.registro.fechaActualizacion || "").localeCompare(a.registro.fechaActualizacion || "") || a.indicePeligro - b.indicePeligro);
    const q = normalizar($("#f-buscar").value).trim();
    const tipo = $("#flt-tipo").value, nivel = $("#flt-nivel").value;
    const subArea = $("#flt-subarea").value, proceso = $("#flt-proceso").value;
    const desde = $("#flt-desde").value, hasta = $("#flt-hasta").value;
    filas = filas.filter(({ registro: r, peligro: p }) => {
        const ev = p.evaluacionInicial || {};
        if (tipo && p.tipo !== tipo) return false;
        if (nivel && ev.nivelRiesgo !== nivel) return false;
        if (subArea && r.subArea !== subArea) return false;
        if (proceso && r.proceso !== proceso) return false;
        const fecha = (r.fechaCreacion || "").slice(0, 10);
        if (desde && fecha < desde) return false;
        if (hasta && fecha > hasta) return false;
        if (q) {
            const texto = normalizar([r.subArea, r.proceso, r.actividad, r.tareas, r.modoOcurrencia?.texto, p.tipo, p.subtipo, p.dano,
                p.normaPrincipal, ev.severidad?.nombre, ev.severidad?.codigo, ev.frecuencia?.nombre, ev.frecuencia?.codigo, ev.nri, ev.nivelRiesgo].join(" "));
            if (!q.split(/\s+/).every(t => texto.includes(t))) return false;
        }
        return true;
    });
    return { registros, filas };
}

function actualizarOpcionesFiltro(sel, valores) {
    const actual = sel.value;
    poblarSelect(sel, [...new Set(valores.filter(Boolean))].sort((a, b) => a.localeCompare(b, "es")), "Todos");
    sel.value = valores.includes(actual) ? actual : "";
}

async function renderMatriz() {
    const { registros, filas } = await filasFiltradas();
    actualizarOpcionesFiltro($("#flt-subarea"), registros.map(r => r.subArea));
    actualizarOpcionesFiltro($("#flt-proceso"), registros.map(r => r.proceso));
    renderContadores(registros);

    const todasFilas = filasMatriz(registros).length;
    $("#tab-matriz-total").textContent = String(todasFilas);
    $("#matriz-vacia").hidden = todasFilas > 0;
    $("#resultado-filtro").textContent = todasFilas ? `Mostrando ${Math.min(filas.length, estado.paginaMatriz * POR_PAGINA)} de ${filas.length} resultado(s) (${todasFilas} en total).` : "";

    const visibles = filas.slice(0, estado.paginaMatriz * POR_PAGINA);
    $("#btn-cargar-mas").hidden = visibles.length >= filas.length;
    const tbody = vaciar($("#tabla-matriz-body"));
    const tarjetas = vaciar($("#tarjetas-matriz"));
    if (mqEscritorio.matches) visibles.forEach((f, i) => tbody.append(filaTabla(f, i + 1)));
    else visibles.forEach(f => tarjetas.append(tarjetaRegistro(f)));
    actualizarBadgePendientes();
}

function renderContadores(registros) {
    const filas = filasMatriz(registros);
    const niveles = { BAJO: 0, MEDIO: 0, ALTO: 0 };
    filas.forEach(f => { const n = f.peligro.evaluacionInicial?.nivelRiesgo; if (n) niveles[n]++; });
    const tipos = new Set(filas.map(f => f.peligro.tipo).filter(Boolean));
    const pendientes = dataService.pendientes().length;
    const datos = [
        ["Total de registros", filas.length, ""], ["Tipos de peligros identificados", tipos.size, ""],
        ["Riesgos BAJOS", niveles.BAJO, "nivel-BAJO"], ["Riesgos MEDIOS", niveles.MEDIO, "nivel-MEDIO"],
        ["Riesgos ALTOS", niveles.ALTO, "nivel-ALTO"], ["Pendientes de sincronización", pendientes, ""]
    ];
    const c = vaciar($("#contadores"));
    datos.forEach(([etq, val, cls]) => c.append(h("div", { class: `contador ${cls}` },
        h("span", { class: "contador__valor" }, String(val)), h("span", { class: "contador__etiqueta" }, etq))));
}

function estadoSync(r) {
    const e = r.sincronizacion?.estado || ESTADOS_SYNC.PENDIENTE;
    const cls = e === ESTADOS_SYNC.SINCRONIZADO ? "Sincronizado" : e === ESTADOS_SYNC.PENDIENTE ? "Pendiente" : "Error";
    return h("span", { class: `estado-sync estado-sync--${cls}`, title: r.sincronizacion?.mensajeError || "" }, e);
}

function resumenSTOP(p) {
    const c = conteoSTOP(p);
    return `S: ${c.S} · T: ${c.T} · O: ${c.O} · P: ${c.P}`;
}

function botonesAcciones(f) {
    return [
        h("button", { type: "button", class: "btn btn--secundario btn--compacto", onclick: () => verDetalle(f.registro.id, f.indicePeligro) }, "Ver detalle"),
        h("button", { type: "button", class: "btn btn--primario btn--compacto", onclick: () => editarRegistro(f.registro.id, f.indicePeligro) }, "Editar"),
        h("button", { type: "button", class: "btn btn--peligro btn--compacto", onclick: () => eliminarDesdeMatriz(f.registro.id, f.indicePeligro) }, "Eliminar")
    ];
}

function filaTabla(f, n) {
    const { registro: r, peligro: p } = f;
    const ev = p.evaluacionInicial || {};
    const largo = t => h("td", { class: "texto-largo" }, h("div", { class: "recorte", title: t || "" }, t || "—"));
    return h("tr", {},
        h("td", {}, String(n)), h("td", {}, r.subArea), h("td", {}, r.proceso), h("td", {}, r.actividad),
        largo(r.tareas), h("td", {}, r.tipoActividad), largo(r.modoOcurrencia?.texto),
        h("td", {}, p.tipo), h("td", {}, p.subtipo), h("td", {}, p.dano), h("td", {}, p.normaPrincipal),
        largo(p.criterioAplicacion), h("td", {}, p.normasComplementarias || "No especificadas"),
        h("td", {}, ev.severidad ? `${ev.severidad.nombre} (${ev.severidad.codigo})` : "—"),
        h("td", {}, ev.frecuencia ? `${ev.frecuencia.nombre} (${ev.frecuencia.codigo})` : "—"),
        h("td", {}, h("strong", {}, ev.nri || "—")), h("td", {}, etiquetaNivel(ev.nivelRiesgo)),
        h("td", { class: "stop-resumen" }, resumenSTOP(p)), h("td", {}, String((r.fotografias || []).length)),
        h("td", {}, estadoSync(r)), h("td", {}, h("div", { class: "acciones-celda" }, botonesAcciones(f))));
}

function tarjetaRegistro(f) {
    const { registro: r, peligro: p } = f;
    const ev = p.evaluacionInicial || {};
    const c = conteoSTOP(p);
    return h("li", { class: "tarjeta-registro" },
        h("dl", {},
            h("dt", {}, "Actividad:"), h("dd", {}, r.actividad || "—"),
            h("dt", {}, "Sub área:"), h("dd", {}, r.subArea || "—"),
            h("dt", {}, "Peligro:"), h("dd", {}, `${p.tipo || "—"} — ${p.subtipo || "—"}`),
            h("dt", {}, "Daño:"), h("dd", {}, p.dano || "—"),
            h("dt", {}, "NRI:"), h("dd", {}, h("strong", {}, ev.nri || "—")),
            h("dt", {}, "Nivel:"), h("dd", {}, etiquetaNivel(ev.nivelRiesgo)),
            h("dt", {}, "STOP:"), h("dd", { class: "stop-resumen" }, `S: ${c.S}  T: ${c.T}  O: ${c.O}  P: ${c.P}`),
            h("dt", {}, "Estado:"), h("dd", {}, estadoSync(r))),
        h("div", { class: "tarjeta-registro__acciones" }, botonesAcciones(f)));
}

async function verDetalle(id, peligroIdx) {
    const r = await dataService.obtener(id);
    if (!r) return;
    const cuerpo = await construirDetalle(r, peligroIdx);
    const v = await abrirModal({
        titulo: r.actividad || "Detalle del registro",
        cuerpo,
        acciones: [{ texto: "Cerrar", valor: null }, { texto: "Editar", clase: "btn--primario", valor: "editar" }]
    });
    if (v === "editar") editarRegistro(id, peligroIdx);
}

async function construirDetalle(r, peligroIdx = null) {
    const pares = (lista) => lista.flatMap(([k, v]) => [h("dt", {}, k), h("dd", {}, v instanceof Node ? v : (v || "—"))]);
    const cont = h("div", { class: "detalle" });
    cont.append(h("dl", {}, pares([
        ["Sub área", r.subArea], ["Proceso", r.proceso], ["Actividad", r.actividad], ["Tareas", r.tareas],
        ["Tipo de actividad", r.tipoActividad],
        ["Modo de ocurrencia", (r.modoOcurrencia?.texto || "") + (r.modoOcurrencia?.asistidoIA ? "\n✨ Descripción asistida por IA" : "")],
        ["Observaciones", r.observaciones],
        ["Creado", `${formatoFecha(r.fechaCreacion)}${r.usuarioCreador ? ` por ${r.usuarioCreador}` : ""}`],
        ["Actualizado", `${formatoFecha(r.fechaActualizacion)}${r.usuarioModificacion ? ` por ${r.usuarioModificacion}` : ""}`],
        ["Sincronización", estadoSync(r)]
    ])));
    (r.peligros || []).forEach((p, i) => {
        const ev = p.evaluacionInicial || {};
        const ctrl = cat => {
            const ex = (p.controlesExistentes || []).filter(c => c.categoria === cat).map(c => `• (Existente) ${c.control}`);
            const ad = (p.controlesSTOP?.[cat] || []).map(c => `• [${c.estado}] ${c.control}${c.origen === "IA" ? " (IA)" : ""}${c.responsable ? ` — Resp.: ${c.responsable}` : ""}${c.fechaObjetivo ? ` — ${c.fechaObjetivo}` : ""}`);
            return [...ex, ...ad].join("\n") || "Sin controles";
        };
        cont.append(h("section", { class: "revision__peligro", style: i === peligroIdx ? "border-color: var(--azul); border-width: 2px;" : null },
            h("h3", {}, descripcionPeligro(p, i)),
            h("dl", {}, pares([
                ["Daño", p.dano], ["Norma principal", p.normaPrincipal], ["Criterio de aplicación", p.criterioAplicacion],
                ["Normas complementarias", p.normasComplementarias || "No especificadas"],
                ["Severidad", ev.severidad ? `${ev.severidad.nombre} (${ev.severidad.codigo}) — Valor S: ${ev.severidad.valor}` : ""],
                ["Frecuencia", ev.frecuencia ? `${ev.frecuencia.nombre} (${ev.frecuencia.codigo}) — Valor F: ${ev.frecuencia.valor}` : ""],
                ["NRI", ev.nri], ["Nivel de riesgo inicial", etiquetaNivel(ev.nivelRiesgo)],
                ...Object.entries(CATEGORIAS_STOP).map(([k, v]) => [`${k} — ${v.nombre}`, ctrl(k)])
            ]))));
    });
    if ((r.fotografias || []).length) {
        const fotos = h("div", { class: "detalle__fotos" });
        for (const f of r.fotografias) {
            const u = await urlFotoLocal(f.id);
            if (u) fotos.append(h("img", { src: u, alt: f.nombreOriginal }));
            else if (f.url) fotos.append(h("a", { href: f.url, target: "_blank", rel: "noopener noreferrer", class: "btn btn--fantasma btn--compacto" }, `☁ ${f.nombreOriginal}`));
        }
        cont.append(h("h3", {}, "Evidencia fotográfica"), fotos);
    }
    return cont;
}

async function eliminarDesdeMatriz(id, peligroIdx) {
    const r = await dataService.obtener(id);
    if (!r) return;
    let accion;
    if (r.peligros.length > 1) {
        accion = await abrirModal({
            titulo: "Eliminar",
            cuerpo: h("p", {}, `La actividad “${r.actividad}” tiene ${r.peligros.length} peligros. ¿Qué desea eliminar?`),
            acciones: [
                { texto: "Cancelar", valor: null },
                { texto: "Solo este peligro", clase: "btn--secundario", valor: "peligro" },
                { texto: "Registro completo", clase: "btn--peligro", valor: "registro" }
            ]
        });
        if (accion === "registro" && !(await confirmar("¿Desea eliminar este registro de la matriz?", { textoAceptar: "Eliminar", peligro: true }))) return;
    } else {
        accion = (await confirmar("¿Desea eliminar este registro de la matriz?", { textoAceptar: "Eliminar", peligro: true })) ? "registro" : null;
    }
    if (!accion) return;
    if (accion === "peligro") {
        r.peligros.splice(peligroIdx, 1);
        await dataService.actualizar(r);
        aviso("Peligro eliminado de la actividad.", "exito");
    } else {
        await dataService.eliminar(id);
        if (estado.editandoId === id) reiniciarFormulario();
        aviso("Registro eliminado.", "exito");
    }
    renderMatriz();
    if (navigator.onLine && backendConfigurado()) sincronizarUI({ silencioso: true });
}

/* =========================================================
   Exportar CSV / Imprimir
   ========================================================= */

async function exportarCSV() {
    const { filas } = await filasFiltradas();
    if (!filas.length) { aviso("No hay registros para exportar con los filtros actuales.", "alerta"); return; }
    // Reagrupar por registro conservando solo los peligros filtrados.
    const porRegistro = new Map();
    for (const f of filas) {
        if (!porRegistro.has(f.registro.id)) porRegistro.set(f.registro.id, { ...f.registro, peligros: [] });
        porRegistro.get(f.registro.id).peligros.push(f.peligro);
    }
    const fecha = new Date().toISOString().slice(0, 10);
    descargarArchivo(generarCSV([...porRegistro.values()]), `Matriz_IPER_${fecha}.csv`);
    aviso(`CSV exportado (${filas.length} fila(s)).`, "exito");
}

async function imprimirMatriz() {
    const { filas } = await filasFiltradas();
    if (!filas.length) { aviso("No hay registros para imprimir con los filtros actuales.", "alerta"); return; }
    const area = vaciar($("#area-impresion"));
    area.append(
        h("h1", {}, "Matriz de Identificación de Peligros y Evaluación de Riesgos"),
        h("p", { class: "impresion__meta" }, `Impreso: ${formatoFecha(new Date().toISOString())} · ${filas.length} peligro(s) evaluado(s)`),
        h("p", { class: "impresion__aviso" }, "La aplicabilidad normativa deberá validarse conforme a las condiciones específicas del centro de trabajo y la normativa vigente."));
    const grupos = new Map();
    filas.forEach(f => { if (!grupos.has(f.registro.id)) grupos.set(f.registro.id, []); grupos.get(f.registro.id).push(f); });
    const celda = (k, v) => h("div", {}, h("dt", {}, k), h("dd", {}, v instanceof Node ? v : (v || "—")));
    const cargas = [];
    for (const lista of grupos.values()) {
        const r = lista[0].registro;
        const sec = h("section", { class: "impresion__registro" },
            h("h2", {}, `${r.actividad} — ${r.subArea} / ${r.proceso}`),
            h("dl", { class: "impresion__grid" },
                celda("Tipo de actividad", r.tipoActividad), celda("Tareas", r.tareas),
                celda("Modo de ocurrencia", (r.modoOcurrencia?.texto || "") + (r.modoOcurrencia?.asistidoIA ? " (asistido por IA)" : ""))));
        for (const { peligro: p } of lista) {
            const ev = p.evaluacionInicial || {};
            const ctrl = cat => [
                ...(p.controlesExistentes || []).filter(c => c.categoria === cat).map(c => `(Existente) ${c.control}`),
                ...(p.controlesSTOP?.[cat] || []).filter(c => c.estado !== "No aplicable").map(c => `[${c.estado}] ${c.control}${c.responsable ? ` — ${c.responsable}` : ""}${c.fechaObjetivo ? ` — ${c.fechaObjetivo}` : ""}`)
            ].join("\n");
            sec.append(h("div", { class: "impresion__peligro" }, h("dl", { class: "impresion__grid" },
                celda("Peligro", `${p.tipo} — ${p.subtipo}`), celda("Daño", p.dano), celda("Norma principal", p.normaPrincipal),
                celda("Criterio", p.criterioAplicacion), celda("Normas complementarias", p.normasComplementarias || "No especificadas"),
                celda("Evaluación", ev.nri ? `S: ${ev.severidad.nombre} (${ev.severidad.codigo}, ${ev.severidad.valor}) · F: ${ev.frecuencia.nombre} (${ev.frecuencia.codigo}, ${ev.frecuencia.valor})` : ""),
                celda("NRI / Nivel", h("span", {}, `${ev.nri || "—"} `, etiquetaNivel(ev.nivelRiesgo))),
                ...Object.entries(CATEGORIAS_STOP).map(([k, v]) => celda(`${k} — ${v.nombre}`, ctrl(k))))));
        }
        if ((r.fotografias || []).length) {
            const fotos = h("div", { class: "impresion__fotos" });
            for (const f of r.fotografias) {
                const u = await urlFotoLocal(f.id);
                if (u) {
                    const img = h("img", { src: u, alt: f.nombreOriginal });
                    // decode() no resuelve en contenedores ocultos; se espera "load" con tiempo límite.
                    cargas.push(img.complete ? Promise.resolve() : new Promise(ok => {
                        img.addEventListener("load", ok, { once: true });
                        img.addEventListener("error", ok, { once: true });
                        setTimeout(ok, 3000);
                    }));
                    fotos.append(img);
                } else if (f.url) fotos.append(h("span", {}, `Evidencia: ${f.url}`));
            }
            sec.append(h("dt", {}, "Evidencia fotográfica"), fotos);
        }
        area.append(sec);
    }
    await Promise.all(cargas);
    window.print();
}

/* =========================================================
   Sincronización (UI)
   ========================================================= */

function actualizarBadgePendientes() {
    const n = dataService.pendientes().length;
    const b = $("#badge-pendientes");
    b.hidden = n === 0;
    b.textContent = String(n);
    $("#btn-sincronizar").setAttribute("aria-label", `Sincronizar${n ? `, ${n} pendiente(s)` : ""}`);
}

async function sincronizarUI({ silencioso = false } = {}) {
    if (sincronizacionEnCurso()) return;
    if (!backendConfigurado()) {
        if (!silencioso) { aviso("Configure la URL del backend para sincronizar con Google Sheets.", "alerta", 7000); abrirConfiguracion(); }
        return;
    }
    if (!navigator.onLine) { if (!silencioso) aviso("⚠ Sin conexión — los registros quedan pendientes y se sincronizarán al reconectar.", "alerta", 7000); return; }
    const btn = $("#btn-sincronizar");
    btn.classList.add("ocupado"); btn.disabled = true;
    try {
        const res = await sincronizarTodo();
        if (res.omitido) return;
        const partes = [];
        if (res.enviados) partes.push(`${res.enviados} enviado(s)`);
        if (res.eliminados) partes.push(`${res.eliminados} eliminado(s)`);
        if (res.descargados) partes.push(`${res.descargados} actualizado(s) desde Sheets`);
        if (res.borradosRemotos) partes.push(`${res.borradosRemotos} eliminado(s) en remoto`);
        if (res.errores.length) aviso(`Errores de sincronización: ${res.errores.map(e => `${e.actividad || e.id}: ${e.mensaje}`).join(" | ")}`, "error", 10000);
        if (!silencioso || partes.length) aviso(partes.length ? `Sincronizado: ${partes.join(", ")}.` : "Todo está sincronizado.", "exito");
        for (const c of res.conflictos) await resolverConflicto(c);
    } catch (e) {
        if (!silencioso) aviso(e.message, "error", 8000);
    } finally {
        btn.classList.remove("ocupado"); btn.disabled = false;
        renderMatriz();
    }
}

async function resolverConflicto({ local, remoto }) {
    const detalleRemoto = h("div", { hidden: true });
    const cuerpo = h("div", {},
        h("p", {}, h("strong", {}, "Existe una versión más reciente."), ` El registro “${local.actividad}” fue modificado en Google Sheets por otro usuario o dispositivo.`),
        h("dl", { class: "detalle" },
            h("dt", {}, "Versión local"), h("dd", {}, `${formatoFecha(local.fechaActualizacion)}${local.usuarioModificacion ? ` — ${local.usuarioModificacion}` : ""}`),
            h("dt", {}, "Versión remota"), h("dd", {}, `${formatoFecha(remoto.fechaActualizacion)}${remoto.usuarioModificacion ? ` — ${remoto.usuarioModificacion}` : ""} (v${remoto.version})`)),
        detalleRemoto);
    const v = await abrirModal({
        titulo: "Conflicto de sincronización",
        cuerpo,
        acciones: [
            {
                texto: "Ver versión remota", clase: "btn--fantasma",
                onClick: async () => {
                    if (detalleRemoto.hidden && !detalleRemoto.childNodes.length) detalleRemoto.append(h("h3", {}, "Versión remota"), await construirDetalle(remoto));
                    detalleRemoto.hidden = !detalleRemoto.hidden;
                    return false;
                }
            },
            { texto: "Conservar versión local", clase: "btn--secundario", valor: "local" },
            { texto: "Usar versión remota", clase: "btn--primario", valor: "remota" }
        ]
    });
    try {
        if (v === "local") {
            const r = await conservarVersionLocal(local, remoto);
            aviso(r.resultado === "ok" ? "Se conservó la versión local y se envió a Sheets." : "No se pudo resolver el conflicto.", r.resultado === "ok" ? "exito" : "error");
        } else if (v === "remota") {
            usarVersionRemota(remoto);
            if (estado.editandoId === remoto.id) aviso("El registro que está editando fue reemplazado por la versión remota; recárguelo desde la matriz.", "alerta", 9000);
            else aviso("Se usó la versión remota.", "exito");
        } else {
            aviso("Conflicto pendiente: se volverá a preguntar en la próxima sincronización.", "alerta");
        }
    } catch (e) { aviso(e.message, "error", 8000); }
}

/* =========================================================
   Configuración
   ========================================================= */

async function abrirConfiguracion() {
    const cfg = obtenerConfig();
    const val = validarMatrizRiesgos();
    const campo = (id, etiqueta, input, ayuda) => h("div", { class: "campo campo--ancho" }, h("label", { for: id }, etiqueta), input, ayuda ? h("p", { class: "ayuda" }, ayuda) : null);
    const iUrl = h("input", { id: "cfg-url", type: "url", value: cfg.backendUrl, placeholder: "https://script.google.com/macros/s/…/exec", inputmode: "url", autocomplete: "off" });
    const iClave = h("input", { id: "cfg-clave", type: "password", value: cfg.claveAcceso, autocomplete: "off" });
    const iUsuario = h("input", { id: "cfg-usuario", type: "text", value: cfg.usuario, maxlength: 120, autocomplete: "name" });
    const iMax = h("input", { id: "cfg-max", type: "number", min: 1, max: 50, step: 1, value: cfg.maxFotoMB });
    const iAuto = h("input", { id: "cfg-auto", type: "checkbox", checked: cfg.sincronizarAlGuardar, style: "width:24px;height:24px;min-height:24px" });
    const resultado = h("p", { class: "ayuda", "aria-live": "polite" });
    const cuerpo = h("div", { class: "rejilla-campos" },
        campo("cfg-url", "URL del backend (Google Apps Script Web App)", iUrl, "Se obtiene al desplegar google-apps-script/ como aplicación web. No es un secreto."),
        campo("cfg-clave", "Código de acceso", iClave, "Definido por el administrador en la propiedad APP_ACCESS_KEY del script. Se guarda solo en este dispositivo."),
        campo("cfg-usuario", "Nombre de usuario", iUsuario, "Se registra como usuario creador / última modificación."),
        campo("cfg-max", "Tamaño máximo por fotografía (MB)", iMax),
        h("div", { class: "campo campo--ancho" }, h("label", { for: "cfg-auto", style: "display:flex;gap:.5rem;align-items:center" }, iAuto, "Sincronizar automáticamente al guardar")),
        h("div", { class: "campo campo--ancho" },
            h("p", { class: "ayuda" }, `Validación de la matriz de riesgo: ${val.valida ? `✔ correcta (${val.total} combinaciones A1–E5)` : `✖ ${val.errores.join(" ")}`}`),
            h("p", { class: "ayuda" }, `Versión ${VERSION_APP} · Registros locales: ${leerTodosLocales().length}`)),
        resultado);
    const leer = () => ({ backendUrl: iUrl.value.trim(), claveAcceso: iClave.value, usuario: iUsuario.value.trim(), maxFotoMB: iMax.value, sincronizarAlGuardar: iAuto.checked });
    await abrirModal({
        titulo: "Configuración",
        cuerpo,
        acciones: [
            {
                texto: "Respaldo JSON", clase: "btn--fantasma",
                onClick: () => {
                    descargarArchivo(JSON.stringify(leerTodosLocales(), null, 2), `Respaldo_Matriz_IPER_${new Date().toISOString().slice(0, 10)}.json`, "application/json");
                    return false;
                }
            },
            {
                texto: "Probar conexión", clase: "btn--secundario",
                onClick: async () => {
                    if (leer().backendUrl && !/^https:\/\//.test(leer().backendUrl)) { resultado.textContent = "La URL debe iniciar con https://"; return false; }
                    guardarConfig(leer());
                    resultado.textContent = "Probando conexión…";
                    try {
                        const r = await probarConexion();
                        resultado.textContent = `✔ Conexión correcta. Hoja: ${r.hoja || "Matriz_IPER"} · IA: ${r.iaConfigurada ? "configurada" : "NO configurada"} · Drive: ${r.carpeta || "Evidencias_Matriz_IPER"}`;
                    } catch (e) { resultado.textContent = `✖ ${e.message}`; }
                    return false;
                }
            },
            {
                texto: "Guardar", clase: "btn--primario",
                onClick: () => {
                    if (leer().backendUrl && !/^https:\/\//.test(leer().backendUrl)) { resultado.textContent = "La URL debe iniciar con https://"; return false; }
                    guardarConfig(leer());
                    aviso("Configuración guardada.", "exito");
                    $("#limite-foto").textContent = `${obtenerConfig().maxFotoMB} MB`;
                }
            }
        ]
    });
}

/* =========================================================
   Conexión y PWA
   ========================================================= */

function actualizarEstadoConexion() {
    const el = $("#estado-conexion");
    const enLinea = navigator.onLine;
    el.textContent = enLinea ? "🟢 En línea" : "⚠ Sin conexión — trabajando localmente";
    el.classList.toggle("offline", !enLinea);
}

function registrarServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    const seguro = location.protocol === "https:" || ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
    if (!seguro) return;
    navigator.serviceWorker.register("./service-worker.js").then(reg => {
        reg.addEventListener("updatefound", () => {
            const nuevo = reg.installing;
            nuevo?.addEventListener("statechange", () => {
                if (nuevo.state === "installed" && navigator.serviceWorker.controller) {
                    aviso("Hay una nueva versión disponible. Recargue la página para actualizar.", "info", 10000);
                }
            });
        });
    }).catch(() => aviso("No se pudo activar el modo sin conexión en este navegador.", "alerta"));
}

/* =========================================================
   Arranque
   ========================================================= */

function iniciar() {
    const val = validarMatrizRiesgos();
    if (!val.valida) aviso(`Error en la configuración de la matriz de riesgo: ${val.errores.join(" ")}`, "error", 15000);
    construirEstructuraEstatica();
    enlazarEventos();
    renderFormularioCompleto();
    irAPaso(1, { enfocar: false });
    revisarBorrador();
    actualizarEstadoConexion();
    renderMatriz();
    registrarServiceWorker();
    if (navigator.onLine && backendConfigurado()) sincronizarUI({ silencioso: true });
}

iniciar();

// Exposición mínima para pruebas automatizadas (sin datos sensibles).
window.__IPER__ = { validarRegistro: r => validarRegistro(normalizarRegistro(r)), estado };
