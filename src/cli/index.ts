#!/usr/bin/env node
import { Command } from 'commander';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { watch } from 'chokidar';
import {
  createServer,
  defaultPrefix,
  fetchText,
  fromOpenApi,
  parseHeaders,
  parseOpenApiText,
  planServing,
  registerAdmin,
  type CollectionStore,
  type StoredCollection
} from '../core/index.js';
import { JsonDirStore } from './dir-store.js';
import { FileStore } from './file-store.js';

const DEFAULT_DATA_DIR = './data';
const DEFAULT_PORT = 4000;

const program = new Command().name('mockatoo').description('JSON 파일로 정의하는 가벼운 mock API 서버');

const isUrl = (s: string) => /^https?:\/\//i.test(s);

// 파일 경로 또는 http(s) URL 에서 텍스트 읽기
const readSource = (src: string, headers: Record<string, string>) => (isUrl(src) ? fetchText(src, headers) : readFile(src, 'utf8'));

// 내용으로 OpenAPI 문서인지 판단 → 맞으면 mock 컬렉션로 변환해서 돌려줌
async function loadCollection(src: string, headers: Record<string, string>) {
  const doc = parseOpenApiText(await readSource(src, headers));
  const isOpenApi = !!doc && typeof doc === 'object' && ('openapi' in doc || 'swagger' in doc);
  const raw = (isOpenApi ? fromOpenApi(doc) : doc) as Record<string, unknown>;
  return { raw, isOpenApi };
}

// ── start ─────────────────────────────────────────────────

interface StartOpts {
  port?: string;
  header?: string[];
  data?: string;
  name?: string;
  admin: boolean;
  watch: boolean;
}

interface OpenedStore {
  store: CollectionStore;
  kind: 'dir' | 'file';
  /** chokidar 가 볼 경로 (파일 하나 또는 폴더) */
  watchTarget: string;
}

/**
 * 어떤 저장소를 쓸지 정하고, 필요하면 source 로 초기 데이터를 넣는다.
 * - mock 컬렉션 JSON 파일 하나 + -d 없음 → 단일 파일 모드 (어드민 저장 = 그 파일 덮어쓰기)
 * - 그 외 → 폴더 모드. 폴더에 같은 이름이 없을 때만 source 를 저장한다
 */
async function openStore(src: string | undefined, opts: StartOpts, headers: Record<string, string>): Promise<OpenedStore> {
  const seed = src ? await loadCollection(src, headers) : null;
  const nameFromSeed = seed && typeof seed.raw.name === 'string' ? seed.raw.name : undefined;
  const name = opts.name ?? nameFromSeed ?? 'default';

  if (src && !isUrl(src) && seed && !seed.isOpenApi && opts.data === undefined) {
    return { store: new FileStore(src, name), kind: 'file', watchTarget: src };
  }

  const dir = opts.data ?? DEFAULT_DATA_DIR;
  const store = new JsonDirStore(dir);
  await store.init();
  const existing = await store.list();
  if (!(await store.get(name))) {
    if (seed) {
      // 이미 다른 컬렉션이 있으면 겹치지 않게 이름 기반 접두어를 붙인다
      const prefix = existing.length ? defaultPrefix(name) : (seed.raw.prefix ?? '');
      await store.save(name, { ...seed.raw, name, prefix });
      console.log(`✚ ${store.file(name)} 없음 → ${src} 로 초기 저장`);
    } else if (existing.length === 0) {
      await store.save(name, { name, routes: [] });
      console.log(`✚ ${store.file(name)} 없음 → 빈 컬렉션 생성. /__admin 에서 채우세요`);
    }
  }
  return { store, kind: 'dir', watchTarget: dir };
}

/**
 * 저장소의 컬렉션을 전부 한 포트에 올린다. reload() 를 부르면 통째로 다시 만든다.
 * 동시에 여러 번 불려도 한 번만 다시 만든다
 */
function serve({ store, kind, watchTarget }: OpenedStore, opts: StartOpts) {
  const port = opts.port ? Number(opts.port) : DEFAULT_PORT;
  let current: Awaited<ReturnType<typeof createServer>> | undefined;
  let plan: ReturnType<typeof planServing<StoredCollection & { prefix: string }>> = { served: [], skipped: [] };
  let currentVersion: string | null = null;
  let reloading: Promise<void> | null = null;

  const boot = async () => {
    const all = (await Promise.all((await store.list()).map((d) => store.get(d.name)))).filter(
      (d): d is StoredCollection => d !== null
    );
    plan = planServing(all.map((d) => ({ ...d, prefix: d.collection.prefix })));
    for (const sk of plan.skipped) console.warn(`⚠ "${sk.name}" 건너뜀: ${sk.reason}`);
    const version = all.map((d) => d.updatedAt).sort().at(-1) ?? null;

    const next = await createServer(
      plan.served.map((d) => d.collection),
      {
        port,
        extend: opts.admin
          ? (app) =>
              registerAdmin(app, {
                store,
                storeKind: kind,
                // 파일 감지가 켜져 있으면 저장 → 파일 변경 → 자동 리로드. 꺼져 있을 때만 직접 리로드
                onChange: opts.watch ? undefined : () => void setTimeout(reload, 50),
                current: () => ({
                  port,
                  served: plan.served.map((d) => ({ name: d.name, prefix: d.prefix, routes: d.collection.routes.length })),
                  skipped: plan.skipped,
                  updatedAt: currentVersion
                })
              })
          : undefined
      }
    );
    await current?.app.close();
    current = next;
    currentVersion = version;
    await current.listen();
    console.log(`✔ http://localhost:${port} (${current.routes} routes, ${kind}: ${watchTarget})`);
    for (const d of plan.served) console.log(`   ${d.prefix || '/'}  ← ${d.name} (${d.collection.routes.length} routes)`);
    if (opts.admin) console.log(`   admin: http://localhost:${port}/__admin/`);
  };

  const reload = () => {
    reloading ??= boot()
      .catch((e) => console.error('reload 실패:', e.message))
      .finally(() => (reloading = null));
    return reloading;
  };

  const close = async () => {
    await current?.app.close();
    await store.close?.();
  };

  return { boot, reload, close };
}

