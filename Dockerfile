# ── 1단계: 빌드 ─────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY tsconfig.json tsconfig.base.json ./
COPY src ./src
RUN pnpm build

# 런타임에 필요한 dependencies 만 남긴다 (devDependencies 제거)
RUN pnpm prune --prod

# ── 2단계: 실행 ─────────────────────────────────────────────
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

# 컬렉션 JSON. n3r 에서 공유 볼륨을 쓰려면 /app/data 에 마운트하면 된다
COPY data/sample.json ./data/

# node 사용자로 실행 (어드민 저장 시 data/ 에 써야 하므로 소유권 부여)
RUN chown -R node:node /app/data
USER node

EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- http://127.0.0.1:4000/__admin/api/status >/dev/null || exit 1

# 컨테이너 안에서는 파일 감시(watch)가 불필요하니 끈다. 필요하면 CMD 를 바꾸면 된다
CMD ["node", "dist/cli/index.js", "start", "-d", "./data", "-p", "4000", "--no-watch"]
