// 서버 스키마의 타입만 가져다 쓴다 (zod 런타임은 번들에 안 들어감)
import type { MockCollection, Route, Response, Rule, Folder } from '../core/schema.js';
import type { CollectionSummary, StoredCollection } from '../core/store.js';
import type { AdminStatus } from '../core/admin.js';
import { looksLikeJson } from '../core/util.js';
export type { MockCollection, Route, Response, Rule, Folder, CollectionSummary, StoredCollection };
export type Status = AdminStatus;
export { defaultPrefix, looksLikeJson, normalizePrefix, parseHeaders } from '../core/util.js';

export type Method = Route['method'];
export const METHODS: Method[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

export const STATUS_CODES: [number, string][] = [
  [200, 'OK'], [201, 'Created'], [202, 'Accepted'], [204, 'No Content'],
  [301, 'Moved Permanently'], [302, 'Found'], [304, 'Not Modified'],
  [400, 'Bad Request'], [401, 'Unauthorized'], [403, 'Forbidden'], [404, 'Not Found'],
  [405, 'Method Not Allowed'], [409, 'Conflict'], [422, 'Unprocessable Entity'], [429, 'Too Many Requests'],
  [500, 'Internal Server Error'], [502, 'Bad Gateway'], [503, 'Service Unavailable'], [504, 'Gateway Timeout']
];

export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));

// 저장된 컬렉션의 라우트·응답에 화면용 id 가 없으면 채워 넣는다
export function withIds(collection: MockCollection): MockCollection {
  return {
    ...collection,
    routes: collection.routes.map((r) => ({
      ...r,
      id: r.id ?? uid(),
      responses: r.responses.map((x) => (x.id ? x : { ...x, id: uid() }))
    }))
  };
}

export function newRoute(folderId: string | null = null): Route {
  return {
    id: uid(),
    method: 'GET',
    path: '/new-route',
    description: '',
    folderId,
    responses: [newResponse()]
  };
}

export function newResponse(status = 200): Response {
  return { id: uid(), label: '', status, headers: {}, body: { ok: true }, latencyMs: 0, rules: [] };
}

export const bodyToText = (b: Response['body']) => (typeof b === 'string' ? b : JSON.stringify(b, null, 2));

// 텍스트가 JSON 객체/배열이면 파싱해서 저장, 아니면 문자열 그대로
export function textToBody(t: string): Response['body'] {
  if (looksLikeJson(t)) {
    try {
      return JSON.parse(t);
    } catch {
      /* 문자열로 둔다 */
    }
  }
  return t;
}

// JSON 처럼 시작하는데 파싱이 안 되면 오류 메시지, 아니면 null
export function jsonProblem(t: string): string | null {
  if (!looksLikeJson(t)) return null;
  try {
    JSON.parse(t);
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}
