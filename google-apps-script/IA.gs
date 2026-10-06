/**
 * Servicio de IA (servidor). Proveedores: Google Gemini (API gratuita, GEMINI_API_KEY) o
 * Claude de Anthropic (ANTHROPIC_API_KEY). Las claves viven en Propiedades del script; nunca llegan al navegador.
 * El frontend solo depende de {tipoSolicitud, contexto, imagenes} -> objeto JSON.
 */

var IA_URL = 'https://api.anthropic.com/v1/messages';
var IA_MODELO_PREDETERMINADO = 'claude-opus-5-5';
/**
 * Modelos que el usuario puede elegir desde la app (⚙ Configuración → Modelo de IA).
 * Solo se aceptan estos identificadores; cualquier otro valor usa la selección automática.
 * Precios de referencia por millón de tokens (entrada / salida), Claude API, sep-2026.
 */
var MODELOS_IA = {
  'gemini':            { proveedor: 'gemini',    nombre: 'Gemini Flash (gratis)' },
  'claude-haiku-4-5':  { proveedor: 'anthropic', nombre: 'Claude Haiku 4.5 (1 / 5 USD)' },
  'claude-sonnet-5-5': { proveedor: 'anthropic', nombre: 'Claude Sonnet 5.5 (2 / 10 USD)' },
  'claude-opus-5-5':   { proveedor: 'anthropic', nombre: 'Claude Opus 5.5 (4 / 20 USD)' }
};

/** Resuelve {proveedor, modelo} a partir del modelo pedido por la app o de la configuración del servidor. */
function resolverModeloIA_(modeloPedido) {
  var def = MODELOS_IA[String(modeloPedido || '')];
  if (def) {
    var clave = def.proveedor === 'gemini' ? 'GEMINI_API_KEY' : 'ANTHROPIC_API_KEY';
    if (!prop_(clave)) {
      throw new Error(def.proveedor === 'gemini'
        ? 'Gemini no está configurado en el backend (falta GEMINI_API_KEY). Elija otro modelo en ⚙ Configuración.'
        : 'Claude no está configurado en el backend (falta ANTHROPIC_API_KEY). Elija "Automático" o Gemini en ⚙ Configuración.');
    }
    return { proveedor: def.proveedor, modelo: def.proveedor === 'gemini' ? '' : modeloPedido };
  }
  var proveedor = proveedorIA_();
  return { proveedor: proveedor, modelo: proveedor === 'anthropic' ? (prop_('AI_MODEL') || IA_MODELO_PREDETERMINADO) : '' };
}

/** Disponibilidad por proveedor (para que la app muestre qué modelos se pueden usar). */
function proveedoresDisponibles_() {
  return { gemini: Boolean(prop_('GEMINI_API_KEY')), anthropic: Boolean(prop_('ANTHROPIC_API_KEY')), automatico: proveedorIA_() || 'ninguno' };
}

var ultimoModeloUsado_ = '';

var IA_MAX_IMAGENES = 3;
var IA_MAX_BYTES_IMAGEN = 5 * 1024 * 1024;

/* =====================================================================
   REGLAS COMPARTIDAS (aplican a todas las solicitudes de IA)
   ===================================================================== */

