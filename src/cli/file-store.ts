import { writeFile } from 'node:fs/promises';
import { MockCollection, toSummary, type CollectionStore } from '../core/index.js';
import { readCollectionFile } from './read-collection-file.js';

// 컬렉션 파일 하나 = 컬렉션 하나. 어드민에서 저장하면 파일에 다시 써서 기존 핫 리로드가 그대로 동작한다.
export class FileStore implements CollectionStore {
  constructor(
    private path: string,
    private name: string
  ) {}

  private read() {
    return readCollectionFile(this.path, this.name);
  }

  async list() {
    const s = await this.read();
    return s ? [toSummary(s)] : [];
  }
  async get(name: string) {
    return name === this.name ? this.read() : null;
  }
  async save(name: string, collection: unknown) {
    if (name !== this.name) throw new Error(`파일 모드에서는 "${this.name}" 하나만 저장할 수 있어요 (-d 폴더 모드를 쓰면 여러 개 가능)`);
    const parsed = MockCollection.parse(collection);
    await writeFile(this.path, JSON.stringify(parsed, null, 2) + '\n', 'utf8');
    return (await this.read())!;
  }
  async remove(): Promise<boolean> {
    throw new Error('파일 모드에서는 삭제할 수 없어요. 파일을 직접 지우세요');
  }
}
