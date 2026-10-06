// Herramientas del agente (contrato): cada export es una herramienta cuyo nombre
// visible para el modelo es proveedor_<export>. Envuelven las funciones de
// proveedor.ts y devuelven un string JSON { ok, data } | { ok:false, error }.

import { z } from "zod";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  leerSolicitud,
  mapearCampos,
  generarFormulario,
  armarPaquete,
  simularEnvio,
} from "./proveedor.ts";
import { construirIndice, type ItemIndice } from "../rag.ts";

export type Ctx = { directory: string; sessionId: string };
export type Tool = {
  description: string;
  args: z.ZodRawShape;
  execute: (args: Record<string, unknown>, ctx: Ctx) => Promise<string>;
};

const ok = (data: unknown) => JSON.stringify({ ok: true, data });
const fail = (error: string) => JSON.stringify({ ok: false, error });

const HOY = "2026-10-05"; // fecha de referencia determinista

// El índice del RAG se construye una sola vez (es caro) y se reutiliza.
let _indice: ItemIndice[] | null = null;
async function indice(dir: string): Promise<ItemIndice[]> {
  if (!_indice) {
    const glosario = JSON.parse(
      readFileSync(join(dir, "fixtures", "reto-01", "glosario-campos.json"), "utf8"),
    ) as Record<string, string>;
    _indice = await construirIndice(glosario);
  }
  return _indice;
}

export const leer_solicitud: Tool = {
  description: "Lee la solicitud de un caso: país, cliente, formato, campos y soportes pedidos.",
  args: { caso: z.string().describe("Carpeta del caso en fixtures/reto-01/casos/") },
  async execute(args, ctx) {
    try {
      return ok(leerSolicitud(String(args.caso), ctx.directory));
    } catch (e) {
      return fail(`No se pudo leer la solicitud: ${(e as Error).message}`);
    }
  },
};

export const mapear_campos: Tool = {
  description: "Mapea cada campo pedido contra el maestro (glosario + RAG). Devuelve llenos, faltantes y requiere_confirmación.",
  args: { caso: z.string().describe("Carpeta del caso") },
  async execute(args, ctx) {
    try {
      const sol = leerSolicitud(String(args.caso), ctx.directory);
      const idx = await indice(ctx.directory);
      const m = await mapearCampos(sol.campos, sol.pais, ctx.directory, idx);
      return ok(m);
    } catch (e) {
      return fail(`No se pudo mapear: ${(e as Error).message}`);
    }
  },
};

export const generar_formulario: Tool = {
  description: "Genera el formulario en el formato pedido (xlsx/pdf/portal) con los valores mapeados.",
  args: { caso: z.string().describe("Carpeta del caso") },
  async execute(args, ctx) {
    try {
      const sol = leerSolicitud(String(args.caso), ctx.directory);
      const idx = await indice(ctx.directory);
      const m = await mapearCampos(sol.campos, sol.pais, ctx.directory, idx);
      return ok(await generarFormulario(String(args.caso), ctx.directory, m));
    } catch (e) {
      return fail(`No se pudo generar el formulario: ${(e as Error).message}`);
    }
  },
};

export const armar_paquete: Tool = {
  description: "Arma el paquete: soportes, checklist (presentes/vencidos/ausentes) y si está listo para firma.",
  args: { caso: z.string().describe("Carpeta del caso") },
  async execute(args, ctx) {
    try {
      return ok(armarPaquete(String(args.caso), ctx.directory, HOY));
    } catch (e) {
      return fail(`No se pudo armar el paquete: ${(e as Error).message}`);
    }
  },
};

export const simular_envio: Tool = {
  description: "Simula el envío del paquete. SOLO procede si confirmado=true.",
  args: {
    caso: z.string().describe("Carpeta del caso"),
    confirmado: z.boolean().optional().describe("true si el usuario confirmó explícitamente"),
  },
  async execute(args, ctx) {
    const r = simularEnvio(String(args.caso), ctx.directory, args.confirmado === true);
    return r.ok ? ok(r) : fail(r.error ?? "requiere confirmación");
  },
};

export const tools: Record<string, Tool> = {
  proveedor_leer_solicitud: leer_solicitud,
  proveedor_mapear_campos: mapear_campos,
  proveedor_generar_formulario: generar_formulario,
  proveedor_armar_paquete: armar_paquete,
  proveedor_simular_envio: simular_envio,
};
