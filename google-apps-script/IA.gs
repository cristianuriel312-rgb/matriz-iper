/**
 * Servicio de IA (servidor). Proveedor: API de Claude (Anthropic) — Messages API vía UrlFetchApp.
 * La API key se lee de la Propiedad del Script ANTHROPIC_API_KEY; nunca se envía al navegador.
 *
 * Para cambiar de proveedor, reemplace únicamente llamarProveedorIA_(): el resto del sistema
 * (frontend incluido) solo depende de {tipoSolicitud, contexto, imagenes} → objeto JSON.
 */

var IA_URL = 'https://api.anthropic.com/v1/messages';
var IA_MODELO_PREDETERMINADO = 'claude-opus-5-5';
var IA_MAX_IMAGENES = 3;
var IA_MAX_BYTES_IMAGEN = 5 * 1024 * 1024;

var REGLAS_GENERALES = [
  'Eres un asistente para matrices IPER (Identificación de Peligros y Evaluación de Riesgos) en centros de trabajo de México.',
  'Tu función es asistir: las decisiones finales sobre peligro, daño, severidad, frecuencia, controles, implementación y riesgo residual son del usuario.',
  'Usa únicamente la información proporcionada en el contexto y, cuando existan, en las imágenes.',
  'No inventes sustancias, equipos, herramientas, alturas, energías, concentraciones, voltajes, temperaturas, presiones, normas, requisitos legales ni controles existentes.',
  'Si falta información, redacta de forma neutral o indícalo como información por confirmar.',
  'Escribe en español de México, con terminología técnica de seguridad y salud en el trabajo.',
  'Responde ÚNICAMENTE con un objeto JSON válido, sin texto adicional, sin bloques de código y sin comentarios.'
].join('\n');

