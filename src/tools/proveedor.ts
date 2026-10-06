// Herramientas base del agente de Registro como Proveedor.
// Por ahora el mapeo usa SOLO el glosario (coincidencia exacta).
// En la siguiente sesión le agregamos el RAG (coincidencia por significado).

import { readFileSync, existsSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import ExcelJS from "exceljs";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { buscarMasParecido, type ItemIndice } from "../rag.ts";

// Umbral de confianza del RAG: por encima, proponemos (requiere_confirmación);
// por debajo, lo dejamos como faltante. Es ajustable (lo calibramos con pruebas).
const UMBRAL_RAG = 0.5;

// ───────────────────────── Tipos ─────────────────────────

export type Campo = { etiqueta: string; obligatorio?: boolean };

export type Solicitud = {
  id: string;
  pais: string;
  cliente: string;
  formato: "xlsx" | "pdf" | "portal";
  campos: Campo[];
  soportes: string[];
};

export type CampoLleno = { etiqueta: string; clave: string; valor: unknown };
export type CampoConfirmar = {
  etiqueta: string;
  clave: string;
  valor: unknown;
  motivo: string;
};
export type Mapeo = {
  llenos: CampoLleno[];
  faltantes: { etiqueta: string }[];
  requiere_confirmacion: CampoConfirmar[];
};

// ───────────────────────── Utilidades ─────────────────────────

function leerJSON<T>(ruta: string): T {
  return JSON.parse(readFileSync(ruta, "utf8")) as T;
}

/** Resuelve una ruta con puntos: getByPath(maestro, "banco.numero_cuenta"). */
function getByPath(obj: unknown, ruta: string): unknown {
  return ruta.split(".").reduce<unknown>((acc, parte) => {
    if (acc && typeof acc === "object" && parte in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[parte];
    }
    return undefined;
  }, obj);
}

function fixturesDir(dir: string): string {
  return join(dir, "fixtures", "reto-01");
}

// ───────────────────────── leer_solicitud ─────────────────────────

/** Lee la solicitud de un caso y normaliza los campos y soportes pedidos. */
export function leerSolicitud(caso: string, dir: string): Solicitud {
  const casoDir = join(fixturesDir(dir), "casos", caso);
  const s = leerJSON<{
    id: string;
    pais: string;
    cliente: string;
    formato: "xlsx" | "pdf" | "portal";
  }>(join(casoDir, "solicitud.json"));

  // La plantilla cambia según el formato:
  //  - xlsx  → plantilla-celdas.json (con hoja/celda)
  //  - pdf/portal → plantilla-campos.json (lista de etiquetas)
  let campos: Campo[] = [];
  const rutaCeldas = join(casoDir, "plantilla-celdas.json");
  const rutaCampos = join(casoDir, "plantilla-campos.json");
  if (existsSync(rutaCeldas)) {
    const celdas = leerJSON<{ etiqueta: string }[]>(rutaCeldas);
    campos = celdas.map((c) => ({ etiqueta: c.etiqueta }));
  } else if (existsSync(rutaCampos)) {
    campos = leerJSON<Campo[]>(rutaCampos);
  }

  const soportes = leerJSON<string[]>(join(casoDir, "soportes-exigidos.json"));

  return { id: s.id, pais: s.pais, cliente: s.cliente, formato: s.formato, campos, soportes };
}

// ───────────────────────── mapear_campos (solo glosario) ─────────────────────────

/**
 * Cruza cada campo pedido contra el maestro, usando el glosario.
 * Devuelve cada campo en uno de tres estados: lleno / faltante / requiere_confirmación.
 * Regla de país (RN1): el identificador tributario de otros países se llena con el
 * NIT colombiano pero se marca para confirmar ("identificador extranjero").
 */
export async function mapearCampos(
  campos: Campo[],
  pais: string,
  dir: string,
  indice?: ItemIndice[], // índice del RAG; si no se pasa, solo se usa el glosario
): Promise<Mapeo> {
  const glosario = leerJSON<Record<string, string>>(
    join(fixturesDir(dir), "glosario-campos.json"),
  );
  const maestro = leerJSON<Record<string, unknown>>(
    join(fixturesDir(dir), "repositorio", "maestro.json"),
  );

  const llenos: CampoLleno[] = [];
  const faltantes: { etiqueta: string }[] = [];
  const requiere_confirmacion: CampoConfirmar[] = [];

  for (const campo of campos) {
    const clave = glosario[campo.etiqueta]; // coincidencia EXACTA de texto

    // El glosario no conoce esta etiqueta. Aquí entra el RAG:
    // busca la etiqueta conocida más parecida en significado.
    if (!clave) {
      if (indice) {
        const r = await buscarMasParecido(campo.etiqueta, indice);
        const valorRag = getByPath(maestro, r.clave);
        // Una coincidencia semántica es una CONJETURA, no una certeza:
        // si la confianza supera el umbral, se propone para confirmar;
        // si no, se deja como faltante. Nunca se da por "lleno".
        if (r.confianza >= UMBRAL_RAG && valorRag !== undefined) {
          requiere_confirmacion.push({
            etiqueta: campo.etiqueta,
            clave: r.clave,
            valor: valorRag,
            motivo: `Coincidencia semántica con "${r.etiquetaParecida}" (confianza ${r.confianza.toFixed(2)})`,
          });
        } else {
          faltantes.push({ etiqueta: campo.etiqueta });
        }
      } else {
        faltantes.push({ etiqueta: campo.etiqueta });
      }
      continue;
    }

    const valor = getByPath(maestro, clave);
    if (valor === undefined) {
      faltantes.push({ etiqueta: campo.etiqueta });
      continue;
    }

    // Regla de país: el identificador tributario extranjero se propone, no se da por hecho.
    if (clave === "nit" && pais !== "CO") {
      requiere_confirmacion.push({
        etiqueta: campo.etiqueta,
        clave,
        valor,
        motivo: `Identificador extranjero (${pais}): se propone el NIT colombiano, confirmar`,
      });
      continue;
    }

    llenos.push({ etiqueta: campo.etiqueta, clave, valor });
  }

  return { llenos, faltantes, requiere_confirmacion };
}

// ───────────────────────── generar_formulario ─────────────────────────

/** Mapa etiqueta → valor, tomando los llenos y los que requieren confirmación. */
function valoresPorEtiqueta(mapeo: Mapeo): Map<string, unknown> {
  const m = new Map<string, unknown>();
  for (const c of mapeo.llenos) m.set(c.etiqueta, c.valor);
  for (const c of mapeo.requiere_confirmacion) m.set(c.etiqueta, c.valor);
  return m;
}

function outCaso(dir: string, caso: string): string {
  const p = join(dir, "out", caso);
  mkdirSync(p, { recursive: true });
  return p;
}

/** Quita caracteres que la fuente estándar del PDF no soporta. */
function soloTextoSeguro(s: string): string {
  return s.replace(/[^\x00-\xFF]/g, "?");
}

/**
 * Genera el formulario en el formato pedido:
 *  - xlsx (P0): escribe etiqueta y valor en las celdas exactas de la plantilla.
 *  - pdf  (P1): lista etiqueta: valor en orden.
 *  - portal (P2): no se implementa; deja los valores listos para copiar.
 */
export async function generarFormulario(
  caso: string,
  dir: string,
  mapeo: Mapeo,
): Promise<{ ruta: string; formato: string }> {
  const casoDir = join(fixturesDir(dir), "casos", caso);
  const sol = leerJSON<{ formato: "xlsx" | "pdf" | "portal" }>(
    join(casoDir, "solicitud.json"),
  );
  const valores = valoresPorEtiqueta(mapeo);
  const salida = outCaso(dir, caso);

  if (sol.formato === "xlsx") {
    const celdas = leerJSON<
      { hoja: string; celda_etiqueta: string; etiqueta: string; celda_valor: string }[]
    >(join(casoDir, "plantilla-celdas.json"));
    const wb = new ExcelJS.Workbook();
    for (const c of celdas) {
      const ws = wb.getWorksheet(c.hoja) ?? wb.addWorksheet(c.hoja);
      ws.getCell(c.celda_etiqueta).value = c.etiqueta;
      const v = valores.get(c.etiqueta);
      ws.getCell(c.celda_valor).value = (v ?? "") as string | number;
    }
    const ruta = join(salida, "formulario.xlsx");
    await wb.xlsx.writeFile(ruta);
    return { ruta, formato: "xlsx" };
  }

  if (sol.formato === "pdf") {
    const campos = leerJSON<{ etiqueta: string }[]>(
      join(casoDir, "plantilla-campos.json"),
    );
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    let page = pdf.addPage();
    let y = page.getHeight() - 50;
    for (const campo of campos) {
      const v = valores.get(campo.etiqueta);
      const linea = soloTextoSeguro(`${campo.etiqueta}: ${v ?? "(pendiente)"}`);
      page.drawText(linea, { x: 50, y, size: 11, font });
      y -= 20;
      if (y < 50) {
        page = pdf.addPage();
        y = page.getHeight() - 50;
      }
    }
    const ruta = join(salida, "formulario.pdf");
    writeFileSync(ruta, await pdf.save());
    return { ruta, formato: "pdf" };
  }

  // portal: no se implementa (solo se diseña). Se dejan los valores copiables.
  const campos = leerJSON<{ etiqueta: string }[]>(
    join(casoDir, "plantilla-campos.json"),
  );
  let md = "# Valores para el portal\n\n| Campo | Valor |\n|---|---|\n";
  for (const campo of campos)
    md += `| ${campo.etiqueta} | ${valores.get(campo.etiqueta) ?? "(pendiente)"} |\n`;
  const ruta = join(salida, "valores-portal.md");
  writeFileSync(ruta, md);
  return { ruta, formato: "portal" };
}

// ───────────────────────── armar_paquete ─────────────────────────

export type Checklist = { presentes: string[]; vencidos: string[]; ausentes: string[] };

/**
 * Arma el paquete para firma: copia los soportes exigidos que existan, genera un
 * checklist (presentes / vencidos / ausentes) y un borrador de correo.
 * Regla: un soporte vencido o ausente bloquea "listo_para_firma". Un campo
 * faltante NO lo bloquea (eso se maneja en el mapeo).
 */
export function armarPaquete(
  caso: string,
  dir: string,
  hoy: string,
): { ruta: string; listo_para_firma: boolean; checklist: Checklist } {
  const casoDir = join(fixturesDir(dir), "casos", caso);
  const exigidos = leerJSON<string[]>(join(casoDir, "soportes-exigidos.json"));
  const soportesDir = join(fixturesDir(dir), "repositorio", "soportes");
  const index = leerJSON<
    { tipo: string; archivo: string; vigencia_hasta: string | null }[]
  >(join(soportesDir, "index.json"));

  const paqueteDir = join(outCaso(dir, caso), "paquete");
  mkdirSync(paqueteDir, { recursive: true });

  const presentes: string[] = [];
  const ausentes: string[] = [];
  const vencidos: string[] = [];

  for (const tipo of exigidos) {
    const item = index.find((s) => s.tipo === tipo);
    if (!item) {
      ausentes.push(tipo);
      continue;
    }
    const vencido = item.vigencia_hasta !== null && item.vigencia_hasta < hoy;
    if (vencido) vencidos.push(tipo);
    else presentes.push(tipo);
    const src = join(soportesDir, item.archivo);
    if (existsSync(src)) copyFileSync(src, join(paqueteDir, item.archivo));
  }

  const listo = ausentes.length === 0 && vencidos.length === 0;

  const lista = (xs: string[]) => (xs.length ? xs.map((s) => `- ${s}`).join("\n") : "- (ninguno)");
  const checklistMd =
    `# Checklist de soportes\n\n` +
    `## Presentes y vigentes\n${lista(presentes)}\n\n` +
    `## Vencidos (bloquean firma)\n${lista(vencidos)}\n\n` +
    `## Ausentes (bloquean firma)\n${lista(ausentes)}\n\n` +
    `**Listo para firma:** ${listo ? "SÍ" : "NO"}\n`;
  writeFileSync(join(paqueteDir, "checklist.md"), checklistMd);

  // Borrador de correo (sin datos bancarios, regla RN2).
  const borrador =
    `# Borrador de correo\n\n` +
    `Asunto: Registro como proveedor - Periferia IT Group\n\n` +
    `Estimados,\n\n` +
    `Adjuntamos el formulario de registro diligenciado y los soportes solicitados, ` +
    `para su validación. Quedamos atentos a cualquier observación.\n\n` +
    `Cordialmente,\nPeriferia IT Group S.A.S.\n`;
  writeFileSync(join(paqueteDir, "borrador-correo.md"), borrador);

  return { ruta: paqueteDir, listo_para_firma: listo, checklist: { presentes, vencidos, ausentes } };
}

// ───────────────────────── simular_envio ─────────────────────────

/** "Enviar" aquí solo escribe un archivo, y SOLO si el usuario confirmó. */
export function simularEnvio(
  caso: string,
  dir: string,
  confirmado: boolean,
): { ok: boolean; ruta?: string; error?: string } {
  if (!confirmado) return { ok: false, error: "requiere confirmación explícita" };
  const ruta = join(outCaso(dir, caso), "ENVIO-SIMULADO.md");
  writeFileSync(ruta, `# Envío simulado\n\nCaso: ${caso}\nFecha: ${new Date().toISOString()}\n`);
  return { ok: true, ruta };
}
