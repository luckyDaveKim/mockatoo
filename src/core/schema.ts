import { z } from 'zod';
import { defaultPrefix, normalizePrefix } from './util.js';

export const Method = z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);

// 요청의 어떤 값을 볼지 → 어떤 값이면 이 응답을 쓸지
export const Rule = z.object({
  target: z.enum(['query', 'header', 'params', 'body']),
  key: z.string(),
  equals: z.string()
});

export const Response = z.object({
  id: z.string().optional(), // 화면에서 탭 구분용. 없으면 UI 가 만들어 넣는다
  label: z.string().default(''), // 화면 표시용 설명
  status: z.number().int().min(100).max(599).default(200),
  headers: z.record(z.string()).default({}),
  body: z.union([z.string(), z.record(z.unknown()), z.array(z.unknown())]).default(''),
  latencyMs: z.number().int().min(0).default(0),
  rules: z.array(Rule).default([]) // 비어 있으면 "기본 응답"
});

export const Route = z.object({
  id: z.string().optional(), // 화면에서 선택/이동용. 없으면 UI 가 만들어 넣는다
  method: Method,
  path: z.string().startsWith('/'),
  description: z.string().default(''),
  folderId: z.string().nullable().default(null), // 화면 정리용. 서버 라우팅엔 영향 없음
  responses: z.array(Response).min(1)
});

// 화면에서 라우트를 묶어 보는 폴더. 서버 동작과는 무관
export const Folder = z.object({
  id: z.string(),
  name: z.string(),
  parentId: z.string().nullable().default(null)
});

export { defaultPrefix, normalizePrefix };

export const Prefix = z
  .string()
  .default('')
  .transform(normalizePrefix)
  .refine((p) => p === '' || /^\/[A-Za-z0-9._~-]+(\/[A-Za-z0-9._~-]+)*$/.test(p), '접두어는 영문/숫자/-_.~ 만 쓸 수 있어요 (예: /shop)')
  .refine((p) => !p.startsWith('/__admin'), '/__admin 은 어드민용 예약 경로예요');

export const MockCollection = z.object({
  name: z.string().default('mock'),
  prefix: Prefix,
  description: z.string().optional(),
  cors: z.boolean().default(true),
  folders: z.array(Folder).default([]),
  routes: z.array(Route)
});

export type Rule = z.infer<typeof Rule>;
export type Response = z.infer<typeof Response>;
export type Route = z.infer<typeof Route>;
export type Folder = z.infer<typeof Folder>;
export type MockCollection = z.infer<typeof MockCollection>;
