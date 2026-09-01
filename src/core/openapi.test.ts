import { describe, it, expect } from 'vitest';
import { fromOpenApi, parseOpenApiText } from './openapi.js';
import { render } from './template.js';

const doc = {
  openapi: '3.0.0',
  info: { title: 'Pet Store' },
  paths: {
    '/pets/{id}': {
      get: {
        responses: {
          '404': { description: 'no', content: { 'application/json': { example: { error: 'not found' } } } },
          '200': {
            description: 'ok',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Pet' } } }
          }
        }
      },
      delete: { responses: { '204': { description: 'gone' } } }
    },
    '/pets': {
      get: {
        responses: {
          '200': {
            content: {
              'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Pet' } } }
            }
          }
        }
      }
    }
  },
  components: {
    schemas: {
      Pet: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          name: { type: 'string' },
          email: { type: 'string', format: 'email' },
          status: { type: 'string', enum: ['available', 'sold'] },
          tags: { type: 'array', items: { type: 'string' } },
          owner: { $ref: '#/components/schemas/Owner' }
        }
      },
      Owner: { type: 'object', properties: { firstName: { type: 'string' } } }
    }
  }
};

describe('fromOpenApi', () => {
  const collection = fromOpenApi(doc);

  it('경로 {id} → :id, 메서드별 라우트 생성', () => {
    expect(collection.name).toBe('pet-store');
    const paths = collection.routes.map((r) => `${r.method} ${r.path}`).sort();
    expect(paths).toEqual(['DELETE /pets/:id', 'GET /pets', 'GET /pets/:id']);
  });

  it('2xx 응답이 먼저(기본 응답), $ref 와 스키마를 예시로 변환', () => {
    const get = collection.routes.find((r) => r.method === 'GET' && r.path === '/pets/:id')!;
    expect(get.responses.map((r) => r.status)).toEqual([200, 404]);
    const body = get.responses[0].body as Record<string, unknown>;
    expect(body.id).toBe(1);
    expect(body.status).toBe('available');
    expect(body.email).toBe('{{faker "internet.email"}}');
    expect(body.name).toBe('{{faker "person.fullName"}}');
    expect((body.owner as Record<string, unknown>).firstName).toBe('{{faker "person.firstName"}}');
    expect(Array.isArray(body.tags)).toBe(true);
    expect(get.responses[1].body).toEqual({ error: 'not found' });
  });

  it('배열 스키마는 arrayLength 만큼 항목 생성', () => {
    const list = fromOpenApi(doc, { arrayLength: 3 }).routes.find((r) => r.path === '/pets')!;
    expect((list.responses[0].body as unknown[]).length).toBe(3);
  });

  it('만들어진 템플릿은 실제로 렌더된다', () => {
    const get = collection.routes.find((r) => r.method === 'GET' && r.path === '/pets/:id')!;
    const out = JSON.parse(render(get.responses[0].body, { params: {}, query: {}, headers: {}, body: {} }));
    expect(out.email).toContain('@');
  });

  it('YAML 도 파싱', () => {
    const y = parseOpenApiText('openapi: 3.0.0\npaths:\n  /a:\n    get:\n      responses:\n        "200": {}\n');
    expect(fromOpenApi(y).routes[0].path).toBe('/a');
  });

  it('paths 없으면 에러', () => {
    expect(() => fromOpenApi({ openapi: '3.0.0' })).toThrow();
  });
});
