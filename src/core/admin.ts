import type { FastifyInstance, FastifyReply } from 'fastify';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ZodError } from 'zod';
import { fromOpenApi, parseOpenApiText } from './openapi.js';
import { defaultPrefix, MockCollection } from './schema.js';
import { prefixConflict } from './server.js';
import type { CollectionStore } from './store.js';
import { fetchText } from './util.js';

export interface ServingStatus {
  port: number;
  /** 지금 올라가 있는 컬렉션들 */
  served: { name: string; prefix: string; routes: number }[];
  /** 접두어 규칙에 걸려 못 올린 컬렉션들 */
  skipped: { name: string; reason: string }[];
  updatedAt: string | null;
}

/** GET /__admin/api/status 응답 */
export type AdminStatus = ServingStatus & { store: string };

export interface AdminOptions {
  store: CollectionStore;
  /** 저장소 종류 표시용 ("dir" | "file" | "memory") */
  storeKind: string;
  /** 컬렉션이 저장/삭제됐을 때 호출 (같은 프로세스 즉시 반영용) */
  onChange?: (name: string) => void | Promise<void>;
  /** 현재 서빙 정보 */
  current: () => ServingStatus;
  /** 어드민 화면(Vite 빌드 결과) 폴더. 기본: 이 파일 기준 ../web */
  webDir?: string;
}

const errMsg = (e: unknown) =>
  e instanceof ZodError ? e.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ') : (e as Error).message;

// 핸들러가 던지면(검증 실패, fetch 실패 등) 400 + 메시지로
const guard = async <T>(reply: FastifyReply, fn: () => Promise<T>) => {
  try {
    return await fn();
  } catch (e) {
    return reply.status(400).send({ error: errMsg(e) });
  }
};

// 빌드 안 됐을 때 보여줄 안내
const NOT_BUILT = `<!doctype html><meta charset="utf-8"><title>mockatoo admin</title>
<body style="font-family:sans-serif;padding:40px;color:#333">
<h2>🦜 어드민 화면이 아직 빌드되지 않았어요</h2>
<p>다음 중 하나를 하세요.</p>
<ul>
<li><code>pnpm build</code> 후 서버를 다시 실행</li>
<li>개발 중이면 <code>pnpm dev:web</code> 을 띄우고 <a href="http://localhost:5173/__admin/">http://localhost:5173/__admin/</a> 로 접속 (API 는 이 서버로 프록시됨)</li>
</ul>
<p>API 는 지금도 동작합니다: <a href="/__admin/api/status">/__admin/api/status</a></p></body>`;

// /__admin 아래에 화면 + JSON API 를 붙인다
export async function registerAdmin(app: FastifyInstance, opts: AdminOptions) {
  const { store } = opts;
  const notify = async (name: string) => opts.onChange?.(name);

  // 저장 전에 다른 컬렉션들과 접두어가 부딪히는지 본다
  const checkPrefix = async (name: string, prefix: string) => {
    const others = (await store.list()).filter((d) => d.name !== name);
    return prefixConflict({ name, prefix }, others);
  };

  // ── 화면 ──────────────────────────────────────────────
  // 빌드 후(dist/core → dist/web) 와 tsx 로 소스 실행할 때(src/core → dist/web) 둘 다 찾는다
  const here = path.dirname(fileURLToPath(import.meta.url));
  const isBuilt = (dir: string) => existsSync(path.join(dir, 'index.html')) && existsSync(path.join(dir, 'assets'));
  const candidates = opts.webDir ? [opts.webDir] : [path.resolve(here, '../web'), path.resolve(here, '../../dist/web')];
  const webDir = candidates.find(isBuilt) ?? candidates[0];
  const built = isBuilt(webDir);
  app.get('/__admin', async (_req, reply) => reply.redirect('/__admin/'));
  if (built) {
    await app.register(fastifyStatic, { root: webDir, prefix: '/__admin/', decorateReply: false });
  } else {
    app.get('/__admin/', async (_req, reply) => reply.type('text/html; charset=utf-8').send(NOT_BUILT));
  }

  // ── API ───────────────────────────────────────────────
  app.get('/__admin/api/status', async (): Promise<AdminStatus> => ({
    store: opts.storeKind,
    ...opts.current()
  }));

  app.get('/__admin/api/collections', async () => store.list());

  app.get<{ Params: { name: string } }>('/__admin/api/collections/:name', async (req, reply) => {
    const found = await store.get(req.params.name);
    return found ?? reply.status(404).send({ error: `컬렉션 없음: ${req.params.name}` });
  });

  app.put<{ Params: { name: string } }>('/__admin/api/collections/:name', (req, reply) =>
    guard(reply, async () => {
      const collection = MockCollection.parse(req.body);
      const conflict = await checkPrefix(req.params.name, collection.prefix);
      if (conflict) return reply.status(409).send({ error: conflict });
      const saved = await store.save(req.params.name, collection);
      await notify(req.params.name);
      return saved;
    })
  );

  app.delete<{ Params: { name: string } }>('/__admin/api/collections/:name', (req, reply) =>
    guard(reply, async () => {
      const ok = await store.remove(req.params.name);
      if (!ok) return reply.status(404).send({ error: `컬렉션 없음: ${req.params.name}` });
      await notify(req.params.name);
      return { ok: true };
    })
  );

  // OpenAPI URL(또는 본문 텍스트)을 받아 mock 컬렉션로 바꿔 저장
  app.post<{
    Body: { url?: string; text?: string; name: string; headers?: Record<string, string>; prefix?: string };
  }>('/__admin/api/import', (req, reply) =>
    guard(reply, async () => {
      const { url, text, name, headers = {}, prefix } = req.body ?? ({} as never);
      if (!name) return reply.status(400).send({ error: 'name 이 필요합니다' });
      if (!text && !url) return reply.status(400).send({ error: 'url 또는 text 가 필요합니다' });
      const raw = text || (await fetchText(url!, headers));
      const prev = await store.get(name);
      // 접두어: 요청 > 기존 값 > 이름으로 만든 기본값
      const collection = MockCollection.parse({
        ...fromOpenApi(parseOpenApiText(raw), { name }),
        prefix: prefix ?? prev?.collection.prefix ?? defaultPrefix(name)
      });
      const conflict = await checkPrefix(name, collection.prefix);
      if (conflict) return reply.status(409).send({ error: conflict });
      const saved = await store.save(name, collection);
      await notify(name);
      return saved;
    })
  );
  // 실제 API 를 대신 호출해 상태·헤더·본문을 돌려준다 (라우트 "API 에서 가져오기" 용. 브라우저 CORS 우회)
  app.post<{ Body: { method?: string; url: string; headers?: Record<string, string>; body?: string } }>('/__admin/api/probe', (req, reply) =>
    guard(reply, async () => {
      const { method = 'GET', url, headers = {}, body } = req.body ?? ({} as never);
      if (!url) return reply.status(400).send({ error: 'url 이 필요합니다' });
      const m = method.toUpperCase();
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 15_000);
      const res = await fetch(url, { method: m, headers, body: m === 'GET' || m === 'HEAD' ? undefined : body, signal: ac.signal }).finally(() => clearTimeout(timer));
      const text = await res.text();
      let parsed: unknown = text;
      try {
        parsed = JSON.parse(text);
      } catch {
        /* JSON 아니면 문자열 그대로 */
      }
      const ct = res.headers.get('content-type');
      return { status: res.status, headers: ct ? { 'content-type': ct } : {}, body: parsed, path: new URL(url).pathname };
    })
  );
}
