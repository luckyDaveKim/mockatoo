// 서버(core/cli)와 어드민 화면(web)이 함께 쓰는 작은 도구들. 런타임 의존성 없음 (zod 도 안 씀 — web 번들에 들어감)

/** 컬렉션별 경로 접두어. "/shop" 처럼 앞에 / 하나, 뒤에는 / 없음. 비어 있으면 루트(접두어 없음) */
export const normalizePrefix = (p: string) => {
  const t = p.trim().replace(/^\/+/, '').replace(/\/+$/, '');
  return t ? '/' + t : '';
};

/** 이름으로 기본 접두어 만들기: 쓸 수 없는 문자는 - 로 */
export const defaultPrefix = (name: string) => normalizePrefix(name.replace(/[^A-Za-z0-9._~-]+/g, '-').replace(/^-+|-+$/g, '') || 'mock');

/** JSON 객체/배열처럼 시작하는 텍스트인지 */
export const looksLikeJson = (s: string) => /^\s*[[{]/.test(s);

/**
 * "Key: Value" 줄들을 헤더 객체로.
 * strict 면 형식이 틀린 줄에서 에러, 아니면 조용히 건너뛴다 (화면 입력용)
 */
export function parseHeaders(lines: Iterable<string> = [], strict = false): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of lines) {
    const i = line.indexOf(':');
    if (i <= 0) {
      if (strict && line.trim()) throw new Error(`헤더 형식이 잘못됨 (Key: Value): ${line}`);
      continue;
    }
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return out;
}

/** URL 에서 텍스트 가져오기. 2xx 아니면 에러 */
export async function fetchText(url: string, headers: Record<string, string> = {}, init: RequestInit = {}): Promise<string> {
  const res = await fetch(url, { ...init, headers });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.text();
}
