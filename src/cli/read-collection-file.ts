import { readFile, stat } from 'node:fs/promises';
import { MockCollection, type StoredCollection } from '../core/index.js';

export const isNotFound = (e: unknown) => (e as NodeJS.ErrnoException)?.code === 'ENOENT';

/** 컬렉션 JSON 파일 하나를 읽어 StoredCollection 으로. 파일이 없으면 null (updatedAt = 파일 mtime) */
export async function readCollectionFile(file: string, name: string): Promise<StoredCollection | null> {
  try {
    const [text, st] = await Promise.all([readFile(file, 'utf8'), stat(file)]);
    return { name, collection: MockCollection.parse(JSON.parse(text)), updatedAt: st.mtime.toISOString() };
  } catch (e) {
    if (isNotFound(e)) return null;
    throw e;
  }
}
