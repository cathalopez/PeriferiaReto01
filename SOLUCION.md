# SOLUCIÓN — Reto 01: Agente de Registro como Proveedor

> Candidata: Kelly López · Periferia IT Group
> Stack: TypeScript + Bun · Modelo: Anthropic Claude Haiku 4.5 · Embeddings: all-MiniLM-L6-v2 (local)

## 1. Problema en una frase
Periferia recibe 8–12 solicitudes al mes para registrarse como proveedor ante sus
clientes, y hoy transcribe a mano los mismos datos en formatos distintos. El agente
lee la solicitud, llena el formulario desde el repositorio maestro, arma el paquete de
soportes y lo deja listo para la firma del representante legal. Nunca firma ni envía.
Le duele a la analista administrativa (tiempo y riesgo de error en datos sensibles).

## 2. Arquitectura
```
solicitud → [leer_solicitud] → campos y soportes pedidos
          → [mapear_campos]   → lleno / faltante / requiere_confirmación   (glosario + RAG)
          → [generar_formulario] → Excel (celdas exactas) / PDF / portal
          → [armar_paquete]   → soportes + checklist (vencidos/ausentes) + borrador correo
          → [simular_envio]   → solo tras confirmación humana
```
Separación: **comportamiento** en `agent/prompt.md`, **conocimiento** en
`src/knowledge/`, **ejecución** en `src/tools/`. El RAG vive en `src/rag.ts`.

## 3. Ciclo del agente
En `src/agent.ts`: prompt → modelo → herramientas → respuesta, con tope de iteraciones
y de tokens, y **confirmación humana** (el agente corta el turno y pregunta; solo
procede si el siguiente mensaje confirma). Las herramientas nunca lanzan: devuelven
`{ ok, data }` o `{ ok:false, error }`, y son la única fuente de valores que el agente afirma.

## 4. Elección del modelo
Claude **Haiku 4.5**: la lógica vive en las herramientas, el modelo solo orquesta y
redacta, así que elegí el más económico (fracciones de centavo por caso). Gracias al
adaptador LLM (`src/llm/`), cambiar de proveedor no toca el ciclo.

## 5. El RAG (recuperación semántica de campos) — decisión central
El glosario resuelve las etiquetas conocidas por coincidencia **exacta**. Pero un
cliente puede nombrar un campo de infinitas formas. Cuando el glosario falla, el RAG
(`src/rag.ts`) busca la etiqueta conocida más **parecida en significado** usando
embeddings (all-MiniLM-L6-v2, local, sin clave):
1. **Indexar**: cada etiqueta del glosario → vector (una vez).
2. **Recuperar**: etiqueta desconocida → vector → la más parecida por similitud coseno.
3. **Decidir**: si la confianza supera el umbral (0.5) → `requiere_confirmación`
   (se propone); si no → `faltante`. **Nunca `lleno`**: una coincidencia semántica es
   una conjetura, y la regla de oro es que el agente no inventa valores.

Esto se validó en pruebas: "Correo del área de facturación" se emparejó con
`contacto_financiero.email` (0.85), pero "Teléfono de la empresa" se emparejó mal con
"Nombre de la empresa" (0.69). Que el humano confirme es justo lo que evita que ese
error se cuele en silencio.

## 6. Diseño del portal web (solo documentación)
El formato "portal web con usuario y contraseña" no se implementa; el agente produce
`valores-portal.md` listo para copiar. Para producción: automatización con navegador
controlado o RPA, con límites claros (CAPTCHA, MFA, cambios de layout). Las credenciales
viven en un gestor de secretos, nunca en el repo, el prompt ni los logs; las ingresa el
humano. Mínimo: el ingreso de credenciales y el clic final de "Enviar" son humanos.

## 7. Decisiones y trade-offs
1. **Glosario primero, RAG como plan B**. Alternativa descartada: RAG para todo
   (más lento y menos confiable para términos ya mapeados).
2. **El RAG nunca llena solo** (siempre `requiere_confirmación`). Alternativa
   descartada: autocompletar con alta confianza (riesgo de datos mal puestos en silencio).
3. **Embeddings locales** (sin clave extra). Alternativa descartada: API de embeddings
   (otra cuenta y costo); el modelo local basta y es gratis.

## 8. Supuestos
- El repositorio maestro está actualizado.
- Los soportes vienen como texto (en producción habrá PDF/escaneos y OCR).
- Un soporte vencido o ausente bloquea la firma; un campo faltante no.

## 9. Cobertura (historias de usuario)
| HU | Estado | Nota |
|---|---|---|
| HU-1 Leer la solicitud | ✅ | Normaliza xlsx (celdas) y pdf/portal (campos). |
| HU-2 Mapear al maestro | ✅ | Glosario + RAG + regla de país; tres estados. |
| HU-3 Generar formulario | ✅ xlsx y pdf · portal = valores copiables | |
| HU-4 Armar paquete | ✅ | Soportes, checklist, vencidos/ausentes, borrador. |
| HU-5 Manejo de errores | ✅ | Herramientas tipadas que no lanzan. |

## 10. Uso de IA
Usé Claude como par de programación, siguiendo la estructura del método BMAD
(arquitectura → historias → desarrollo iterativo con pruebas). Construí el RAG en pasos
guiados (embeddings, similitud coseno, índice, búsqueda, umbral) y estudié cada parte
para poder explicarla. Declaro el asistente usado; entiendo y puedo defender el código.

## 11. Riesgos para producción
| Riesgo | Mitigación |
|---|---|
| El modelo infiere un valor que no existe | Las herramientas son la única fuente; el RAG propone, no llena. |
| Falsos positivos del RAG | Umbral configurable + confirmación humana; calibrar con casos reales. |
| Datos bancarios expuestos | Solo si la plantilla los pide; nunca en el correo. |
| Soportes vencidos no detectados | Chequeo de vigencia contra la fecha; bloquea la firma. |