/** 컬렉션 파일이 하나라도 바뀌면(추가/수정/삭제) 다시 로드 */
function watchFiles({ kind, watchTarget }: OpenedStore, reload: () => Promise<void>) {
  const singleFile = kind === 'file' ? path.resolve(watchTarget) : null;
  watch(watchTarget, { ignoreInitial: true, awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 50 } }).on('all', (event, file) => {
    if (singleFile ? path.resolve(file) !== singleFile : !file.endsWith('.json')) return;
    if (event === 'unlink' && singleFile) return console.warn(`⚠ ${file} 이(가) 삭제됨. 마지막 컬렉션로 계속 서빙`);
    console.log(`↻ ${path.basename(file)} ${event}, 다시 로드`);
    void reload();
  });
}

program
  .command('start')
  .description(
    `mock 서버 실행. 데이터 폴더(기본 ${DEFAULT_DATA_DIR})의 <이름>.json 컬렉션을 전부 한 포트에 올린다.\n` +
      '컬렉션마다 prefix(예: /shop)를 두고 그 아래에 라우트가 붙는다. 접두어는 겹칠 수 없고, 접두어 없는 컬렉션는 하나만.\n' +
      'source 를 주면 폴더에 그 이름의 컬렉션이 없을 때 초기 데이터로 넣는다.\n' +
      'mock 컬렉션 JSON 파일 하나만 주고 -d 를 안 주면 그 파일 하나만 서빙한다(단일 파일 모드).'
  )
  .argument('[source]', 'mock 컬렉션 JSON, OpenAPI(JSON/YAML) 파일, 또는 OpenAPI URL')
  .option('-d, --data <dir>', `컬렉션 JSON 파일들이 있는 폴더 (기본 ${DEFAULT_DATA_DIR})`)
  .option('-n, --name <name>', 'source 를 저장할 컬렉션 이름 (기본: source 의 name 또는 default). 폴더가 비어 있으면 이 이름으로 빈 컬렉션 생성')
  .option('-p, --port <port>', `포트 (기본 ${DEFAULT_PORT})`)
  .option('-H, --header <header...>', 'URL 요청 시 보낼 헤더 ("Key: Value")')
  .option('--no-admin', '어드민 화면/API(/__admin) 끄기')
  .option('--no-watch', '파일 변경 감지(자동 리로드) 끄기')
  .action(async (src: string | undefined, opts: StartOpts) => {
    const opened = await openStore(src, opts, parseHeaders(opts.header, true));
    const server = serve(opened, opts);
    await server.boot();
    if (opts.watch) watchFiles(opened, server.reload);

    const shutdown = async () => {
      await server.close();
      process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  });

// ── import ────────────────────────────────────────────────

program
  .command('import')
  .description('OpenAPI(JSON/YAML) 문서를 mock 컬렉션 JSON 으로 변환해 저장')
  .argument('<source>', 'OpenAPI 3.x 또는 Swagger 2 파일/URL')
  .option('-d, --data <dir>', '데이터 폴더에 <이름>.json 으로 저장')
  .option('-o, --out <file>', '지정한 파일로 저장 (없고 -d 도 없으면 stdout)')
  .option('-n, --name <name>', '컬렉션 이름 (기본: 문서 title)')
  .option('-H, --header <header...>', 'URL 요청 시 보낼 헤더 ("Key: Value")')
  .option('--array-length <n>', '배열 스키마 예시 항목 수', '2')
  .action(
    async (
      src: string,
      opts: { data?: string; out?: string; name?: string; header?: string[]; arrayLength: string }
    ) => {
      const doc = parseOpenApiText(await readSource(src, parseHeaders(opts.header, true)));
      const collection = fromOpenApi(doc, {
        name: opts.name,
        arrayLength: Number(opts.arrayLength)
      });
      if (opts.data) {
        const store = new JsonDirStore(opts.data);
        await store.init();
        await store.save(collection.name, collection);
        console.log(`✔ ${collection.routes.length} routes → ${store.file(collection.name)}`);
        return;
      }
      const json = JSON.stringify(collection, null, 2);
      if (opts.out) {
        await writeFile(opts.out, json + '\n', 'utf8');
        console.log(`✔ ${collection.routes.length} routes → ${opts.out}`);
      } else {
        process.stdout.write(json + '\n');
      }
    }
  );

program.parseAsync().catch((e: Error) => {
  console.error('✖', e.message);
  process.exit(1);
});
