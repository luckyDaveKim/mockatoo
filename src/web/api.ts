import type { CollectionSummary, MockCollection, Status, StoredCollection } from './types';

/** 어드민 API 실패. message 는 한 줄 요약, detail 은 요청·상태·응답 본문 전체 */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly detail: string
  ) {
    super(message);
  }
}

/** 에러 → 사람이 볼 상세 텍스트 (ApiError 면 detail, 아니면 stack) */
export const errorDetail = (e: unknown) => (e instanceof ApiError ? e.detail : e instanceof Error ? e.stack ?? e.message : String(e));

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const url = '/__admin/api' + path;
  const r = await fetch(url, init);
  const text = await r.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!r.ok) {
    // 우리 API 는 { error }, Fastify 기본 에러는 { error: "Internal Server Error", message: 실제 이유 } → message 를 먼저 본다
    const d = data as { error?: string; message?: string } | null;
    const msg = d?.message || d?.error || r.statusText;
    throw new ApiError(msg, `${init?.method ?? 'GET'} ${url}\nHTTP ${r.status} ${r.statusText}\n\n${text || '(응답 본문 없음)'}`);
  }
  return data as T;
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body)
});

export const api = {
  status: () => call<Status>('/status'),
  list: () => call<CollectionSummary[]>('/collections'),
  get: (name: string) => call<StoredCollection>(`/collections/${encodeURIComponent(name)}`),
  save: (name: string, collection: MockCollection) => call<StoredCollection>(`/collections/${encodeURIComponent(name)}`, json('PUT', collection)),
  remove: (name: string) => call<{ ok: true }>(`/collections/${encodeURIComponent(name)}`, { method: 'DELETE' }),
  importOpenApi: (body: { url?: string; text?: string; name: string; headers?: Record<string, string>; prefix?: string }) =>
    call<StoredCollection>('/import', json('POST', body)),
  probe: (body: { method: string; url: string; headers?: Record<string, string>; body?: string }) =>
    call<ProbeResult>('/probe', json('POST', body))
};

export interface ProbeResult {
  status: number;
  headers: Record<string, string>;
  body: unknown;
  path: string;
}
