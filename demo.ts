// demo.ts — Flujo completo sin chat: leer → mapear (con RAG) → formulario → paquete.
// La 1ª vez descarga el modelo de embeddings (~30 MB). Corre con: bun run demo.ts

import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  leerSolicitud,
  mapearCampos,
  generarFormulario,
  armarPaquete,
} from "./src/tools/proveedor.ts";
import { construirIndice } from "./src/rag.ts";

const dir = process.cwd();
const HOY = "2026-10-05"; // fecha de referencia (determinista)

rmSync(join(dir, "out"), { recursive: true, force: true });

// Índice del RAG: se construye UNA vez y se reutiliza en todos los casos.
const glosario = JSON.parse(
  readFileSync(join(dir, "fixtures", "reto-01", "glosario-campos.json"), "utf8"),
) as Record<string, string>;
console.log("Indexando el glosario (la 1ª vez baja el modelo)...");
const indice = await construirIndice(glosario);
console.log("Índice listo.\n");

const casos = ["co-industrias-delta", "ec-corp-andina", "hn-agroexport-sula", "pa-logistica-istmo"];

for (const caso of casos) {
  const sol = leerSolicitud(caso, dir);
  const m = await mapearCampos(sol.campos, sol.pais, dir, indice);
  const form = await generarFormulario(caso, dir, m);
  const paq = armarPaquete(caso, dir, HOY);

  console.log("─".repeat(72));
  console.log(`CASO ${caso}  (${sol.cliente}, ${sol.pais}, formato: ${sol.formato})`);
  console.log(`  Campos: ${m.llenos.length} llenos, ${m.requiere_confirmacion.length} a confirmar, ${m.faltantes.length} faltantes`);
  console.log(`  Formulario: ${form.ruta}`);
  console.log(`  Soportes → presentes: [${paq.checklist.presentes.join(", ")}]`);
  if (paq.checklist.vencidos.length) console.log(`            vencidos:  [${paq.checklist.vencidos.join(", ")}]`);
  if (paq.checklist.ausentes.length) console.log(`            ausentes:  [${paq.checklist.ausentes.join(", ")}]`);
  console.log(`  LISTO PARA FIRMA: ${paq.listo_para_firma ? "SÍ ✅" : "NO ⛔"}`);
}
console.log("─".repeat(72));
console.log("\nRevisa la carpeta out/ para ver los formularios y paquetes generados.\n");
