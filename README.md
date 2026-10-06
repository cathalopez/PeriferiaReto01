# Agente de Registro como Proveedor — Reto 01 (Periferia IT Group)

Agente conversacional que registra a Periferia como proveedor ante sus clientes: lee la
solicitud, llena el formulario desde el repositorio maestro (con mapeo por glosario y
**RAG semántico** para etiquetas desconocidas), arma el paquete de soportes y lo deja
listo para la firma del representante legal. No firma ni envía.

## Requisitos
- [Bun](https://bun.sh) 1.1+
- Una clave de API de Anthropic (para el chat; la demo `demo.ts` no la necesita).

## Puesta en marcha
```bash
bun install
cp .env.example .env     # edita .env y pon tu ANTHROPIC_API_KEY
bun run dev              # abre http://localhost:3000
```
> La primera ejecución descarga el modelo de embeddings (~30 MB), una sola vez.

## Verificación sin chat (determinista)
```bash
bun run demo.ts          # procesa los 4 casos: mapeo + formulario + paquete
bun run demo-rag.ts      # muestra el RAG emparejando etiquetas desconocidas
```

## Casos
`co-industrias-delta` (CO, Excel) · `ec-corp-andina` (EC, PDF) ·
`hn-agroexport-sula` (HN, Excel) · `pa-logistica-istmo` (PA, portal).

## Estructura
```
agent/prompt.md              comportamiento del agente
src/knowledge/               conocimiento del proceso
src/tools/proveedor.ts       lógica: leer, mapear, generar, armar, enviar
src/tools/registro.ts        las 5 herramientas (contrato del agente)
src/rag.ts                   RAG: embeddings + similitud + búsqueda
src/llm/                     adaptador LLM (interfaz + Anthropic)
src/agent.ts                 ciclo del agente
src/server.ts                API HTTP + front
web/index.html               chat
demo.ts / demo-rag.ts        verificación sin modelo
docs/                        arquitectura y notas
```

## API
`GET /api/health` · `POST /api/chat` (`{sessionId, message}`) · `GET /api/sessions/:id`