var PROMPTS_IA = {
  MEJORAR_MODO_OCURRENCIA: {
    esfuerzo: 'low',
    sistema: [
      'Actúa como especialista en análisis de tareas y seguridad industrial que redacta matrices IPER para auditorías.',
      'Reescribe el modo de ocurrencia como una descripción técnica, cronológica y orientada a la identificación de peligros, usando ÚNICAMENTE los hechos del contexto (actividad, tareas, modo de ocurrencia, peligro y hallazgos visuales confirmados).',
      '',
      'ESTRUCTURA (de 3 a 5 párrafos, sin viñetas, sin títulos, sin numeración):',
      '1. Lugar y propósito: dónde se realiza la tarea y sobre qué equipo o componente se interviene (si no se indica el lugar, omítelo; no lo inventes).',
      '2. Preparación: condiciones previas y medidas que el usuario SÍ mencionó (por ejemplo, bloqueos aplicados), indicando sobre qué fuentes se aplican.',
      '3. Ejecución paso a paso: cada acción en orden, con el verbo preciso (retirar, desenroscar, extraer, levantar, sujetar, limpiar), la herramienta indicada y la interacción del trabajador con el equipo.',
      '   En cada paso donde razonablemente pueda presentarse un peligro, descríbelo en el mismo punto con redacción condicional ("durante el desenroscado puede presentarse...") y menciona las partes del cuerpo expuestas (manos, dedos, antebrazos, espalda, ojos, vías respiratorias) solo cuando se deduzca de la acción descrita.',
      '4. Cierre: cómo concluye la actividad (reinstalación, retiro de herramientas y residuos) y qué condiciones deben verificarse antes de retirar los bloqueos y restablecer el equipo (personal fuera del punto de intervención, componentes asegurados). Si el usuario no describió el cierre, redáctalo de forma neutral sin inventar pasos específicos.',
      '',
      'ESTILO:',
      '- Tercera persona impersonal y tiempo presente ("se retira", "se aplica"). Nunca primera persona ("dándome", "retiro").',
      '- Ortografía y acentuación impecables en español de México. Corrige errores evidentes del texto original (por ejemplo "su ministro de aire" → "suministro de aire").',
      '- Desarrolla las abreviaturas que el usuario escribió, la primera vez: HMI → interfaz hombre-máquina (HMI); LOTOTO → bloqueo, etiquetado y candadeo (LOTOTO).',
      '- Respeta el alcance exacto de lo dicho: si el usuario escribe "bloqueo", escribe "bloqueo" (no lo conviertas en LOTOTO ni agregues etiquetado, candadeo o verificación de energía cero). No agregues acciones que no describió (por ejemplo, "colocar la tapa en posición segura").',
      '- Lenguaje preciso y sobrio, propio de un documento técnico; no repitas ideas ni uses relleno.',
      '',
      'PROHIBIDO: inventar equipos, sustancias, energías, alturas, herramientas, concentraciones, pesos, presiones, temperaturas, normas o medidas de control. No agregues EPP, permisos ni controles que el usuario no mencionó.',
      'Si el texto original es muy breve, no lo alargues con suposiciones: mejora redacción, orden y precisión, y señala los momentos de exposición que sí se desprenden de lo descrito.',
      '',
      'EJEMPLO DE NIVEL DE REDACCIÓN ESPERADO (solo como referencia de estilo; NO copies su contenido si no corresponde al escenario):',
      '"La actividad se realiza desde la plataforma de mezzanine para intervenir los filtros de los Hoppers que contienen o han contenido persulfatos de sodio, amonio y potasio, así como metasilicato de sodio.',
      'Antes de iniciar, se detiene el sistema y se aplica LOTOTO sobre las fuentes de energía aplicables, incluyendo el suministro neumático, HMI e interruptores asociados a los solenoides, asegurando una condición segura para la intervención.',
      'Una vez verificada la condición segura, con herramienta manual se retira la tornillería y la tapa del Hopper, colocándola en una posición estable. Posteriormente, los filtros se extraen manualmente mediante movimientos de agarre, jalón, levantamiento y desplazamiento.',
      'Los filtros se limpian en seco con cepillo plástico, retirando el producto adherido. Durante el cepillado puede generarse y dispersarse polvo de persulfatos y metasilicato hacia la zona respiratoria, ojos, rostro, manos, ropa y superficies de trabajo.',
      'Finalizada la limpieza, los filtros se reinstalan, se coloca la tapa y se ajusta la tornillería. Se retiran herramientas y residuos, se verifica el cierre del Hopper y que el personal se encuentre fuera del punto de intervención antes de retirar de forma controlada el LOTOTO y restablecer el equipo."',
      '',
      'Antes de responder, revisa que: cada hecho provenga del contexto, no haya errores ortográficos y no haya primera persona.',
      'Formato de salida: {"texto": "<descripción mejorada, párrafos separados con \\n\\n>"}'
    ].join('\n')
  },
  SUGERIR_CONTROLES_STOP: {
    esfuerzo: 'low',
    sistema: [
      'Actúa como especialista en controles de riesgo ocupacional.',
      'Genera controles bajo la metodología STOP: S = Eliminación / Sustitución; T = Ingeniería / Diseño; O = Controles Administrativos; P = Equipo de Protección Personal.',
      'Prioriza S y T antes de O y P. No llenes una categoría si no aplica: es válido omitirla.',
      'Cada control debe ser específico, concreto y verificable, ligado al peligro, daño y modo de ocurrencia descritos.',
      'Evita recomendaciones genéricas como "tener cuidado", "usar EPP", "trabajar seguro" o "capacitar" sin especificar qué, cómo y a quién.',
      'Para EPP indica el tipo de protección conforme al peligro y que su selección debe basarse en la evaluación correspondiente; no inventes especificaciones.',
      'No asumas que algún control existe; todos son propuestos hasta que el usuario los confirme. No repitas controles ya registrados.',
      'No inventes requisitos legales. Puedes referir la norma principal o complementarias solo si vienen en el contexto.',
      'Formato de salida: {"controles": [{"categoria": "S|T|O|P", "control": "...", "justificacion": "..."}], "notas": "<supuestos o información por confirmar, opcional>"}'
    ].join('\n')
  },
  ANALIZAR_FOTOGRAFIA: {
    esfuerzo: 'medium',
    sistema: [
      'Actúa como especialista en identificación visual de peligros ocupacionales.',
      'Analiza la fotografía junto con el contexto. Describe únicamente condiciones visibles: maquinaria, equipos, partes móviles, guardas, barreras, escaleras, plataformas,',
      'desniveles, derrames, obstáculos, vehículos, tuberías, materiales almacenados, equipos eléctricos visibles, condiciones locativas, orden y limpieza, EPP visible.',
      'Separa observación (lo que se ve), interpretación (justificación) y peligro sugerido.',
      'No determines ruido, concentración química, voltaje, presión, temperatura, contenido de recipientes, estado de energización ni cumplimiento normativo definitivo sin evidencia suficiente;',
      'en esos casos usa redacción condicional, p. ej.: "Se observa maquinaria que podría constituir una fuente de ruido; confirmar mediante evaluación correspondiente."',
      'No agregues peligros automáticamente: solo sugiere. Para posiblePeligro, subtipoSugerido y danoSugerido usa EXACTAMENTE valores del catálogo incluido en el contexto (tipo → subtipo → daños); si ninguno aplica, deja la cadena vacía.',
      'confianza debe ser "Alta", "Media" o "Baja".',
      'Formato de salida: {"resumen": "...", "hallazgos": [{"observacion": "...", "confianza": "Alta|Media|Baja", "posiblePeligro": "<TIPO del catálogo>", "subtipoSugerido": "...", "danoSugerido": "...", "justificacion": "..."}], "limitaciones": "..."}'
    ].join('\n')
  },
  ANALIZAR_ACTIVIDAD_COMPLETA: {
    esfuerzo: 'medium',
    sistema: [
      'Actúa como especialista en análisis de riesgos ocupacionales y revisa de forma integral la actividad capturada (actividad, tareas, modo de ocurrencia, peligros, evaluación, fotografías, hallazgos confirmados y controles existentes).',
      'Evalúa la calidad de la descripción, identifica información faltante, describe hallazgos visuales (solo lo visible), propone peligros potenciales no registrados,',
      'formula preguntas por confirmar (p. ej. "¿El equipo permanece energizado durante la tarea?", "¿La actividad se realiza por encima de 1.80 m?") sin asumir respuestas,',
      'y sugiere controles STOP específicos priorizando S y T. Para peligros potenciales usa EXACTAMENTE valores del catálogo del contexto.',
      'No modifiques severidad, frecuencia ni riesgo residual; no los propongas como decisiones.',
      'Formato de salida: {"calidadDescripcion": {"valoracion": "Adecuada|Mejorable|Insuficiente", "comentarios": "..."}, "informacionFaltante": ["..."], "hallazgosVisuales": ["..."],',
      '"peligrosPotenciales": [{"tipo": "...", "subtipo": "...", "dano": "...", "justificacion": "..."}], "preguntasPorConfirmar": ["..."],',
      '"controlesSugeridos": [{"categoria": "S|T|O|P", "control": "...", "justificacion": "..."}]}'
    ].join('\n')
  }
};

