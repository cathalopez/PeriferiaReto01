// ───────────────────────────────────────────────────────────────────────────
// RAG — Recuperación semántica de campos
// ───────────────────────────────────────────────────────────────────────────
// Idea: cuando el glosario NO conoce la etiqueta exacta que pide el cliente,
// buscamos la etiqueta CONOCIDA (del glosario) que más se le parece EN
// SIGNIFICADO, usando embeddings. El glosario es nuestro "corpus".
//
// Los tres movimientos del RAG, aplicados aquí:
//   1. INDEXAR   → convertir cada etiqueta del glosario en un vector (embedding).
//   2. RECUPERAR → convertir la etiqueta del cliente en vector y buscar la más
//                  parecida por similitud coseno.
//   3. (AUMENTAR)→ el resultado se entrega a mapear_campos, que decide si
//                  proponerlo (requiere_confirmación) o descartarlo (faltante).
// ───────────────────────────────────────────────────────────────────────────

import { pipeline, type FeatureExtractionPipeline } from "@xenova/transformers";

// ── 1) El modelo de embeddings (se carga una sola vez, perezosamente) ──
// all-MiniLM-L6-v2: modelo pequeño (~30 MB) que convierte una frase en un
// vector de 384 números. Corre LOCAL en tu máquina; no necesita clave de API.
let _extractor: FeatureExtractionPipeline | null = null;

async function cargarModelo(): Promise<FeatureExtractionPipeline> {
  if (!_extractor) {
    // La primera vez descarga el modelo (una sola vez; luego queda en caché).
    _extractor = (await pipeline(
      "feature-extraction",
      "Xenova/all-MiniLM-L6-v2",
    )) as FeatureExtractionPipeline;
  }
  return _extractor;
}

/** Convierte una lista de textos en una lista de vectores (embeddings). */
export async function embed(textos: string[]): Promise<number[][]> {
  const modelo = await cargarModelo();
  // pooling "mean" = promedia los tokens para tener un vector por frase.
  // normalize true = deja cada vector con "largo" 1 (así el producto punto
  // ES directamente la similitud coseno).
  const salida = await modelo(textos, { pooling: "mean", normalize: true });
  return salida.tolist() as number[][];
}

/**
 * Similitud coseno entre dos vectores. Como los embeddings ya vienen
 * normalizados, basta el producto punto (multiplicar posición a posición y
 * sumar). Devuelve un número entre ~0 (nada que ver) y 1 (mismo significado).
 */
export function similitudCoseno(a: number[], b: number[]): number {
  let suma = 0;
  for (let i = 0; i < a.length; i++) suma += (a[i] ?? 0) * (b[i] ?? 0);
  return suma;
}

// ── 2) El índice: cada etiqueta del glosario, con su clave y su vector ──
export type ItemIndice = { etiqueta: string; clave: string; vector: number[] };

/** INDEXAR: convierte todas las etiquetas del glosario en vectores, una vez. */
export async function construirIndice(
  glosario: Record<string, string>,
): Promise<ItemIndice[]> {
  const etiquetas = Object.keys(glosario);
  const vectores = await embed(etiquetas);
  return etiquetas.map((etiqueta, i) => ({
    etiqueta,
    clave: glosario[etiqueta]!,
    vector: vectores[i]!,
  }));
}

/**
 * RECUPERAR: dada una etiqueta desconocida, devuelve la etiqueta del glosario
 * más parecida en significado, su clave, y la confianza (la similitud coseno).
 */
export async function buscarMasParecido(
  etiqueta: string,
  indice: ItemIndice[],
): Promise<{ clave: string; etiquetaParecida: string; confianza: number }> {
  const [vectorConsulta] = await embed([etiqueta]);
  let mejor = indice[0]!;
  let mejorSim = -1;
  for (const item of indice) {
    const sim = similitudCoseno(vectorConsulta!, item.vector);
    if (sim > mejorSim) {
      mejorSim = sim;
      mejor = item;
    }
  }
  return {
    clave: mejor.clave,
    etiquetaParecida: mejor.etiqueta,
    confianza: mejorSim,
  };
}