var REGLAS_GENERALES = [
  'Eres un especialista SHE (Seguridad, Salud y Medio Ambiente) que asiste en matrices IPER (Identificación de Peligros y Evaluación de Riesgos) para centros de trabajo en México.',
  'Tu función es asistir: las decisiones finales sobre peligro, daño, severidad, frecuencia, controles, implementación y riesgo residual son del usuario.',
  'Usa únicamente la información del contexto y, cuando existan, de las imágenes. Analiza el proceso completo, no palabras aisladas.',
  '',
  'MODO DE OPERACIÓN PRO (interno): antes de responder realiza internamente cinco etapas: 1) comprensión del proceso, 2) reconstrucción física de la tarea,',
  '3) identificación técnica de peligros, 4) diseño jerárquico de controles, 5) validación SHE final. No muestres razonamientos internos; entrega solo el resultado profesional.',
  '',
  'INFORMACIÓN QUE NUNCA SE INVENTA: pesos, temperaturas, voltajes, presiones, alturas, distancias, velocidades, concentraciones, capacidades, dimensiones, frecuencias,',
  'tiempos, niveles de ruido, propiedades químicas, clasificaciones eléctricas, límites de exposición, datos de HDS, características del equipo, sustancias, equipos,',
  'herramientas, normas, requisitos legales ni controles existentes. Cuando falte información trabaja cualitativa y condicionalmente, sin crear valores',
  '(p. ej.: "Si el material presenta características de polvo combustible...", "Cuando la evaluación de exposición determine que...", "Si el equipo cumple los criterios de espacio confinado...").',
  '',
  'NIVEL DE CERTEZA: distingue entre peligro CONFIRMADO (información directa), INFERIBLE (se deduce razonablemente del proceso) y CONDICIONADO (depende de una condición no confirmada).',
  'Nunca presentes como hecho una condición no confirmada; para lo condicionado usa "cuando aplique", "si el material presenta", "cuando la evaluación determine", "si el equipo cumple criterios".',
  '',
  'TERMINOLOGÍA: para bloqueo de energías usa exclusivamente el término LOTOTO (Lock Out – Tag Out – Try Out); nunca "LOTO".',
  'Escribe en español de México con ortografía impecable y terminología técnica de SST.',
  'Responde ÚNICAMENTE con un objeto JSON válido, sin texto adicional, sin bloques de código y sin comentarios.'
].join('\n');

/** Análisis técnico del proceso (secciones 9–12): para identificar peligros, controles y análisis completo. */
var ANALISIS_TECNICO = [
  'COMPRENSIÓN DEL PROCESO: determina qué proceso se realiza y para qué, qué equipo interviene, qué componente se manipula, qué material está presente,',
  'qué herramientas se usan, qué energías existen, qué condiciones operativas existen, qué cambia durante mantenimiento o limpieza y qué interacción hay entre operador, equipo y trabajador.',
  '',
  'RECONSTRUCCIÓN FÍSICA DE LA TAREA: reconstruye la tarea paso a paso: posición inicial, punto de acceso, secuencia, uso de manos y herramientas, alcance, flexión y rotación del tronco,',
  'brazos elevados, manipulación de componentes, fuerza aplicada, peso/altura/distancia solo cuando sean conocidos, desplazamiento, limpieza, transporte, desmontaje, montaje e ingreso parcial o total a equipos.',
  'Los peligros deben surgir de esta reconstrucción.',
  '',
  'ANÁLISIS DE DESVIACIONES (además de la operación normal), cuando tengan relación con la actividad: arranque inesperado, pérdida de aislamiento, energía o movimiento residual,',
  'componente atorado, herramienta que resbala, pieza que cae, liberación de presión o de producto, contacto eléctrico, temperatura residual, reacción térmica, derrame, proyección,',
  'pérdida de equilibrio, error humano razonablemente previsible y cambio no comunicado en la condición del equipo. No inventes eventos remotos o improbables.',
  '',
  'ENERGÍAS PELIGROSAS: cuando exista mantenimiento, limpieza, inspección, ajuste, desmontaje, montaje, liberación de atascos, retiro de protecciones, cambio de componentes o ingreso a maquinaria,',
  'analiza siempre: energía eléctrica, mecánica, cinética, potencial, hidráulica, neumática, presión acumulada, térmica, gravitacional y química, resortes, partes suspendidas,',
  'producto presurizado y energías residuales. Señala solo las que apliquen al proceso descrito (las no confirmadas, como condicionadas).'
].join('\n');

