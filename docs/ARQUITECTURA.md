# Arquitectura — Reto 01: Agente de Registro como Proveedor

## 1. Problema en una frase
Automatiza el registro de Periferia como proveedor ante sus clientes (8–12
formularios al mes): lee la solicitud, llena el formulario desde el repositorio
maestro, arma el paquete de soportes y lo deja listo para la firma del
representante legal. El agente nunca firma ni envía: prepara y deja la decisión
al humano. Le ahorra tiempo a la analista administrativa.

## 2. Componentes
- **Front de chat**: historial, muestra cada herramienta usada, resalta confirmaciones.
- **Backend / ciclo del agente**: prompt → modelo → herramientas → respuesta.
- **Herramientas tipadas** (las 5 del contrato): leer_solicitud, mapear_campos,
  generar_formulario, armar_paquete, simular_envio.
- **Adaptador LLM**: interfaz propia para no acoplarnos a un proveedor.
- **Matcher semántico (RAG)**: componente nuevo. Dado el nombre de un campo que
  pide el cliente, encuentra el campo del maestro más parecido en significado,
  usando embeddings. Es el "plan B" cuando el glosario no tiene el término exacto.

## 3. Flujo del dato
```
solicitud → [leer_solicitud]    → campos y soportes pedidos
          → [mapear_campos]      → cada campo: lleno / faltante / requiere_confirmación
          → [generar_formulario] → Excel (P0) o PDF (P1) diligenciado
          → [armar_paquete]      → formulario + soportes + checklist + borrador de correo
          → [simular_envio]      → SOLO tras confirmación humana explícita
```

## 4. Los tres estados de un campo (corazón de `mapear_campos`)
| Estado | Significado | Ejemplo |
|---|---|---|
| `lleno` | Se encontró el dato en el maestro, con su ruta. | "NIT" → glosario → `nit` → `900123456`. |
| `faltante` | No existe en el maestro. **Nunca se inventa.** | "Número de certificación OEA" → no está. |
| `requiere_confirmación` | Conjetura con confianza < 0.8, o regla de país. | "Identificación del contribuyente" → se parece a `nit`. |

## 5. Decisión del RAG
- **Dónde vive:** dentro de `mapear_campos` — es el único punto donde hay que
  decidir a qué campo del maestro corresponde lo que pide el cliente.
- **Qué recibe y qué devuelve:** recibe la etiqueta del campo del cliente (ej.
  "Correo del área de facturación"); devuelve el campo del maestro más parecido
  (ej. `contacto_financiero.email`) más un **número de confianza** (0 a 1).
- **Cómo se encadena con el glosario:** primero se intenta el **glosario**
  (coincidencia exacta, barata y segura → `lleno`). Solo si el glosario falla se
  usa el **RAG** (coincidencia por significado). Como el RAG es una conjetura,
  su resultado es `requiere_confirmación`, nunca `lleno`.
- **Por qué propone en vez de autocompletar:** la regla de oro es que el agente
  nunca inventa un valor. Un parecido semántico no es una certeza; por eso se
  propone al humano, que confirma. Un sistema que llena solo mete la pata en
  silencio; este pregunta.

## 6. Decisiones y trade-offs
1. **Glosario primero, RAG como plan B** (no RAG para todo).
   Alternativa descartada: resolver todo con embeddings. Descartada porque el
   glosario es exacto, gratis y determinista; gastar embeddings en términos que
   ya están mapeados es más lento y menos confiable. Trade-off: dos caminos de
   código, a cambio de rapidez y exactitud en el caso común.
2. **El RAG nunca llena solo** (siempre `requiere_confirmación`).
   Alternativa descartada: autocompletar si la confianza es muy alta. Descartada
   para no violar la regla de oro y porque un dato de proveedor mal puesto
   (una cuenta bancaria, un NIT) es caro de corregir. Trade-off: un paso humano
   más, a cambio de cero datos inventados.
3. **Salida Excel (P0) antes que PDF (P1).**
   El formato obligatorio es el Excel en celdas exactas; el PDF es mejora.

## 7. Supuestos
- El repositorio maestro está actualizado (en producción necesita un dueño del dato).
- Los soportes vienen como texto (en producción habrá PDF/escaneos y OCR).
- Un soporte vencido o ausente bloquea "listo para firma"; un campo faltante no.
