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
      'Actúa como especialista en análisis de tareas y seguridad industrial.',
      'Mejora la descripción del modo de ocurrencia usando únicamente la información proporcionada.',
      'Organiza cronológicamente: dónde ocurre la tarea, cómo inicia, qué se interviene, qué pasos se realizan, qué interacción existe,',
      'qué herramientas y materiales participan (solo si fueron indicados), en qué punto se presenta el peligro, cómo ocurre la exposición,',
      'qué partes del cuerpo pueden estar expuestas cuando sea razonable, cómo concluye la actividad y qué condiciones deben verificarse antes de restablecer el proceso.',
      'Describe en qué momento se presenta el peligro.',
      'No inventes: equipos, sustancias, energías, alturas, herramientas, concentraciones, normativa ni medidas existentes.',
      'No agregues bloqueo/etiquetado (LOTOTO), EPP ni otros controles si el usuario no los mencionó.',
      'Si falta información, redacta de forma neutral. Usa párrafos claros, sin viñetas ni títulos.',
      'Formato de salida: {"texto": "<descripción mejorada>"}'
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
  if (!prop_('ANTHROPIC_API_KEY')) throw new Error('La IA no está configurada en el backend (falta ANTHROPIC_API_KEY en Propiedades del script).');

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

/** Llamada HTTP a la Messages API de Claude. */
function llamarProveedorIA_(sistema, contenido, esfuerzo) {
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
