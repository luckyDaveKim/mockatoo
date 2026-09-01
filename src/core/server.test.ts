import { describe, it, expect } from 'vitest';
import { chooseResponse, createServer, isRegexPath, pathToRegExp, planServing } from './server.js';
import { render } from './template.js';

const ctx = { params: { id: '1' }, query: { v: 'x' }, headers: {}, body: {} };

describe('chooseResponse', () => {
  it('규칙이 맞으면 그 응답, 아니면 기본 응답', () => {
    const rs = [
      { status: 200, headers: {}, body: 'ok', latencyMs: 0, rules: [] },
      { status: 404, headers: {}, body: 'nope', latencyMs: 0, rules: [{ target: 'params' as const, key: 'id', equals: '9' }] }
    ];
    expect(chooseResponse(rs, ctx).status).toBe(200);
    expect(chooseResponse(rs, { ...ctx, params: { id: '9' } }).status).toBe(404);
  });
});

describe('render', () => {
  it('urlParam / faker 헬퍼', () => {
    expect(render('{"id":"{{urlParam "id"}}"}', ctx)).toBe('{"id":"1"}');
    expect(render('{{faker "person.firstName"}}', ctx).length).toBeGreaterThan(0);
  });
  it('객체 바디 안의 템플릿도 렌더', () => {
    expect(render({ id: '{{urlParam "id"}}', n: 1 }, ctx)).toBe('{"id":"1","n":1}');
  });
});

describe('여러 컬렉션을 한 포트에 (접두어)', () => {
  const ping = [{ method: 'GET', path: '/ping', responses: [{ body: { ok: true } }] }];

  it('planServing: 접두어 중복·루트 2개는 뒤쪽을 건너뛴다', () => {
    const plan = planServing([
      { name: 'a', prefix: '' },
      { name: 'b', prefix: '/b' },
      { name: 'c', prefix: '' },
      { name: 'd', prefix: '/b' }
    ]);
    expect(plan.served.map((d) => d.name)).toEqual(['a', 'b']);
    expect(plan.skipped.map((d) => d.name)).toEqual(['c', 'd']);
    expect(plan.skipped[0].reason).toContain('a');
    expect(plan.skipped[1].reason).toContain('/b');
  });

  it('각 컬렉션의 라우트가 접두어 뒤에 붙는다', async () => {
    const { app, routes } = await createServer(
      [
        { name: 'root', routes: ping },
        { name: 'shop', prefix: '/shop', routes: [{ method: 'GET', path: '/items', responses: [{ body: [1] }] }] }
      ],
      { logger: false }
    );
    expect(routes).toBe(2);
    expect((await app.inject('/ping')).json()).toEqual({ ok: true });
    expect((await app.inject('/shop/items')).json()).toEqual([1]);
    expect((await app.inject('/items')).statusCode).toBe(404);
    expect((await app.inject('/shop/ping')).statusCode).toBe(404);
  });

  it('prefix 정규화: 앞뒤 슬래시 정리', async () => {
    const { collections } = await createServer({ name: 'x', prefix: 'a/b/', routes: [] }, { logger: false });
    expect(collections[0].prefix).toBe('/a/b');
  });
});

describe('정규식 경로', () => {
  it('isRegexPath / pathToRegExp', () => {
    expect(isRegexPath('/users/:id')).toBe(false);
    expect(isRegexPath('/files/*')).toBe(false);
    expect(isRegexPath('/dave/pattern(s)?/*')).toBe(true);
    const re = pathToRegExp('/dave/pattern(s)?/:id/*');
    expect(re.test('/dave/pattern/7/a/b')).toBe(true);
    expect(re.test('/dave/patterns/7/')).toBe(true);
    expect(re.exec('/dave/patterns/7/x')?.groups?.id).toBe('7');
    expect(re.test('/dave/patternss/7/x')).toBe(false);
  });

  it('서버에서 정규식 경로가 맞고 params 도 나온다', async () => {
    const srv = await createServer(
      {
        name: 't',
        routes: [
          { method: 'GET', path: '/plain', responses: [{ body: { plain: true } }] },
          { method: 'GET', path: '/dave/pattern(s)?/:id/*', responses: [{ body: '{"id":"{{urlParam "id"}}"}' }] }
        ]
      },
      { logger: false }
    );
    const a = await srv.app.inject({ method: 'GET', url: '/dave/patterns/42/whatever?x=1' });
    expect(a.statusCode).toBe(200);
    expect(a.json()).toEqual({ id: '42' });
    const b = await srv.app.inject({ method: 'GET', url: '/plain' });
    expect(b.json()).toEqual({ plain: true });
    const c = await srv.app.inject({ method: 'POST', url: '/dave/pattern/1/x' });
    expect(c.statusCode).toBe(404);
    const d = await srv.app.inject({ method: 'GET', url: '/nope' });
    expect(d.statusCode).toBe(404);
  });
});