function solicitarIA_(tipoSolicitud, contexto, imagenes) {
  var def = PROMPTS_IA[tipoSolicitud];
  if (!def) throw new Error('Tipo de solicitud de IA no soportado.');
  if (!proveedorIA_()) throw new Error('La IA no está configurada en el backend: agregue GEMINI_API_KEY (gratuita, aistudio.google.com) en Propiedades del script.');

  var contenido = [];
  (imagenes || []).slice(0, IA_MAX_IMAGENES).forEach(function (img) {
    var mime = String(img.mimeType || '').toLowerCase();
    if (['image/jpeg', 'image/png', 'image/webp'].indexOf(mime) < 0) return;
    var b64 = String(img.base64 || '');
    if (!b64 || b64.length * 0.75 > IA_MAX_BYTES_IMAGEN) return;
    contenido.push({ type: 'image', source: { type: 'base64', media_type: mime, data: b64 } });
  });
  if (tipoSolicitud === 'ANALIZAR_FOTOGRAFIA' && !contenido.length) throw new Error('No se recibió una imagen válida para analizar.');

  contenido.push({
    type: 'text',
    text: 'Contexto capturado por el usuario (JSON):\n' + JSON.stringify(contexto, null, 1) +
      '\n\nResponde solo con el objeto JSON solicitado.'
  });

  var texto = llamarProveedorIA_(REGLAS_GENERALES + '\n\n' + def.sistema, contenido, def.esfuerzo);
  return extraerJson_(texto);
}

/**
 * Proveedor activo: AI_PROVIDER ("gemini" | "anthropic") si se define; si no, Gemini cuando existe
 * GEMINI_API_KEY (nivel gratuito) y Anthropic cuando existe ANTHROPIC_API_KEY.
 */
