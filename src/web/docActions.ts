import { uid, type Folder, type MockCollection, type Route } from './types';

// 컬렉션 문서를 바꾸는 순수 함수들. (doc) => 새 doc. React 상태와 무관해서 테스트하기 쉽다

type Pos = 'before' | 'after';
type Patch<T> = Partial<T> | ((x: T) => T);

const apply = <T>(x: T, patch: Patch<T>): T => (typeof patch === 'function' ? patch(x) : { ...x, ...patch });

/** id 인 항목을 targetId 앞/뒤로 옮기고 patch 를 덧씌운다 (폴더 이동 등). 못 찾으면 그대로 */
function insertNear<T extends { id?: string }>(list: T[], id: string, targetId: string, pos: Pos, patch: (target: T) => Partial<T>): T[] {
  const moving = list.find((x) => x.id === id);
  const target = list.find((x) => x.id === targetId);
  if (!moving || !target || id === targetId) return list;
  const rest = list.filter((x) => x.id !== id);
  const at = rest.findIndex((x) => x.id === targetId) + (pos === 'after' ? 1 : 0);
  rest.splice(at, 0, { ...moving, ...patch(target) });
  return rest;
}

// ── 라우트 ──
export const addRoute = (r: Route) => (d: MockCollection): MockCollection => ({ ...d, routes: [...d.routes, r] });

export const patchRoute = (id: string, patch: Patch<Route>) => (d: MockCollection): MockCollection => ({
  ...d,
  routes: d.routes.map((r) => (r.id === id ? apply(r, patch) : r))
});

export const removeRoute = (id: string) => (d: MockCollection): MockCollection => ({ ...d, routes: d.routes.filter((r) => r.id !== id) });

/** 라우트 복사본 (새 id, 경로 뒤에 -copy) */
export const cloneRoute = (r: Route): Route => ({
  ...structuredClone(r),
  id: uid(),
  path: r.path + '-copy',
  responses: r.responses.map((x) => ({ ...structuredClone(x), id: uid() }))
});

/** 라우트를 다른 라우트 앞/뒤로 (그 라우트의 폴더로 이동도 함께) */
export const reorderRoute = (id: string, targetId: string, pos: Pos) => (d: MockCollection): MockCollection => ({
  ...d,
  routes: insertNear(d.routes, id, targetId, pos, (t) => ({ folderId: t.folderId }))
});

// ── 폴더 ──
/** target 이 folderId 의 자손(또는 자기 자신)인지. 폴더를 자기 자식 안으로 넣는 순환을 막는다 */
export function isDescendant(all: Folder[], target: string | null, folderId: string): boolean {
  let cur = target;
  const seen = new Set<string>();
  while (cur) {
    if (cur === folderId) return true;
    if (seen.has(cur)) return false;
    seen.add(cur);
    cur = all.find((x) => x.id === cur)?.parentId ?? null;
  }
  return false;
}

export const addFolder = (name: string, parentId: string | null) => (d: MockCollection): MockCollection => ({
  ...d,
  folders: [...d.folders, { id: uid(), name, parentId }]
});

export const renameFolder = (id: string, name: string) => (d: MockCollection): MockCollection => ({
  ...d,
  folders: d.folders.map((f) => (f.id === id ? { ...f, name } : f))
});

/** 폴더 삭제: 안에 있던 라우트/하위 폴더는 부모로 올린다 */
export const removeFolder = (f: Folder) => (d: MockCollection): MockCollection => ({
  ...d,
  folders: d.folders.filter((x) => x.id !== f.id).map((x) => (x.parentId === f.id ? { ...x, parentId: f.parentId } : x)),
  routes: d.routes.map((r) => (r.folderId === f.id ? { ...r, folderId: f.parentId } : r))
});

/** 폴더를 다른 폴더 안으로. 자기 자신/자손 안으로는 못 감 */
export const moveFolder = (id: string, parentId: string | null) => (d: MockCollection): MockCollection =>
  id === parentId || isDescendant(d.folders, parentId, id)
    ? d
    : { ...d, folders: d.folders.map((f) => (f.id === id ? { ...f, parentId } : f)) };

/** 폴더를 다른 폴더 앞/뒤로 (같은 부모로 이동도 함께). 자기 자손 옆으로는 못 감 */
export const reorderFolder = (id: string, targetId: string, pos: Pos) => (d: MockCollection): MockCollection =>
  isDescendant(d.folders, targetId, id) ? d : { ...d, folders: insertNear(d.folders, id, targetId, pos, (t) => ({ parentId: t.parentId })) };
