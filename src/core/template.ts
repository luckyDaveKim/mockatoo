import Handlebars from 'handlebars';
import { faker } from '@faker-js/faker';

export interface TemplateContext {
  params: Record<string, string>;
  query: Record<string, string>;
  headers: Record<string, string>;
  body: unknown;
}

const hb = Handlebars.create();

// {{faker "person.fullName"}} 처럼 점 경로로 faker 호출
hb.registerHelper('faker', (path: string) => {
  const fn = path.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], faker);
  return typeof fn === 'function' ? (fn as () => unknown)() : '';
});
hb.registerHelper('urlParam', function (this: TemplateContext, k: string) { return this.params[k] ?? ''; });
hb.registerHelper('queryParam', function (this: TemplateContext, k: string) { return this.query[k] ?? ''; });
hb.registerHelper('header', function (this: TemplateContext, k: string) { return this.headers[k.toLowerCase()] ?? ''; });
hb.registerHelper('json', (v: unknown) => JSON.stringify(v));

const renderStr = (src: string, ctx: TemplateContext) => hb.compile(src, { noEscape: true })(ctx);

// 객체/배열이면 문자열 잎(leaf)만 렌더하고 다시 JSON 으로. 따옴표 이스케이프 문제 방지.
function renderDeep(v: unknown, ctx: TemplateContext): unknown {
  if (typeof v === 'string') return renderStr(v, ctx);
  if (Array.isArray(v)) return v.map((x) => renderDeep(x, ctx));
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, renderDeep(x, ctx)]));
  }
  return v;
}

export function render(body: unknown, ctx: TemplateContext): string {
  if (typeof body === 'string') return renderStr(body, ctx);
  return JSON.stringify(renderDeep(body, ctx));
}
