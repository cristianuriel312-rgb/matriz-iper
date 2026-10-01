/**
 * Capa de DATOS — Catálogos maestros.
 * Catálogo de peligros, severidades, frecuencias, clasificación de riesgo y categorías STOP.
 * Se mantiene como módulo independiente para poder migrarlo a una API/BD sin tocar la UI.
 */

export const catalogoPeligros = [
{tipo:"FÍSICO",subtipo:"Presiones ambientales anormales",normaPrincipal:"NOM-014-STPS-2000",dano:"Barotrauma",criterioAplicacion:"Cuando exista exposición a presiones ambientales anormales.",normasComplementarias:"NOM-017-STPS-2024"},
{tipo:"FÍSICO",subtipo:"Presiones ambientales anormales",normaPrincipal:"NOM-014-STPS-2000",dano:"Enfermedad por descompresión",criterioAplicacion:"Cuando exista exposición hiperbárica/hipobárica aplicable.",normasComplementarias:"NOM-017-STPS-2024"},
{tipo:"FÍSICO",subtipo:"Ruido",normaPrincipal:"NOM-011-STPS-2001",dano:"Pérdida auditiva",criterioAplicacion:"Cuando exista exposición ocupacional a ruido.",normasComplementarias:"NOM-017-STPS-2024"},
{tipo:"FÍSICO",subtipo:"Ruido",normaPrincipal:"NOM-011-STPS-2001",dano:"Trauma acústico",criterioAplicacion:"Cuando la exposición o evento acústico pueda causar daño auditivo.",normasComplementarias:"NOM-017-STPS-2024"},
{tipo:"FÍSICO",subtipo:"Iluminación deficiente o excesiva",normaPrincipal:"NOM-025-STPS-2008",dano:"Fatiga visual",criterioAplicacion:"Cuando las condiciones de iluminación sean inadecuadas para la tarea.",normasComplementarias:""},
{tipo:"FÍSICO",subtipo:"Temperaturas elevadas",normaPrincipal:"NOM-015-STPS-2001",dano:"Golpe de calor",criterioAplicacion:"Cuando exista exposición a condiciones térmicas elevadas.",normasComplementarias:"NOM-017-STPS-2024"},
{tipo:"FÍSICO",subtipo:"Temperaturas abatidas",normaPrincipal:"NOM-015-STPS-2001",dano:"Hipotermia",criterioAplicacion:"Cuando exista exposición a condiciones térmicas abatidas.",normasComplementarias:"NOM-017-STPS-2024"},
{tipo:"FÍSICO",subtipo:"Vibraciones",normaPrincipal:"NOM-024-STPS-2001",dano:"Trastornos musculoesqueléticos",criterioAplicacion:"Cuando exista exposición ocupacional a vibraciones.",normasComplementarias:""},
{tipo:"FÍSICO",subtipo:"Radiaciones ionizantes",normaPrincipal:"NOM-012-STPS-2012",dano:"Lesión por radiación ionizante",criterioAplicacion:"Cuando existan fuentes de radiación ionizante.",normasComplementarias:"NOM-017-STPS-2024"},
{tipo:"FÍSICO",subtipo:"Radiaciones no ionizantes",normaPrincipal:"NOM-013-STPS-1993",dano:"Lesión ocular o cutánea",criterioAplicacion:"Cuando existan fuentes de radiación no ionizante.",normasComplementarias:"NOM-017-STPS-2024"},

{tipo:"MECÁNICO/CINÉTICO",subtipo:"Puntos de pellizco",normaPrincipal:"NOM-004-STPS-1999",dano:"Contusión",criterioAplicacion:"Interacción de manos/cuerpo entre componentes con movimiento relativo.",normasComplementarias:"NOM-017-STPS-2024"},
{tipo:"MECÁNICO/CINÉTICO",subtipo:"Puntos de pellizco",normaPrincipal:"NOM-004-STPS-1999",dano:"Fractura",criterioAplicacion:"Cuando la fuerza de cierre pueda lesionar tejido/hueso.",normasComplementarias:"NOM-017-STPS-2024"},
{tipo:"MECÁNICO/CINÉTICO",subtipo:"Puntos de atrapamiento",normaPrincipal:"NOM-004-STPS-1999",dano:"Aplastamiento",criterioAplicacion:"Partes del cuerpo pueden quedar atrapadas entre partes móviles/fijas.",normasComplementarias:"NOM-017-STPS-2024"},
{tipo:"MECÁNICO/CINÉTICO",subtipo:"Puntos de atrapamiento",normaPrincipal:"NOM-004-STPS-1999",dano:"Amputación",criterioAplicacion:"Cuando el mecanismo tenga capacidad de corte/cizallamiento/aplastamiento severo.",normasComplementarias:"NOM-017-STPS-2024"},
{tipo:"MECÁNICO/CINÉTICO",subtipo:"Partes/equipos en movimiento",normaPrincipal:"NOM-004-STPS-1999",dano:"Golpe o contusión",criterioAplicacion:"Contacto con elementos móviles de maquinaria/equipo.",normasComplementarias:"NOM-017-STPS-2024"},
{tipo:"MECÁNICO/CINÉTICO",subtipo:"Golpeado por objeto o componente",normaPrincipal:"NOM-004-STPS-1999",dano:"Contusión",criterioAplicacion:"Objeto/componente puede impactar al trabajador durante intervención de maquinaria.",normasComplementarias:"NOM-017-STPS-2024"},
{tipo:"MECÁNICO/CINÉTICO",subtipo:"Caída de materiales/objetos",normaPrincipal:"NOM-006-STPS-2023",dano:"Contusión",criterioAplicacion:"Cuando materiales manejados con maquinaria pueden caer o desplazarse.",normasComplementarias:"NOM-017-STPS-2024"},
{tipo:"MECÁNICO/CINÉTICO",subtipo:"Caída de materiales/objetos",normaPrincipal:"NOM-006-STPS-2023",dano:"Fractura",criterioAplicacion:"Cuando la masa/altura pueda ocasionar lesión ósea.",normasComplementarias:"NOM-017-STPS-2024"},
{tipo:"MECÁNICO/CINÉTICO",subtipo:"Cargas suspendidas",normaPrincipal:"NOM-006-STPS-2023",dano:"Aplastamiento",criterioAplicacion:"Aplicable al manejo de materiales mediante maquinaria y cargas suspendidas.",normasComplementarias:"NOM-017-STPS-2024"},
{tipo:"MECÁNICO/CINÉTICO",subtipo:"Proyección de fragmentos o partículas",normaPrincipal:"NOM-004-STPS-1999",dano:"Lesión ocular",criterioAplicacion:"Cuando maquinaria/herramienta pueda proyectar partículas.",normasComplementarias:"NOM-017-STPS-2024"},
{tipo:"MECÁNICO/CINÉTICO",subtipo:"Contacto con herramienta punzocortante",normaPrincipal:"NOM-004-STPS-1999",dano:"Corte o laceración",criterioAplicacion:"Cuando la herramienta forme parte de intervención sobre maquinaria; complementar con procedimiento específico.",normasComplementarias:"NOM-017-STPS-2024"},

{tipo:"ELÉCTRICO",subtipo:"Contacto directo con partes energizadas",normaPrincipal:"NOM-029-STPS-2011",dano:"Electrocución",criterioAplicacion:"Mantenimiento/intervención de instalaciones eléctricas energizadas o con energía peligrosa.",normasComplementarias:"NOM-017-STPS-2024"},
{tipo:"ELÉCTRICO",subtipo:"Contacto indirecto",normaPrincipal:"NOM-029-STPS-2011",dano:"Choque eléctrico",criterioAplicacion:"Contacto con masas que pueden energizarse por falla.",normasComplementarias:"NOM-017-STPS-2024"},
{tipo:"ELÉCTRICO",subtipo:"Arco eléctrico",normaPrincipal:"NOM-029-STPS-2011",dano:"Quemadura por arco eléctrico",criterioAplicacion:"Cuando exista posibilidad de arco durante intervención eléctrica.",normasComplementarias:"NOM-017-STPS-2024"},
{tipo:"ELÉCTRICO",subtipo:"Arco eléctrico",normaPrincipal:"NOM-029-STPS-2011",dano:"Muerte",criterioAplicacion:"Escenarios eléctricos de alta severidad.",normasComplementarias:"NOM-017-STPS-2024"},
{tipo:"ELÉCTRICO",subtipo:"Electricidad estática",normaPrincipal:"NOM-022-STPS-2015",dano:"Choque/descarga electrostática",criterioAplicacion:"Generación o acumulación de cargas estáticas.",normasComplementarias:"NOM-017-STPS-2024"},
{tipo:"ELÉCTRICO",subtipo:"Electricidad estática",normaPrincipal:"NOM-022-STPS-2015",dano:"Incendio o explosión por ignición",criterioAplicacion:"Cuando la descarga estática pueda actuar como fuente de ignición.",normasComplementarias:"NOM-002-STPS-2010; NOM-005-STPS-1998"},

{tipo:"QUÍMICO",subtipo:"Polvos",normaPrincipal:"NOM-010-STPS-2014",dano:"Irritación de vías respiratorias",criterioAplicacion:"Exposición por inhalación a polvo contaminante del ambiente laboral.",normasComplementarias:"NOM-018-STPS-2015; NOM-005-STPS-1998; NOM-017-STPS-2024"},
{tipo:"QUÍMICO",subtipo:"Polvos",normaPrincipal:"NOM-010-STPS-2014",dano:"Sensibilización o reacción alérgica respiratoria",criterioAplicacion:"Solo cuando la sustancia/HDS sustente potencial sensibilizante.",normasComplementarias:"NOM-018-STPS-2015; NOM-005-STPS-1998; NOM-017-STPS-2024"},
{tipo:"QUÍMICO",subtipo:"Polvos",normaPrincipal:"NOM-010-STPS-2014",dano:"Irritación ocular",criterioAplicacion:"Exposición de ojos a polvo suspendido/depositado.",normasComplementarias:"NOM-018-STPS-2015; NOM-017-STPS-2024"},
{tipo:"QUÍMICO",subtipo:"Polvos",normaPrincipal:"NOM-010-STPS-2014",dano:"Irritación cutánea",criterioAplicacion:"Contacto cutáneo con polvo, cuando HDS lo indique.",normasComplementarias:"NOM-018-STPS-2015; NOM-017-STPS-2024"},
{tipo:"QUÍMICO",subtipo:"Humos",normaPrincipal:"NOM-010-STPS-2014",dano:"Irritación o daño respiratorio",criterioAplicacion:"Exposición a humos químicos/metálicos según sustancia.",normasComplementarias:"NOM-018-STPS-2015; NOM-017-STPS-2024"},
{tipo:"QUÍMICO",subtipo:"Vapores",normaPrincipal:"NOM-010-STPS-2014",dano:"Intoxicación",criterioAplicacion:"Exposición inhalatoria a vapores con toxicidad relevante.",normasComplementarias:"NOM-018-STPS-2015; NOM-005-STPS-1998; NOM-017-STPS-2024"},
{tipo:"QUÍMICO",subtipo:"Neblinas",normaPrincipal:"NOM-010-STPS-2014",dano:"Irritación de vías respiratorias",criterioAplicacion:"Exposición a aerosol líquido/neblina.",normasComplementarias:"NOM-018-STPS-2015; NOM-017-STPS-2024"},
{tipo:"QUÍMICO",subtipo:"Líquidos",normaPrincipal:"NOM-018-STPS-2015",dano:"Irritación ocular",criterioAplicacion:"Contacto/salpicadura; la HDS define peligros específicos.",normasComplementarias:"NOM-005-STPS-1998; NOM-017-STPS-2024"},
{tipo:"QUÍMICO",subtipo:"Líquidos",normaPrincipal:"NOM-018-STPS-2015",dano:"Irritación cutánea",criterioAplicacion:"Contacto dérmico; la HDS define peligros específicos.",normasComplementarias:"NOM-005-STPS-1998; NOM-017-STPS-2024"},
{tipo:"QUÍMICO",subtipo:"Incompatibilidad/reacción química",normaPrincipal:"NOM-005-STPS-1998",dano:"Quemadura química",criterioAplicacion:"Mezcla/contacto incompatible durante manejo, transporte o almacenamiento.",normasComplementarias:"NOM-018-STPS-2015; NOM-028-STPS-2012 cuando aplique"},
{tipo:"QUÍMICO",subtipo:"Incompatibilidad/reacción química",normaPrincipal:"NOM-005-STPS-1998",dano:"Intoxicación por productos de reacción",criterioAplicacion:"Cuando una reacción pueda liberar productos peligrosos.",normasComplementarias:"NOM-018-STPS-2015; NOM-028-STPS-2012 cuando aplique"},

{tipo:"ERGONÓMICO",subtipo:"Manejo manual de cargas",normaPrincipal:"NOM-036-1-STPS-2018",dano:"Lumbalgia",criterioAplicacion:"Levantamiento, descenso, transporte o manipulación manual de cargas.",normasComplementarias:""},
{tipo:"ERGONÓMICO",subtipo:"Manejo manual de cargas",normaPrincipal:"NOM-036-1-STPS-2018",dano:"Lesión musculoesquelética en miembros superiores",criterioAplicacion:"Cuando agarre, levantamiento o manipulación afecte miembros superiores.",normasComplementarias:""},
{tipo:"ERGONÓMICO",subtipo:"Manejo manual de cargas",normaPrincipal:"NOM-036-1-STPS-2018",dano:"Lesión musculoesquelética en miembros inferiores",criterioAplicacion:"Cuando postura/esfuerzo durante manejo manual afecte miembros inferiores.",normasComplementarias:""},
{tipo:"ERGONÓMICO",subtipo:"Empuje y jalón de cargas",normaPrincipal:"NOM-036-1-STPS-2018",dano:"Lesión musculoesquelética en miembros superiores",criterioAplicacion:"Empuje/jalón manual de cargas dentro del alcance de la Parte 1.",normasComplementarias:""},
{tipo:"ERGONÓMICO",subtipo:"Movimientos repetitivos",normaPrincipal:"Sin NOM STPS específica publicada para Parte 2",dano:"Lesión musculoesquelética en miembros superiores",criterioAplicacion:"Usar método ergonómico reconocido y gestión preventiva; NOM-036 Parte 1 no cubre por sí sola toda repetitividad.",normasComplementarias:"NOM-030-STPS-2009"},
{tipo:"ERGONÓMICO",subtipo:"Posturas forzadas o sostenidas",normaPrincipal:"Sin NOM STPS específica publicada para Parte 2",dano:"Lumbalgia",criterioAplicacion:"Usar método ergonómico reconocido y gestión preventiva.",normasComplementarias:"NOM-030-STPS-2009"},

{tipo:"PSICOSOCIAL",subtipo:"Carga de trabajo",normaPrincipal:"NOM-035-STPS-2018",dano:"Estrés laboral",criterioAplicacion:"Factores de riesgo psicosocial relacionados con carga y organización del trabajo.",normasComplementarias:""},
{tipo:"PSICOSOCIAL",subtipo:"Jornada/horario de trabajo",normaPrincipal:"NOM-035-STPS-2018",dano:"Alteración del sueño",criterioAplicacion:"Cuando la organización del tiempo de trabajo sea factor de riesgo psicosocial.",normasComplementarias:""},
{tipo:"PSICOSOCIAL",subtipo:"Violencia laboral / acoso",normaPrincipal:"NOM-035-STPS-2018",dano:"Ansiedad o estrés",criterioAplicacion:"Usar terminología de violencia laboral conforme al marco aplicable.",normasComplementarias:""},
{tipo:"PSICOSOCIAL",subtipo:"Liderazgo y relaciones en el trabajo",normaPrincipal:"NOM-035-STPS-2018",dano:"Estrés laboral",criterioAplicacion:"Factores derivados de liderazgo negativo/relaciones desfavorables.",normasComplementarias:""},

{tipo:"BIOLÓGICO",subtipo:"Hongos",normaPrincipal:"Sin NOM STPS específica general",dano:"Infección o reacción alérgica",criterioAplicacion:"La NOM-032-SSA2-2014 no es una norma general de exposición biológica ocupacional; aplica a enfermedades transmitidas por vectores.",normasComplementarias:"NOM-017-STPS-2024 según EPP"},
{tipo:"BIOLÓGICO",subtipo:"Virus",normaPrincipal:"Sin NOM STPS específica general",dano:"Enfermedad infecciosa",criterioAplicacion:"Definir normativa sanitaria específica según agente/actividad.",normasComplementarias:"NOM-017-STPS-2024 según EPP"},
{tipo:"BIOLÓGICO",subtipo:"Bacterias",normaPrincipal:"Sin NOM STPS específica general",dano:"Enfermedad infecciosa",criterioAplicacion:"Definir normativa sanitaria específica según agente/actividad.",normasComplementarias:"NOM-017-STPS-2024 según EPP"},
{tipo:"BIOLÓGICO",subtipo:"Esporas",normaPrincipal:"Sin NOM STPS específica general",dano:"Reacción alérgica",criterioAplicacion:"Definir normativa sanitaria específica según agente/actividad.",normasComplementarias:"NOM-017-STPS-2024 según EPP"},
{tipo:"BIOLÓGICO",subtipo:"Fauna nociva/vector",normaPrincipal:"NOM-032-SSA2-2014 (solo cuando corresponda a vectores)",dano:"Enfermedad transmitida por vector",criterioAplicacion:"No usar esta NOM para hongos, virus o bacterias genéricos; su campo es enfermedades transmitidas por vectores.",normasComplementarias:""},

{tipo:"ACCIDENTE",subtipo:"Caída al mismo nivel",normaPrincipal:"NOM-001-STPS-2008",dano:"Torcedura o luxación",criterioAplicacion:"Piso, pasillos, obstáculos, derrames o condiciones locativas.",normasComplementarias:""},
{tipo:"ACCIDENTE",subtipo:"Caída al mismo nivel",normaPrincipal:"NOM-001-STPS-2008",dano:"Fractura",criterioAplicacion:"Cuando el mecanismo de caída pueda ocasionarla.",normasComplementarias:""},
{tipo:"ACCIDENTE",subtipo:"Caída a distinto nivel / trabajo en altura",normaPrincipal:"NOM-009-STPS-2011",dano:"Fractura",criterioAplicacion:"Aplicar NOM-009 cuando el trabajo se realice a más de 1.80 m sobre el nivel de referencia o exista riesgo definido por la norma.",normasComplementarias:"NOM-017-STPS-2024"},
{tipo:"ACCIDENTE",subtipo:"Caída a distinto nivel / trabajo en altura",normaPrincipal:"NOM-009-STPS-2011",dano:"Muerte",criterioAplicacion:"Escenarios de caída de alta severidad.",normasComplementarias:"NOM-017-STPS-2024"},
{tipo:"ACCIDENTE",subtipo:"Atropellamiento por vehículos/equipo móvil",normaPrincipal:"NOM-006-STPS-2023",dano:"Aplastamiento",criterioAplicacion:"Cuando intervenga maquinaria para almacenamiento/manejo de materiales.",normasComplementarias:""},
{tipo:"ACCIDENTE",subtipo:"Atropellamiento por vehículos/equipo móvil",normaPrincipal:"NOM-006-STPS-2023",dano:"Fractura",criterioAplicacion:"Interacción peatón-equipo móvil.",normasComplementarias:""},
{tipo:"ACCIDENTE",subtipo:"Atropellamiento por ferrocarril",normaPrincipal:"NOM-016-STPS-2001",dano:"Lesión grave o muerte",criterioAplicacion:"Solo en operación/mantenimiento ferroviario.",normasComplementarias:""},
{tipo:"ACCIDENTE",subtipo:"Incendio",normaPrincipal:"NOM-002-STPS-2010",dano:"Quemadura",criterioAplicacion:"Escenarios de incendio en el centro de trabajo.",normasComplementarias:"NOM-005-STPS-1998 / NOM-018-STPS-2015 si intervienen químicos"},
{tipo:"ACCIDENTE",subtipo:"Incendio",normaPrincipal:"NOM-002-STPS-2010",dano:"Intoxicación por humo/gases",criterioAplicacion:"Exposición a productos de combustión.",normasComplementarias:""},
{tipo:"ACCIDENTE",subtipo:"Explosión de recipiente/equipo a presión",normaPrincipal:"NOM-020-STPS-2011",dano:"Trauma o lesión grave",criterioAplicacion:"Cuando el escenario involucre recipientes sujetos a presión, criogénicos o calderas.",normasComplementarias:""},
{tipo:"ACCIDENTE",subtipo:"Espacio confinado",normaPrincipal:"NOM-033-STPS-2015",dano:"Asfixia",criterioAplicacion:"Ingreso a espacio que cumpla la definición y condiciones de la NOM-033.",normasComplementarias:"NOM-017-STPS-2024"},
{tipo:"ACCIDENTE",subtipo:"Espacio confinado",normaPrincipal:"NOM-033-STPS-2015",dano:"Intoxicación",criterioAplicacion:"Atmósfera peligrosa por contaminantes.",normasComplementarias:"NOM-017-STPS-2024"},
{tipo:"ACCIDENTE",subtipo:"Derrame/liberación accidental de sustancia",normaPrincipal:"NOM-005-STPS-1998",dano:"Lesión química según sustancia",criterioAplicacion:"Evento accidental durante manejo/almacenamiento; determinar daño específico por HDS.",normasComplementarias:"NOM-018-STPS-2015; NOM-017-STPS-2024"}
];