function proveedorIA_() {
  var forzado = prop_('AI_PROVIDER').toLowerCase();
  if (forzado === 'gemini' && prop_('GEMINI_API_KEY')) return 'gemini';
  if (forzado === 'anthropic' && prop_('ANTHROPIC_API_KEY')) return 'anthropic';
  if (prop_('GEMINI_API_KEY')) return 'gemini';
  if (prop_('ANTHROPIC_API_KEY')) return 'anthropic';
  return '';
}

/** Despacha al proveedor activo. contenido usa bloques {type:'image'|'text'} y se adapta para cada API. */
function llamarProveedorIA_(sistema, contenido, esfuerzo) {
  return proveedorIA_() === 'gemini' ? llamarGemini_(sistema, contenido) : llamarClaude_(sistema, contenido, esfuerzo);
}

/* ---------- Google Gemini (API gratuita de Google AI Studio) ---------- */

var GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/';
// Si el modelo configurado no existe se prueba el siguiente (los nombres de Gemini cambian con nuevas versiones).
// También se usan como respaldo cuando un modelo está saturado (HTTP 503/500).
var GEMINI_MODELOS = ['gemini-flash-latest', 'gemini-2.5-flash', 'gemini-flash-lite-latest', 'gemini-2.5-flash-lite'];

var ultimoModeloGemini_ = '';

function modelosGemini_() {
  var configurado = prop_('GEMINI_MODEL');
  return configurado ? [configurado].concat(GEMINI_MODELOS) : GEMINI_MODELOS;
}

function llamarGemini_(sistema, contenido) {
  var partes = contenido.map(function (b) {
    return b.type === 'image'
      ? { inline_data: { mime_type: b.source.media_type, data: b.source.data } }
      : { text: b.text };
  });
  var cuerpo = {
    systemInstruction: { parts: [{ text: sistema }] },
    contents: [{ role: 'user', parts: partes }],
    generationConfig: { responseMimeType: 'application/json', temperature: 0.3, maxOutputTokens: 8192 }
  };
  var modelos = modelosGemini_();
  var ultimoError = '';
  var saturados = 0, limitados = 0;
  for (var i = 0; i < modelos.length; i++) {
    if (i > 0 && modelos.indexOf(modelos[i]) < i) continue; // modelo repetido (GEMINI_MODEL ya en la lista)
    var resp = null, codigo = 0, datos = null, detalle = '';
    // Hasta 2 intentos por modelo cuando está saturado; luego se prueba el siguiente modelo.
    for (var intento = 0; intento < 2; intento++) {
      resp = UrlFetchApp.fetch(GEMINI_URL + encodeURIComponent(modelos[i]) + ':generateContent', {
        method: 'post',
        contentType: 'application/json',
        headers: { 'x-goog-api-key': prop_('GEMINI_API_KEY') },
        payload: JSON.stringify(cuerpo),
        muteHttpExceptions: true
      });
      codigo = resp.getResponseCode();
      try { datos = JSON.parse(resp.getContentText()); } catch (e) { datos = null; }
      detalle = datos && datos.error && datos.error.message ? datos.error.message : 'sin detalle';
      if (codigo !== 503 && codigo !== 500) break;
      if (intento === 0) Utilities.sleep(1500);
    }
    if (codigo === 404) { ultimoError = detalle; continue; } // modelo no disponible: probar el siguiente
    if (codigo === 503 || codigo === 500) { saturados++; ultimoError = detalle; continue; } // saturado: probar otro modelo
    if (codigo === 429) { limitados++; ultimoError = detalle; continue; } // cuota del modelo agotada: cada modelo tiene su propia cuota
    if (codigo === 400 && /API key not valid|API_KEY_INVALID/i.test(detalle)) throw new Error('La API key de Gemini no es válida. Revise GEMINI_API_KEY en Propiedades del script.');
    if (codigo === 403) throw new Error('La API key de Gemini no tiene permiso (¿API deshabilitada o clave restringida?): ' + detalle);
    if (codigo !== 200 || !datos) throw new Error('Error de Gemini (HTTP ' + codigo + '): ' + detalle);
    if (datos.promptFeedback && datos.promptFeedback.blockReason) throw new Error('Gemini bloqueó la solicitud (' + datos.promptFeedback.blockReason + '). Reformule e intente de nuevo.');
    var cand = (datos.candidates || [])[0];
    if (!cand) throw new Error('Gemini no devolvió respuesta.');
    if (cand.finishReason === 'MAX_TOKENS') throw new Error('La respuesta de IA quedó incompleta. Reduzca el contexto e intente de nuevo.');
    if (cand.finishReason === 'SAFETY') throw new Error('Gemini bloqueó la respuesta por seguridad. Reformule e intente de nuevo.');
    var texto = ((cand.content && cand.content.parts) || []).filter(function (p) { return p.text && !p.thought; })
      .map(function (p) { return p.text; }).join('');
    if (!texto) throw new Error('Gemini no devolvió contenido.');
    ultimoModeloGemini_ = modelos[i];
    return texto;
  }
  if (limitados && !saturados) throw new Error('Se alcanzó el límite gratuito de Gemini en todos los modelos. Espere un minuto (o hasta mañana si es el límite diario) e intente de nuevo.');
  if (saturados) throw new Error('Los servidores gratuitos de Gemini están saturados en este momento. Intente de nuevo en uno o dos minutos.');
  throw new Error('Ningún modelo de Gemini disponible (' + modelos.join(', ') + '): ' + ultimoError);
}

