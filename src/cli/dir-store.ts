import { mkdir, readdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { MockCollection, toSummary, type CollectionStore } from '../core/index.js';
import { isNotFound, readCollectionFile } from './read-collection-file.js';

// 폴더 하나에 컬렉션 하나당 JSON 파일 하나 (<이름>.json). 어드민이 만들고 지우고 저장한다.
export class JsonDirStore implements CollectionStore {
  constructor(readonly dir: string) {}

  async init() {
    await mkdir(this.dir, { recursive: true });
  }

  // 파일 이름에 쓸 수 없는 이름은 거절 (경로 탈출 방지)
  file(name: string) {
    if (!name || name !== name.trim() || /[\\/:*?"<>|]/.test(name) || name === '.' || name === '..') {
      throw new Error(`컬렉션 이름에 쓸 수 없는 문자가 있어요: "${name}"`);
    }
    return path.join(this.dir, `${name}.json`);
  }

  private read(name: string) {
    return readCollectionFile(this.file(name), name);
  }

  async list() {
    let files: string[] = [];
    try {
      files = (await readdir(this.dir)).filter((f) => f.endsWith('.json')).sort();
    } catch (e) {
      if (!isNotFound(e)) throw e;
    }
    const out = [];
    for (const f of files) {
      try {
        const s = await this.read(f.slice(0, -5));
        if (s) out.push(toSummary(s));
      } catch (e) {
        console.error(`⚠ ${f} 읽기 실패 (건너뜀): ${(e as Error).message}`);
      }
    }
    return out;
  }

  async get(name: string) {
    return this.read(name);
  }

  async save(name: string, collection: unknown) {
    const parsed = MockCollection.parse(collection);
    await mkdir(this.dir, { recursive: true });
    await writeFile(this.file(name), JSON.stringify(parsed, null, 2) + '\n', 'utf8');
    return (await this.read(name))!;
  }

  async remove(name: string) {
    try {
      await unlink(this.file(name));
      return true;
    } catch (e) {
      if (isNotFound(e)) return false;
      throw e;
    }
  }
}
