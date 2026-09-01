import YAML from 'yaml';
import { MockCollection, type Route, type Response } from './schema.js';
import { looksLikeJson } from './util.js';

// OpenAPI 3.x (그리고 Swagger 2 의 paths/collections 최소 지원) → MockCollection 변환.
// 목표: "일단 뜨는" mock 만들기. 세부 규칙은 사용자가 결과 JSON 을 다듬는다.

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);

const METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'] as const;

// 문자열 format → faker 템플릿
const STRING_FAKER: Record<string, string> = {
  email: 'internet.email',
  uuid: 'string.uuid',
  uri: 'internet.url',
  url: 'internet.url',
  hostname: 'internet.domainName',
  ipv4: 'internet.ipv4',
  ipv6: 'internet.ipv6',
  'date-time': 'date.recent',
  date: 'date.recent',
  password: 'internet.password'
};

// 속성 이름으로 어울리는 faker 고르기 (format 이 없을 때)
const NAME_FAKER: Array<[RegExp, string]> = [
  [/email/i, 'internet.email'],
  [/(^|_)id$|Id$|uuid/i, 'string.uuid'],
  [/firstName|first_name/i, 'person.firstName'],
  [/lastName|last_name/i, 'person.lastName'],
  [/name/i, 'person.fullName'],
  [/phone/i, 'phone.number'],
  [/url|link|href/i, 'internet.url'],
  [/avatar|image|photo/i, 'image.avatar'],
  [/city/i, 'location.city'],
  [/country/i, 'location.country'],
  [/address|street/i, 'location.streetAddress'],
  [/description|summary|content|text/i, 'lorem.sentence'],
  [/title/i, 'lorem.words'],
  [/created|updated|date|time/i, 'date.recent']
];

export interface FromOpenApiOptions {
  name?: string;
  /** 배열 스키마를 만들 때 넣을 항목 개수 (기본 2) */
  arrayLength?: number;
}

/** JSON 또는 YAML 문자열을 파싱 */
export function parseOpenApiText(text: string): unknown {
  return looksLikeJson(text) ? JSON.parse(text) : YAML.parse(text);
}

export function fromOpenApi(doc: unknown, opts: FromOpenApiOptions = {}): MockCollection {
  if (!isObj(doc) || !isObj(doc.paths)) throw new Error('OpenAPI 문서에 paths 가 없습니다');

  const resolve = makeResolver(doc);
  const info = isObj(doc.info) ? doc.info : {};
  const routes: Route[] = [];

  for (const [rawPath, pathItemRaw] of Object.entries(doc.paths)) {
    const pathItem = resolve(pathItemRaw);
    if (!isObj(pathItem)) continue;
    const path = rawPath.replace(/\{([^}]+)\}/g, ':$1');

    for (const m of METHODS) {
      const op = pathItem[m];
      if (!isObj(op)) continue;
      const responses = buildResponses(op, resolve, opts);
      if (responses.length === 0) responses.push({ label: '', status: 200, headers: {}, body: '', latencyMs: 0, rules: [] });
      const description = String(op.summary ?? op.description ?? '');
      routes.push({ method: m.toUpperCase() as Route['method'], path, description, folderId: null, responses });
    }
  }

  return MockCollection.parse({
    name: opts.name ?? slug(String(info.title ?? 'openapi-mock')),
    cors: true,
    routes
  });
}

function buildResponses(op: Obj, resolve: Resolver, opts: FromOpenApiOptions): Response[] {
  const out: Response[] = [];
  if (!isObj(op.responses)) return out;

  const entries = Object.entries(op.responses)
    .map(([code, r]) => ({ code, res: resolve(r) }))
    .filter((e) => isObj(e.res));

  // 성공(2xx) 을 앞으로. 규칙 없는 응답 중 첫 번째가 기본 응답이 되기 때문.
  const rank = (c: string) => (c.startsWith('2') ? 0 : c === 'default' ? 1 : 2);
  entries.sort((a, b) => rank(a.code) - rank(b.code) || a.code.localeCompare(b.code));

  for (const { code, res } of entries) {
    const r = res as Obj;
    const status = code === 'default' ? 500 : /^\d{3}$/.test(code) ? Number(code) : Number(code.replace(/X/gi, '0'));
    if (!Number.isFinite(status) || status < 100 || status > 599) continue;

    const { body, contentType } = pickBody(r, resolve, opts);
    const headers: Record<string, string> = {};
    if (contentType) headers['content-type'] = contentType;
    if (isObj(r.headers)) {
      for (const [k, hv] of Object.entries(r.headers)) {
        const h = resolve(hv);
        if (isObj(h)) headers[k.toLowerCase()] = String(example(h, resolve, opts, k) ?? '');
      }
    }
    out.push({ label: String(r.description ?? ''), status, headers, body: body as Response['body'], latencyMs: 0, rules: [] });
  }
  return out;
}