/** Tipos únicos en el orden en que aparecen en el catálogo. */
export function obtenerTipos() {
    return [...new Set(catalogoPeligros.map(p => p.tipo))];
}

/** Subtipos únicos (sin duplicados) para un tipo. */
export function obtenerSubtipos(tipo) {
    return [...new Set(catalogoPeligros.filter(p => p.tipo === tipo).map(p => p.subtipo))];
}

/** Daños aplicables para Tipo + Subtipo. */
export function obtenerDanos(tipo, subtipo) {
    return [...new Set(catalogoPeligros
        .filter(p => p.tipo === tipo && p.subtipo === subtipo)
        .map(p => p.dano))];
}

/** Registro normativo para la combinación válida Tipo + Subtipo + Daño, o null. */
export function obtenerNormativa(tipo, subtipo, dano) {
    return catalogoPeligros.find(p => p.tipo === tipo && p.subtipo === subtipo && p.dano === dano) || null;
}

/** Árbol compacto tipo → subtipo → daños, usado como contexto para la IA. */
export function arbolCatalogo() {
    const arbol = {};
    for (const p of catalogoPeligros) {
        arbol[p.tipo] ??= {};
        arbol[p.tipo][p.subtipo] ??= [];
        arbol[p.tipo][p.subtipo].push(p.dano);
    }
    return arbol;
}