/* ---------- Anthropic Claude (API de pago) ---------- */

/** Llamada HTTP a la Messages API de Claude. */
function llamarClaude_(sistema, contenido, esfuerzo) {
  var cuerpo = {
    model: prop_('AI_MODEL') || IA_MODELO_PREDETERMINADO,
    max_tokens: 8000,
    system: sistema,
    messages: [{ role: 'user', content: contenido }],
    output_config: { effort: esfuerzo || 'medium' },
    // Si el modelo declina por política de seguridad, el servidor reintenta con el modelo de respaldo recomendado.
    fallbacks: 'default'
  };
  var resp = UrlFetchApp.fetch(IA_URL, {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'x-api-key': prop_('ANTHROPIC_API_KEY'),
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'server-side-fallback-2026-07-01'
    },
    payload: JSON.stringify(cuerpo),
    muteHttpExceptions: true
  });
  var codigo = resp.getResponseCode();
  var datos;
  try { datos = JSON.parse(resp.getContentText()); } catch (e) { datos = null; }
  if (codigo !== 200 || !datos) {
    var detalle = datos && datos.error && datos.error.message ? datos.error.message : 'sin detalle';
    if (codigo === 401) throw new Error('La API key de IA configurada en el backend no es válida. Revise ANTHROPIC_API_KEY en Propiedades del script (debe iniciar con sk-ant-).');
    if (codigo === 402 || /credit balance/i.test(detalle)) throw new Error('La cuenta de IA no tiene saldo disponible. Agregue créditos en console.anthropic.com → Billing.');
    if (codigo === 429 || codigo === 529) throw new Error('El servicio de IA está saturado. Intente de nuevo en unos momentos.');
    throw new Error('Error del proveedor de IA (HTTP ' + codigo + '): ' + detalle);
  }
  if (datos.stop_reason === 'refusal') throw new Error('El proveedor de IA declinó esta solicitud. Reformule la información e intente de nuevo.');
  if (datos.stop_reason === 'max_tokens') throw new Error('La respuesta de IA quedó incompleta. Reduzca el contexto e intente de nuevo.');
  var texto = (datos.content || []).filter(function (b) { return b.type === 'text'; })
    .map(function (b) { return b.text; }).join('');
  if (!texto) throw new Error('La IA no devolvió contenido.');
  return texto;
}

/** Extrae el primer objeto JSON del texto (tolera bloques ```json). */
function extraerJson_(texto) {
  var limpio = String(texto).replace(/```(?:json)?/gi, '').trim();
  var ini = limpio.indexOf('{');
  var fin = limpio.lastIndexOf('}');
  if (ini < 0 || fin <= ini) throw new Error('La respuesta de IA no tiene el formato esperado.');
  try { return JSON.parse(limpio.substring(ini, fin + 1)); }
  catch (e) { throw new Error('La respuesta de IA no es JSON válido.'); }
}

/** Prueba manual desde el editor de Apps Script. */
function probarIA() {
  var r = solicitarIA_('MEJORAR_MODO_OCURRENCIA', {
    actividad: 'Limpieza de filtros', modoOcurrencia: 'Se abre la tapa, se sacan los filtros y se limpian con cepillo.'
  }, []);
  console.log(JSON.stringify(r, null, 2));
}