/** LOTOTO, aislamiento y Try Out (secciones 13–15): para peligros, controles y análisis completo. */
var REGLAS_LOTOTO = [
  'LOTOTO (Lock Out – Tag Out – Try Out) debe analizarse cuando exista exposición a energías peligrosas. Considera: 1) identificación de fuentes de energía, 2) paro controlado,',
  '3) aislamiento físico, 4) bloqueo, 5) etiquetado, 6) liberación, contención o disipación de energías residuales, 7) verificación de ausencia de energía, 8) Try Out,',
  '9) confirmación de energía cero, 10) restablecimiento seguro.',
  'NO constituyen aislamiento suficiente por sí solos: botón STOP, paro de emergencia, HMI, Control Room, selector OFF, comando de software ni desconexión lógica.',
  'Cuando exista riesgo por energías peligrosas debe existir aislamiento físico técnicamente adecuado; si el contexto solo menciona bloqueo de HMI o de control, señálalo como brecha.',
  'TRY OUT, cuando sea técnicamente posible: intento de arranque desde el control normal, verificación de ausencia de movimiento, de presión cero, de descarga de energía almacenada,',
  'de ausencia de tensión cuando corresponda y de posición segura de componentes. Nunca recomiendes una prueba que exponga al trabajador a energía peligrosa.'
].join('\n');

/** Criterios para identificar peligros (secciones 17–18). */
var REGLAS_PELIGROS = [
  'Todo peligro debe tener: 1) FUENTE, 2) EXPOSICIÓN y 3) MECANISMO DE LESIÓN técnicamente razonable. Pregúntate: ¿qué puede entrar en contacto con el trabajador o qué condición puede generar el daño?',
  'Prioriza peligros con potencial de: fatalidad, electrocución, atrapamiento, aplastamiento, amputación, caída de altura, incendio, explosión, asfixia, liberación de energía,',
  'intoxicación, quemaduras, exposición química significativa, pérdida auditiva y lesiones musculoesqueléticas.'
].join('\n');

/** Ejemplo de redacción de referencia (solo estilo). */
var EJEMPLO_REDACCION = [
  'EJEMPLO DE NIVEL DE REDACCIÓN ESPERADO (solo referencia de estilo; NO copies su contenido si no corresponde al escenario):',
  '"La actividad se realiza desde la plataforma de mezzanine para intervenir los filtros de los Hoppers que contienen o han contenido persulfatos de sodio, amonio y potasio, así como metasilicato de sodio.',
  'Antes de iniciar, se detiene el sistema y se aplica LOTOTO sobre las fuentes de energía aplicables, incluyendo el suministro neumático, HMI e interruptores asociados a los solenoides, asegurando una condición segura para la intervención.',
  'Una vez verificada la condición segura, con herramienta manual se retira la tornillería y la tapa del Hopper, colocándola en una posición estable. Posteriormente, los filtros se extraen manualmente mediante movimientos de agarre, jalón, levantamiento y desplazamiento.',
  'Los filtros se limpian en seco con cepillo plástico, retirando el producto adherido. Durante el cepillado puede generarse y dispersarse polvo de persulfatos y metasilicato hacia la zona respiratoria, ojos, rostro, manos, ropa y superficies de trabajo.',
  'Finalizada la limpieza, los filtros se reinstalan, se coloca la tapa y se ajusta la tornillería. Se retiran herramientas y residuos, se verifica el cierre del Hopper y que el personal se encuentre fuera del punto de intervención antes de retirar de forma controlada el LOTOTO y restablecer el equipo."'
].join('\n');

var FORMATO_PELIGRO = '{"tipo": "<TIPO exacto del catálogo>", "subtipo": "<subtipo exacto del catálogo>", "dano": "<daño exacto del catálogo>", "enCatalogo": true|false, ' +
  '"descripcionLibre": "<si enCatalogo=false: nombre técnico del peligro>", "fuente": "...", "exposicion": "...", "mecanismo": "...", ' +
  '"partesCuerpo": "...", "certeza": "Confirmado|Inferible|Condicionado", "condicion": "<si es Condicionado: de qué depende>", "prioridad": "Crítica|Alta|Media|Baja"}';

/* =====================================================================
   PROMPTS POR TIPO DE SOLICITUD
   ===================================================================== */