export const severidades = {
    A: {nombre:"Muy Crítica",valor:5, definicion:"Puede provocar la muerte de una o más personas."},
    B: {nombre:"Crítica",valor:4, definicion:"Puede provocar lesiones que generen ausencia prolongada de una persona o lesiones con pérdida de tiempo de varias personas. Ansiedad."},
    C: {nombre:"Seria",valor:3, definicion:"Puede provocar lesiones con pérdida de tiempo de una persona o lesiones leves a varias personas. Pánico, depresión."},
    D: {nombre:"Moderada",valor:2, definicion:"Lesión menor de una persona que puede requerir de primeros auxilios. Desgaste emocional."},
    E: {nombre:"Despreciable",valor:1, definicion:"Sin efectos adversos para la salud de una persona."}
};

/** Código de frecuencia → nombre, valor F y definición. (Código 5 → F=1 … Código 1 → F=5) */
export const frecuencias = {
    "5": {nombre:"Muy raramente", valor:1, definicion:"Exposición irregular, al menos una vez al año con tiempos de exposición cortos o prolongados."},
    "4": {nombre:"Raramente", valor:2, definicion:"Al menos una vez al mes con tiempos de exposición cortos o prolongados."},
    "3": {nombre:"Posible", valor:3, definicion:"Al menos una vez en la semana con tiempos de exposición cortos o prolongados."},
    "2": {nombre:"Frecuente", valor:4, definicion:"Alguna vez durante su jornada laboral con tiempos de exposición cortos o prolongados."},
    "1": {nombre:"Muy Frecuente", valor:5, definicion:"Varias veces durante su jornada laboral."}
};

