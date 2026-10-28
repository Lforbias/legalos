# LegalOS — imagem de produção (multi-estágio). NÃO foi testada no ambiente de desenvolvimento do assistente
# (sem Docker lá); faça o primeiro build e o teste de fumaça descritos em docs/producao.md.
FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm install --legacy-peer-deps --no-audit --no-fund

FROM deps AS build
COPY . .
ENV BUILD_STANDALONE=1 NEXT_TELEMETRY_DISABLED=1
# DATABASE_URL de mentira só para o build (nenhuma conexão é feita); o real vem do compose em tempo de execução.
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" npx prisma generate && DATABASE_URL="postgresql://build:build@localhost:5432/build" npx next build

# Estágio para aplicar migrações (precisa de tsx e do código): docker compose run --rm migrate
FROM build AS migrate
CMD ["npx", "tsx", "scripts/migrate.ts"]

# Robô dos portais dos tribunais (worker + Chromium). Imagem separada: o app não carrega navegador.
#   docker compose --profile robot build robot && docker compose --profile robot up -d robot
FROM deps AS robot
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN npx playwright-core install --with-deps chromium && rm -rf /var/lib/apt/lists/*
COPY . .
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" npx prisma generate
RUN groupadd -r robot && useradd -r -g robot -d /app robot && chown -R robot:robot /app && chmod -R a+rX /ms-playwright
USER robot
CMD ["npx", "tsx", "scripts/robot-worker.ts"]

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 STORAGE_DIR=/data/storage
# OCR e leitura de PDF (Fase 8b): tesseract + poppler. Sem eles a extração de texto de PDF/imagem fica indisponível.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates tesseract-ocr tesseract-ocr-por tesseract-ocr-eng poppler-utils \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd -r legalos && useradd -r -g legalos -d /app legalos \
  && mkdir -p /data/storage && chown -R legalos:legalos /data
COPY --from=build --chown=legalos:legalos /app/.next/standalone ./
COPY --from=build --chown=legalos:legalos /app/.next/static ./.next/static
COPY --from=build --chown=legalos:legalos /app/public ./public
USER legalos
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
