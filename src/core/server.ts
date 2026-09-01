import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import { MockCollection, type Response, type Route, type Rule } from './schema.js';
import { render, type TemplateContext } from './template.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function pick(rule: Rule, ctx: TemplateContext): string | undefined {
  if (rule.target === 'body') {
    return String((ctx.body as Record<string, unknown> | undefined)?.[rule.key] ?? '');
  }
  if (rule.target === 'header') return ctx.headers[rule.key.toLowerCase()];
  return ctx[rule.target][rule.key];
}

export function chooseResponse(responses: Response[], ctx: TemplateContext): Response {
  const matched = responses.find(
    (r) => r.rules.length > 0 && r.rules.every((rule) => pick(rule, ctx) === rule.equals)
  );
  return matched ?? responses.find((r) => r.rules.length === 0) ?? responses[0];
}

function toCtx(req: FastifyRequest): TemplateContext {
  return {
    params: req.params as Record<string, string>,
    query: req.query as Record<string, string>,
    headers: req.headers as Record<string, string>,
    body: req.body
  };
}

// ── 여러 컬렉션을 한 포트에 올리기 ─────────────────────────
/** 정규식 문자가 들어간 경로인지 (Fastify 가 못 다루는 것들) */
export function isRegexPath(path: string): boolean {
  return /[()?+\[\]{}|\\^$]/.test(path);
}

/**
 * 정규식 경로 → RegExp.
 * `:name` 은 이름 있는 그룹, 경로 구분자 뒤의 `*` 는 `.*` 로 바꾸고 나머지는 정규식 그대로 둔다.
 * 예) /dave/pattern(s)?/*  →  ^/dave/pattern(s)?/.*$
 */
export function pathToRegExp(path: string): RegExp {
  const src = path
    .replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, '(?<$1>[^/]+)')
    .replace(/(^|\/)\*/g, '$1.*');
  return new RegExp(`^${src}$`);
}

export interface Named {
  name: string;
  prefix: string;
}

/**
 * 접두어 규칙: 컬렉션끼리 접두어가 같으면 안 되고, 접두어 없는(루트) 컬렉션는 하나만.
 * 어긋나면 이유 문자열, 괜찮으면 null
 */
export function prefixConflict(me: Named, others: Named[]): string | null {
  const other = others.find((o) => o.name !== me.name && o.prefix === me.prefix);
  if (!other) return null;
  return me.prefix
    ? `접두어 "${me.prefix}" 는 이미 "${other.name}" 컬렉션이 쓰고 있어요`
    : `접두어 없는(루트) 컬렉션는 하나만 둘 수 있어요. "${other.name}" 이 이미 루트예요`;
}

export interface ServingPlan<T extends Named> {
  served: T[];
  skipped: { name: string; reason: string }[];
}

/** 컬렉션 목록을 순서대로 보고, 접두어 규칙에 걸리는 뒤쪽 컬렉션는 건너뛴다 */
export function planServing<T extends Named>(collections: T[]): ServingPlan<T> {
  const served: T[] = [];
  const skipped: ServingPlan<T>['skipped'] = [];
  for (const d of collections) {
    const reason = prefixConflict(d, served);
    if (reason) skipped.push({ name: d.name, reason });
    else served.push(d);
  }
  return { served, skipped };
}

export interface CreateServerOptions {
  /** 라우트 등록 전에 앱에 뭔가(어드민 등) 더 붙이고 싶을 때 */
  extend?: (app: FastifyInstance) => void | Promise<void>;
  logger?: boolean;
  /** 리슨 포트 (기본 4000) */
  port?: number;
}

/**
 * 컬렉션 하나 또는 여러 개를 받아 한 서버에 올린다.
 * 각 컬렉션의 라우트는 그 컬렉션의 prefix 뒤에 붙는다 (prefix 가 비면 그대로).
 * 접두어 충돌 검사는 호출 쪽(planServing)에서 끝내고 넘겨야 한다.
 */
export async function createServer(raw: unknown, opts: CreateServerOptions = {}) {
  const collections = (Array.isArray(raw) ? raw : [raw]).map((d) => MockCollection.parse(d));
  const port = opts.port ?? 4000;
  const app = Fastify({ logger: opts.logger ?? true, bodyLimit: 10 * 1024 * 1024, exposeHeadRoutes: false });
  if (collections.some((d) => d.cors)) await app.register(cors, { origin: true });
  await opts.extend?.(app);

  const serve = async (route: Route, ctx: TemplateContext, reply: FastifyReply) => {
    const res = chooseResponse(route.responses, ctx);
    if (res.latencyMs) await sleep(res.latencyMs);
    reply.status(res.status).headers(res.headers);
    const out = render(res.body, ctx);
    if (!res.headers['content-type']) reply.type('application/json');
    return out;
  };

  // 정규식 경로는 Fastify 라우터에 못 올리니 따로 모아, 일반 라우트에 안 걸렸을 때 순서대로 맞춰본다
  const regexRoutes: { method: string; re: RegExp; route: Route }[] = [];

  for (const collection of collections) {
    for (const route of collection.routes) {
      const url = collection.prefix + route.path;
      if (isRegexPath(route.path)) {
        regexRoutes.push({ method: route.method, re: pathToRegExp(url), route });
        continue;
      }
      app.route({
        method: route.method,
        url,
        handler: (req, reply) => serve(route, toCtx(req), reply)
      });
    }
  }

  if (regexRoutes.length > 0) {
    app.setNotFoundHandler((req, reply) => {
      const pathname = req.url.split('?')[0];
      const hit = regexRoutes.find((r) => r.method === req.method && r.re.test(pathname));
      if (!hit) return reply.status(404).send({ message: `Route ${req.method}:${req.url} not found`, error: 'Not Found', statusCode: 404 });
      const m = hit.re.exec(pathname);
      const params = { ...(m?.groups ?? {}) } as Record<string, string>;
      return serve(hit.route, { ...toCtx(req), params }, reply);
    });
  }

  const routes = collections.reduce((n, d) => n + d.routes.length, 0);
  return {
    app,
    collections,
    port,
    routes,
    listen: () => app.listen({ port, host: '0.0.0.0' })
  };
}