export const riesgosBajos = ["C5","D5","D4","D3","E5","E4","E3","E2","E1"];
export const riesgosMedios = ["B5","B4","C4","C3","D2","D1"];
export const riesgosAltos = ["A5","A4","A3","A2","A1","B3","B2","B1","C2","C1"];

export const CATEGORIAS_STOP = {
    S: {nombre:"Eliminación / Sustitución", descripcion:"Eliminar el peligro o sustituir el material, proceso, sustancia, equipo o condición peligrosa por una alternativa de menor riesgo cuando sea viable."},
    T: {nombre:"Ingeniería / Diseño", descripcion:"Modificar físicamente instalaciones, equipos, procesos o sistemas para eliminar o reducir la exposición."},
    O: {nombre:"Controles Administrativos", descripcion:"Procedimientos, capacitación, permisos, inspecciones, señalización, mantenimiento, organización del trabajo y otros métodos administrativos."},
    P: {nombre:"Equipo de Protección Personal", descripcion:"Equipo seleccionado conforme al peligro, exposición, tarea y condiciones específicas."}
};

export const ESTADOS_CONTROL = ["Propuesto", "Seleccionado", "Implementado", "No aplicable"];
export const ORIGENES_CONTROL = ["catalogo", "IA", "usuario"];
export const TIPOS_ACTIVIDAD = ["Rutinaria", "No rutinaria"];