var PROMPTS_IA = {
  MEJORAR_MODO_OCURRENCIA: {
    esfuerzo: 'low',
    sistema: [
      'Tarea: analiza y mejora internamente la redacción del modo de ocurrencia y entrega una descripción técnica, cronológica y orientada a la identificación de peligros,',
      'usando ÚNICAMENTE los hechos del contexto (actividad, tareas, modo de ocurrencia, peligro y hallazgos visuales confirmados).',
      '',
      'LA DESCRIPCIÓN DEBE: conservar el significado original; ordenar cronológicamente las acciones; e identificar, cuando se desprendan de lo descrito, movimientos, posturas,',
      'interacción hombre-máquina, herramientas, equipos, componentes, materiales, energías, agentes físicos, agentes químicos, manipulación manual, acceso a equipos,',
      'exposición, partes del cuerpo expuestas y posibles desviaciones (p. ej. componente atorado, herramienta que resbala, pieza que cae), estas últimas en forma condicional.',
      '',
      'ESTRUCTURA (3 a 5 párrafos, sin viñetas, títulos ni numeración):',
      '1. Lugar y propósito (si no se indica el lugar, omítelo). 2. Preparación: condiciones previas y medidas que el usuario SÍ mencionó, indicando sobre qué fuentes se aplican.',
      '3. Ejecución paso a paso con verbos precisos (retirar, desenroscar, extraer, sujetar, girar), herramienta, postura y movimiento; en cada punto de exposición describe el peligro',
      'en forma condicional ("durante el desenroscado puede presentarse...") y las partes del cuerpo expuestas cuando se deduzcan de la acción.',
      '4. Cierre: cómo concluye y qué debe verificarse antes de restablecer el equipo; si el usuario no lo describió, redáctalo de forma neutral sin inventar pasos.',
      '',
      'ESTILO: tercera persona impersonal y tiempo presente ("se retira", "se aplica"), nunca primera persona. Corrige errores evidentes ("su ministro de aire" → "suministro de aire").',
      'Desarrolla abreviaturas que el usuario escribió, la primera vez: HMI → interfaz hombre-máquina (HMI); LOTOTO → LOTOTO (Lock Out – Tag Out – Try Out); si escribió "LOTO", usa "LOTOTO".',
      'Respeta el alcance exacto de lo dicho: si escribió "bloqueo", escribe "bloqueo" (no afirmes que se aplicó LOTOTO completo, etiquetado o Try Out si no lo dijo). No agregues acciones no descritas.',
      'No agregues EPP, permisos ni controles que el usuario no mencionó. Si el texto es breve, no lo alargues con suposiciones.',
      'No afirmes que un bloqueo en HMI, botón STOP, paro de emergencia, selector o comando de software "asegura el aislamiento": descríbelo solo como la acción realizada (p. ej. "se aplica bloqueo en la HMI").',
      'El texto es un documento técnico final: nunca menciones "el usuario", "el contexto", "la información proporcionada" ni hagas comentarios sobre la redacción.',
      '',
      EJEMPLO_REDACCION,
      '',
      'Antes de responder verifica: cada hecho proviene del contexto, no hay valores inventados, ortografía correcta y sin primera persona.',
      'Formato de salida: {"texto": "<descripción mejorada, párrafos separados con \\n\\n>"}'
    ].join('\n')
  },

  IDENTIFICAR_PELIGROS: {
    esfuerzo: 'medium',
    sistema: [
      'Tarea: identifica los peligros del modo de ocurrencia a partir de la comprensión del proceso y la reconstrucción física de la tarea.',
      '',
      ANALISIS_TECNICO,
      '',
      REGLAS_LOTOTO,
      '',
      REGLAS_PELIGROS,
      '',
      'CANTIDAD: mínimo 3 y máximo 10 peligros; cada uno es una fila independiente (una combinación tipo–subtipo–daño). No agregues peligros solo para cumplir el mínimo:',
      'si con la información disponible solo hay 1 o 2 peligros con fuente, exposición y mecanismo razonables, entrega solo esos y explica en "notas" qué información falta.',
      'Ordena del más prioritario al menos prioritario. No repitas peligros ya registrados en el contexto (campo "peligros").',
      'Para tipo, subtipo y daño usa EXACTAMENTE valores del catálogo del contexto (tipo → subtipo → daños) y enCatalogo=true. Si el peligro es técnicamente relevante pero no existe en el catálogo,',
      'usa enCatalogo=false, elige el tipo del catálogo más cercano (o deja tipo vacío) y descríbelo en descripcionLibre.',
      '',
      'Formato de salida: {"peligros": [' + FORMATO_PELIGRO + '], "energias": [{"energia": "...", "fuente": "...", "certeza": "Confirmado|Inferible|Condicionado"}],',
      '"brechas": ["<p. ej. bloqueo solo en HMI no constituye aislamiento físico>"], "notas": "..."}'
    ].join('\n')
  },

  SUGERIR_CONTROLES_STOP: {
    esfuerzo: 'low',
    sistema: [
      'Tarea: diseña controles jerárquicos para el peligro indicado bajo la metodología STOP: S = Eliminación / Sustitución; T = Ingeniería / Diseño; O = Controles Administrativos; P = Equipo de Protección Personal.',
      '',
      ANALISIS_TECNICO,
      '',
      REGLAS_LOTOTO,
      '',
      'Prioriza S y T antes de O y P. No llenes una categoría si no aplica: es válido omitirla.',
      'Cada control debe ser específico, concreto y verificable, ligado a la fuente, la exposición y el mecanismo de lesión del peligro y del modo de ocurrencia.',
      'Cuando el peligro involucre energías peligrosas, incluye en O el procedimiento LOTOTO específico con las fuentes identificadas (aislamiento físico, bloqueo, etiquetado, disipación, verificación, Try Out seguro y restablecimiento),',
      'y en T los puntos de aislamiento o dispositivos de disipación cuando sean técnicamente pertinentes. Nunca propongas un Try Out que exponga al trabajador.',
      'Evita recomendaciones genéricas como "tener cuidado", "usar EPP", "trabajar seguro" o "capacitar" sin especificar qué, cómo y a quién.',
      'Para EPP indica el tipo de protección conforme al peligro y que su selección debe basarse en la evaluación correspondiente; no inventes especificaciones.',
      'No asumas que algún control existe; todos son propuestos hasta que el usuario los confirme. No repitas controles ya registrados.',
      'No inventes requisitos legales. Puedes referir la norma principal o complementarias solo si vienen en el contexto.',
      'Formato de salida: {"controles": [{"categoria": "S|T|O|P", "control": "...", "justificacion": "..."}], "notas": "<supuestos, brechas o información por confirmar, opcional>"}'
    ].join('\n')
  },

  ANALIZAR_FOTOGRAFIA: {
    esfuerzo: 'medium',
    sistema: [
      'Tarea: identificación visual de peligros ocupacionales en la fotografía, junto con el contexto.',
      'Describe únicamente condiciones visibles: maquinaria, equipos, partes móviles, guardas, barreras, escaleras, plataformas, desniveles, derrames, obstáculos, vehículos, tuberías,',
      'materiales almacenados, equipos eléctricos visibles, condiciones locativas, orden y limpieza y EPP visible.',
      'Separa observación (lo que se ve), interpretación (justificación) y peligro sugerido.',
      'No determines ruido, concentración química, voltaje, presión, temperatura, contenido de recipientes, estado de energización ni cumplimiento normativo definitivo sin evidencia suficiente;',
      'en esos casos usa redacción condicional, p. ej.: "Se observa maquinaria que podría constituir una fuente de ruido; confirmar mediante evaluación correspondiente."',
      'No agregues peligros automáticamente: solo sugiere. Para posiblePeligro, subtipoSugerido y danoSugerido usa EXACTAMENTE valores del catálogo incluido en el contexto; si ninguno aplica, deja la cadena vacía.',
      'confianza debe ser "Alta", "Media" o "Baja".',
      'Formato de salida: {"resumen": "...", "hallazgos": [{"observacion": "...", "confianza": "Alta|Media|Baja", "posiblePeligro": "<TIPO del catálogo>", "subtipoSugerido": "...", "danoSugerido": "...", "justificacion": "..."}], "limitaciones": "..."}'
    ].join('\n')
  },

  ANALIZAR_ACTIVIDAD_COMPLETA: {
    esfuerzo: 'medium',
    sistema: [
      'Tarea: revisión integral de la actividad capturada (actividad, tareas, modo de ocurrencia, peligros, evaluación, fotografías, hallazgos confirmados y controles existentes).',
      '',
      ANALISIS_TECNICO,
      '',
      REGLAS_LOTOTO,
      '',
      REGLAS_PELIGROS,
      '',
      'Evalúa la calidad de la descripción, identifica información faltante, describe hallazgos visuales (solo lo visible), propone peligros potenciales NO registrados (máximo 10, priorizados),',
      'formula preguntas por confirmar (p. ej. "¿El equipo permanece energizado durante la tarea?", "¿La actividad se realiza por encima de 1.80 m?") sin asumir respuestas,',
      'y sugiere controles STOP específicos priorizando S y T. Para peligros potenciales usa EXACTAMENTE valores del catálogo del contexto.',
      'No modifiques severidad, frecuencia ni riesgo residual; no los propongas como decisiones.',
      'Formato de salida: {"calidadDescripcion": {"valoracion": "Adecuada|Mejorable|Insuficiente", "comentarios": "..."}, "informacionFaltante": ["..."], "hallazgosVisuales": ["..."],',
      '"peligrosPotenciales": [' + FORMATO_PELIGRO + '], "brechas": ["..."], "preguntasPorConfirmar": ["..."],',
      '"controlesSugeridos": [{"categoria": "S|T|O|P", "control": "...", "justificacion": "..."}]}'
    ].join('\n')
  }
};