function pickBody(res: Obj, resolve: Resolver, opts: FromOpenApiOptions): { body: unknown; contentType?: string } {
  // OpenAPI 3: responses[code].content[mediaType].{example,examples,schema}
  if (isObj(res.content)) {
    const types = Object.keys(res.content);
    const mt = types.find((t) => t.includes('json')) ?? types[0];
    const media = mt ? resolve(res.content[mt]) : undefined;
    if (isObj(media)) {
      if (media.example !== undefined) return { body: media.example, contentType: mt };
      if (isObj(media.examples)) {
        const first = resolve(Object.values(media.examples)[0]);
        if (isObj(first) && first.value !== undefined) return { body: first.value, contentType: mt };
      }
      if (media.schema !== undefined) return { body: example(media.schema, resolve, opts), contentType: mt };
    }
    return { body: '', contentType: mt };
  }
  // Swagger 2: responses[code].{schema, examples}
  if (isObj(res.examples)) return { body: Object.values(res.examples)[0] };
  if (res.schema !== undefined) return { body: example(res.schema, resolve, opts) };
  return { body: '' };
}

// 스키마 → 예시 값. 문자열은 faker 템플릿으로, 숫자/불리언은 고정값으로.
function example(schemaRaw: unknown, resolve: Resolver, opts: FromOpenApiOptions, key = '', depth = 0): unknown {
  const s = resolve(schemaRaw);
  if (!isObj(s) || depth > 8) return null;

  if (s.example !== undefined) return s.example;
  if (s.default !== undefined) return s.default;
  if (Array.isArray(s.enum) && s.enum.length) return s.enum[0];
  if (Array.isArray(s.oneOf) && s.oneOf.length) return example(s.oneOf[0], resolve, opts, key, depth + 1);
  if (Array.isArray(s.anyOf) && s.anyOf.length) return example(s.anyOf[0], resolve, opts, key, depth + 1);
  if (Array.isArray(s.allOf) && s.allOf.length) {
    return Object.assign({}, ...s.allOf.map((x) => example(x, resolve, opts, key, depth + 1) ?? {}));
  }

  const type = Array.isArray(s.type) ? s.type[0] : s.type ?? (isObj(s.properties) ? 'object' : isObj(s.items) ? 'array' : 'string');

  switch (type) {
    case 'object': {
      const out: Obj = {};
      if (isObj(s.properties)) {
        for (const [k, p] of Object.entries(s.properties)) out[k] = example(p, resolve, opts, k, depth + 1);
      }
      return out;
    }
    case 'array': {
      const n = Math.max(0, opts.arrayLength ?? 2);
      return Array.from({ length: n }, () => example(s.items, resolve, opts, key, depth + 1));
    }
    case 'integer':
      return typeof s.minimum === 'number' ? s.minimum : 1;
    case 'number':
      return typeof s.minimum === 'number' ? s.minimum : 1.5;
    case 'boolean':
      return true;
    case 'null':
      return null;
    default: {
      const fmt = typeof s.format === 'string' ? STRING_FAKER[s.format] : undefined;
      const byName = NAME_FAKER.find(([re]) => re.test(key))?.[1];
      return `{{faker "${fmt ?? byName ?? 'lorem.word'}"}}`;
    }
  }
}

type Resolver = (v: unknown) => unknown;

// 문서 내부 $ref("#/components/schemas/User") 만 해결. 외부 파일 참조는 그대로 둠.
function makeResolver(doc: Obj): Resolver {
  const resolveOnce = (v: unknown): unknown => {
    if (!isObj(v) || typeof v.$ref !== 'string' || !v.$ref.startsWith('#/')) return v;
    const target = v.$ref
      .slice(2)
      .split('/')
      .map((p) => p.replace(/~1/g, '/').replace(/~0/g, '~'))
      .reduce<unknown>((o, k) => (isObj(o) ? o[k] : undefined), doc);
    if (target === undefined) throw new Error(`$ref 를 찾을 수 없습니다: ${v.$ref}`);
    return target;
  };
  return (v) => {
    let cur = v;
    for (let i = 0; i < 32 && isObj(cur) && typeof cur.$ref === 'string'; i++) cur = resolveOnce(cur);
    return cur;
  };
}

const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'openapi-mock';
