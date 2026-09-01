import { describe, it, expect } from 'vitest';
import { createServer } from './server.js';
import { registerAdmin } from './admin.js';
import { MemoryStore } from './store.js';

const base = { name: 'demo', routes: [{ method: 'GET', path: '/ping', responses: [{ body: { ok: true } }] }] };

async function build() {
  const store = new MemoryStore({ demo: base });
  const changed: string[] = [];
  const { app } = await createServer(base, {
    logger: false,
    extend: (app) =>
      registerAdmin(app, {
        store,
        storeKind: 'memory',
        onChange: (n) => void changed.push(n),
        current: () => ({ port: 0, served: [{ name: 'demo', prefix: '', routes: 1 }], skipped: [], updatedAt: null })
      })
  });
  return { app, store, changed };
}

describe('admin api', () => {
  it('목록/상태/화면', async () => {
    const { app } = await build();
    expect((await app.inject('/__admin/api/status')).json().served[0].name).toBe('demo');
    expect((await app.inject('/__admin/api/collections')).json()).toHaveLength(1);
    const html = await app.inject('/__admin/');
    expect(html.headers['content-type']).toContain('text/html');
    expect(html.body).toContain('mockatoo admin');
  });

  it('PUT 으로 저장하면 onChange 가 불리고, 잘못된 컬렉션는 400', async () => {
    const { app, store, changed } = await build();
    const ok = await app.inject({
      method: 'PUT',
      url: '/__admin/api/collections/demo',
      payload: { ...base, routes: [] }
    });
    expect(ok.statusCode).toBe(200);
    expect((await store.get('demo'))?.collection.routes).toHaveLength(0);
    expect(changed).toEqual(['demo']);

    const bad = await app.inject({ method: 'PUT', url: '/__admin/api/collections/demo', payload: { routes: 'x' } });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error).toContain('routes');
  });

  it('다른 이름을 저장해도 onChange 가 불린다 (모든 컬렉션이 같은 서버에 올라가므로)', async () => {
    const { app, changed } = await build();
    const r = await app.inject({ method: 'PUT', url: '/__admin/api/collections/other', payload: { prefix: '/other', routes: [] } });
    expect(r.statusCode).toBe(200);
    expect(changed).toEqual(['other']);
  });

  it('접두어 규칙: 루트는 하나만, 접두어 중복 금지 → 409', async () => {
    const { app } = await build(); // demo 가 루트('')
    const root2 = await app.inject({ method: 'PUT', url: '/__admin/api/collections/other', payload: { routes: [] } });
    expect(root2.statusCode).toBe(409);
    expect(root2.json().error).toContain('demo');

    expect((await app.inject({ method: 'PUT', url: '/__admin/api/collections/a', payload: { prefix: '/x', routes: [] } })).statusCode).toBe(200);
    const dup = await app.inject({ method: 'PUT', url: '/__admin/api/collections/b', payload: { prefix: 'x/', routes: [] } });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error).toContain('/x');

    // 자기 자신은 충돌 아님
    expect((await app.inject({ method: 'PUT', url: '/__admin/api/collections/a', payload: { prefix: '/x', routes: [] } })).statusCode).toBe(200);
    // 예약 경로
    const bad = await app.inject({ method: 'PUT', url: '/__admin/api/collections/c', payload: { prefix: '/__admin', routes: [] } });
    expect(bad.statusCode).toBe(400);
  });

  it('OpenAPI 텍스트 import', async () => {
    const { app, store } = await build();
    const spec = { openapi: '3.0.0', info: { title: 't' }, paths: { '/pets': { get: { responses: { '200': { description: 'ok' } } } } } };
    const res = await app.inject({
      method: 'POST',
      url: '/__admin/api/import',
      payload: { name: 'pets', text: JSON.stringify(spec) }
    });
    expect(res.statusCode).toBe(200);
    const saved = await store.get('pets');
    expect(saved?.collection.routes.map((r) => r.path)).toEqual(['/pets']);
    expect(saved?.collection.prefix).toBe('/pets'); // 기본 접두어 = /이름
  });

  it('DELETE', async () => {
    const { app, store } = await build();
    expect((await app.inject({ method: 'DELETE', url: '/__admin/api/collections/demo' })).statusCode).toBe(200);
    expect(await store.get('demo')).toBeNull();
    expect((await app.inject({ method: 'DELETE', url: '/__admin/api/collections/demo' })).statusCode).toBe(404);
  });
});
