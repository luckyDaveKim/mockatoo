import { MockCollection } from './schema.js';

// 저장된 mock 컬렉션 한 건
export interface StoredCollection {
  name: string;
  collection: MockCollection;
  updatedAt: string; // ISO 문자열. 변경 감지(폴링)에 사용
}

export interface CollectionSummary {
  name: string;
  prefix: string;
  routes: number;
  updatedAt: string;
}

// 컬렉션을 어디에 보관하든(파일/메모리) 서버와 어드민은 이 인터페이스만 본다
export interface CollectionStore {
  init?(): Promise<void>;
  list(): Promise<CollectionSummary[]>;
  get(name: string): Promise<StoredCollection | null>;
  save(name: string, collection: unknown): Promise<StoredCollection>;
  remove(name: string): Promise<boolean>;
  close?(): Promise<void>;
}

export function toSummary(s: StoredCollection): CollectionSummary {
  return { name: s.name, prefix: s.collection.prefix, routes: s.collection.routes.length, updatedAt: s.updatedAt };
}

// 테스트/URL 모드용. 프로세스가 죽으면 사라진다
export class MemoryStore implements CollectionStore {
  private map = new Map<string, StoredCollection>();

  constructor(seed: Record<string, unknown> = {}) {
    for (const [name, collection] of Object.entries(seed)) {
      this.map.set(name, { name, collection: MockCollection.parse(collection), updatedAt: new Date().toISOString() });
    }
  }

  async list() {
    return [...this.map.values()].map(toSummary);
  }
  async get(name: string) {
    return this.map.get(name) ?? null;
  }
  async save(name: string, collection: unknown) {
    const stored = { name, collection: MockCollection.parse(collection), updatedAt: new Date().toISOString() };
    this.map.set(name, stored);
    return stored;
  }
  async remove(name: string) {
    return this.map.delete(name);
  }
}
