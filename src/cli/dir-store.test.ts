import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { JsonDirStore } from './dir-store.js';

let dir: string;
beforeEach(async () => (dir = await mkdtemp(path.join(tmpdir(), 'mockatoo-'))));
afterEach(() => rm(dir, { recursive: true, force: true }));

const collection = { name: 'a', routes: [{ method: 'GET', path: '/x', responses: [{ body: 'ok' }] }] };

describe('JsonDirStore', () => {
  it('저장하면 <이름>.json 파일이 생기고, 목록/조회/삭제가 된다', async () => {
    const s = new JsonDirStore(dir);
    await s.init();
    expect(await s.list()).toEqual([]);

    const saved = await s.save('a', collection);
    expect(saved.collection.routes).toHaveLength(1);
    expect(JSON.parse(await readFile(path.join(dir, 'a.json'), 'utf8')).name).toBe('a');
    expect((await s.list()).map((d) => d.name)).toEqual(['a']);

    expect(await s.remove('a')).toBe(true);
    expect(await s.remove('a')).toBe(false);
    expect(await s.get('a')).toBeNull();
  });

  it('위험한 이름은 거절', async () => {
    const s = new JsonDirStore(dir);
    await expect(s.save('../evil', collection)).rejects.toThrow();
    await expect(s.save('a/b', collection)).rejects.toThrow();
  });

  it('깨진 파일은 목록에서 건너뛴다', async () => {
    const s = new JsonDirStore(dir);
    await s.save('good', collection);
    await (await import('node:fs/promises')).writeFile(path.join(dir, 'bad.json'), '{ not json', 'utf8');
    expect((await s.list()).map((d) => d.name)).toEqual(['good']);
  });
});
