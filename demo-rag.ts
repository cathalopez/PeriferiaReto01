// demo-rag.ts — Muestra el RAG en acción.
// La PRIMERA vez descarga el modelo de embeddings (~30 MB); luego queda en caché.
// Corre con: bun run demo-rag.ts

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { construirIndice, buscarMasParecido } from "./src/rag.ts";

const dir = process.cwd();
const glosario = JSON.parse(
  readFileSync(join(dir, "fixtures", "reto-01", "glosario-campos.json"), "utf8"),
) as Record<string, string>;

console.log("Indexando las", Object.keys(glosario).length, "etiquetas del glosario... (la 1ª vez baja el modelo)");
const indice = await construirIndice(glosario);
console.log("Índice listo.\n");

// Etiquetas que el cliente podría usar y que NO están exactas en el glosario.
const etiquetasDesconocidas = [
  "Correo del área de facturación",     // debería parecerse a contacto_financiero.email
  "Identificación fiscal de la empresa", // debería parecerse a nit
  "Nombre comercial del proveedor",      // debería parecerse a razon_social
  "Teléfono de la empresa",              // debería parecerse a telefono
  "Número de certificación OEA",         // NO tiene equivalente → debería quedar faltante
];

const UMBRAL = 0.5;

for (const etiqueta of etiquetasDesconocidas) {
  const r = await buscarMasParecido(etiqueta, indice);
  const estado = r.confianza >= UMBRAL ? "requiere_confirmación" : "faltante";
  console.log(`"${etiqueta}"`);
  console.log(`   → más parecido: "${r.etiquetaParecida}"  (clave: ${r.clave})`);
  console.log(`   → confianza: ${r.confianza.toFixed(3)}  → ${estado}\n`);
}
