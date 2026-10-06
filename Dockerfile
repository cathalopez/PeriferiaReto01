FROM oven/bun:1
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
# Pre-descargar el modelo de embeddings para que la 1a peticion sea rapida
RUN bun -e "import('@xenova/transformers').then(t => t.pipeline('feature-extraction','Xenova/all-MiniLM-L6-v2')).then(()=>console.log('modelo precargado')).catch(e=>console.log('prefetch omitido:', e.message))" || true
ENV NODE_ENV=production
EXPOSE 3000
CMD ["bun","run","src/server.ts"]