function solicitarIA_(tipoSolicitud, contexto, imagenes, modeloPedido) {
  var def = PROMPTS_IA[tipoSolicitud];
  if (!def) throw new Error('Tipo de solicitud de IA no soportado.');
  if (!proveedorIA_()) throw new Error('La IA no está configurada en el backend: agregue GEMINI_API_KEY (gratuita, aistudio.google.com) en Propiedades del script.');
  var eleccion = resolverModeloIA_(modeloPedido);

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

  var texto = llamarProveedorIA_(REGLAS_GENERALES + '\n\n' + def.sistema, contenido, def.esfuerzo, eleccion);
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
function llamarProveedorIA_(sistema, contenido, esfuerzo, eleccion) {
  eleccion = eleccion || resolverModeloIA_('');
  if (eleccion.proveedor === 'gemini') {
    var t = llamarGemini_(sistema, contenido);
    ultimoModeloUsado_ = ultimoModeloGemini_;
    return t;
  }
  ultimoModeloUsado_ = eleccion.modelo;
  return llamarClaude_(sistema, contenido, esfuerzo, eleccion.modelo);
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
    generationConfig: { responseMimeType: 'application/json', temperature: 0.3, maxOutputTokens: 16384 }
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
function llamarClaude_(sistema, contenido, esfuerzo, modelo) {
  modelo = modelo || prop_('AI_MODEL') || IA_MODELO_PREDETERMINADO;
  // Haiku 4.5 no admite el parámetro de esfuerzo ni el respaldo automático del servidor.
  var esHaiku = /^claude-haiku/.test(modelo);
  var cuerpo = {
    model: modelo,
    max_tokens: 8000,
    system: sistema,
    messages: [{ role: 'user', content: contenido }]
  };
  var headers = { 'x-api-key': prop_('ANTHROPIC_API_KEY'), 'anthropic-version': '2023-06-01' };
  if (!esHaiku) {
    cuerpo.output_config = { effort: esfuerzo || 'medium' };
    // Si el modelo declina por política de seguridad, el servidor reintenta con el modelo de respaldo recomendado.
    cuerpo.fallbacks = 'default';
    headers['anthropic-beta'] = 'server-side-fallback-2026-07-01';
  }
  var resp = UrlFetchApp.fetch(IA_URL, {
    method: 'post',
    contentType: 'application/json',
    headers: headers,
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
