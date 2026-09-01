import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { isDescendant } from './docActions';
import type { Folder, MockCollection, Route } from './types';

const WIDTH_KEY = 'mockatoo.sidebarWidth';
const MIN_W = 200;
const MAX_W = 700;
const DEFAULT_W = 320;

type Pos = 'before' | 'after';

interface Props {
  doc: MockCollection;
  selected: string | null;
  onSelect: (id: string) => void;
  onAddRoute: (folderId: string | null) => void;
  onImportRoute: (folderId: string | null) => void;
  onAddFolder: (parentId: string | null) => void;
  onRenameFolder: (id: string) => void;
  onDeleteFolder: (id: string) => void;
  onDuplicateRoute: (id: string) => void;
  onDeleteRoute: (id: string) => void;
  onMoveRoute: (id: string, folderId: string | null) => void;
  onMoveFolder: (id: string, parentId: string | null) => void;
  /** 라우트를 다른 라우트 앞/뒤로 끼워 넣는다 (같은 폴더로 이동도 함께) */
  onReorderRoute: (id: string, targetId: string, pos: Pos) => void;
  /** 폴더를 다른 폴더 앞/뒤로 끼워 넣는다 (같은 부모로 이동도 함께) */
  onReorderFolder: (id: string, targetId: string, pos: Pos) => void;
  width: number;
  onWidthChange: (w: number) => void;
}

type MenuState = { kind: 'route' | 'folder' | 'add'; id: string } | null;

// 왼쪽 트리: 폴더(접기/펼치기) 안에 라우트. 드래그로 이동/순서 변경, 케밥 메뉴로 나머지 조작
export function Sidebar(p: Props) {
  const [filter, setFilter] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState<MenuState>(null);
  const [dragOver, setDragOver] = useState<string | null | 'root'>(null);
  const [insert, setInsert] = useState<{ id: string; pos: Pos } | null>(null);

  const q = filter.trim().toLowerCase();

  // 트리 색인: 부모별 하위 폴더, 폴더별 (필터 통과한) 라우트, 폴더별 전체 라우트 수, 필터에 걸리는 게 있는 폴더
  const tree = useMemo(() => buildTree(p.doc, q), [p.doc, q]);

  const toggle = (id: string) =>
    setCollapsed((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const closeMenu = () => setMenu(null);
  const toggleMenu = (kind: NonNullable<MenuState>['kind'], id: string) => setMenu(menu?.id === id ? null : { kind, id });

  // ── 드래그 중 트리 위/아래 가장자리에 닿으면 자동 스크롤 ──
  const treeRef = useRef<HTMLUListElement>(null);
  const scrollTimer = useRef<number | null>(null);
  const stopAutoScroll = () => {
    if (scrollTimer.current != null) {
      window.clearInterval(scrollTimer.current);
      scrollTimer.current = null;
    }
  };
  const autoScroll = (e: DragEvent) => {
    const el = treeRef.current;
    if (!el) return;
    const { top, bottom } = el.getBoundingClientRect();
    const EDGE = 40;
    const dir = e.clientY - top < EDGE ? -1 : bottom - e.clientY < EDGE ? 1 : 0;
    if (dir === 0) return stopAutoScroll();
    scrollTimer.current ??= window.setInterval(() => {
      el.scrollTop += dir * 12;
    }, 16);
  };
  useEffect(() => stopAutoScroll, []);

  // ── 사이드바 너비 드래그 ──
  const [resizing, setResizing] = useState(false);
  useEffect(() => {
    if (!resizing) return;
    const move = (e: MouseEvent) => p.onWidthChange(Math.min(MAX_W, Math.max(MIN_W, e.clientX)));
    const up = () => setResizing(false);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [resizing, p.onWidthChange]);

  // ── 드롭 처리 ──
  const clearDrag = () => {
    setDragOver(null);
    setInsert(null);
  };
  const onDrop = (folderId: string | null) => (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const rid = e.dataTransfer.getData('text/route-id');
    const fid = e.dataTransfer.getData('text/folder-id');
    if (rid) p.onMoveRoute(rid, folderId);
    else if (fid && fid !== folderId && !isDescendant(p.doc.folders, folderId, fid)) p.onMoveFolder(fid, folderId);
    clearDrag();
  };
  const allowDrop = (key: string | 'root') => (e: DragEvent) => {
    const t = e.dataTransfer.types;
    if (t.includes('text/route-id') || t.includes('text/folder-id')) {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(key);
    }
  };
  const setInsertIfChanged = (id: string, pos: Pos) => setInsert((cur) => (cur && cur.id === id && cur.pos === pos ? cur : { id, pos }));

  // 마우스가 항목의 위쪽 절반이면 앞, 아래쪽이면 뒤
  const insertPos = (e: DragEvent<HTMLElement>): Pos => {
    const box = e.currentTarget.getBoundingClientRect();
    return e.clientY < box.top + box.height / 2 ? 'before' : 'after';
  };
  const routeDragOver = (r: Route) => (e: DragEvent<HTMLLIElement>) => {
    if (!e.dataTransfer.types.includes('text/route-id')) return; // 폴더는 라우트 사이에 못 넣음 → 상위 폴더 드롭으로 버블
    e.preventDefault();
    e.stopPropagation();
    setInsertIfChanged(r.id!, insertPos(e));
    setDragOver(null);
  };
  const routeDrop = (r: Route) => (e: DragEvent<HTMLLIElement>) => {
    const id = e.dataTransfer.getData('text/route-id');
    if (!id) return;
    e.preventDefault();
    e.stopPropagation();
    if (id !== r.id) p.onReorderRoute(id, r.id!, insertPos(e));
    clearDrag();
  };

  // 폴더 위에서 폴더를 끌 때: 위/아래 가장자리(25%)면 앞/뒤에 끼우기, 가운데면 안으로 넣기
  const folderZone = (e: DragEvent<HTMLDivElement>): Pos | 'into' => {
    const box = e.currentTarget.getBoundingClientRect();
    const y = (e.clientY - box.top) / box.height;
    return y < 0.25 ? 'before' : y > 0.75 ? 'after' : 'into';
  };
  const folderDragOver = (f: Folder) => (e: DragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer.types.includes('text/folder-id')) return allowDrop(f.id)(e);
    e.preventDefault();
    e.stopPropagation();
    const zone = folderZone(e);
    if (zone === 'into') {
      setDragOver(f.id);
      setInsert(null);
    } else {
      setDragOver(null);
      setInsertIfChanged(f.id, zone);
    }
  };
  const folderDrop = (f: Folder) => (e: DragEvent<HTMLDivElement>) => {
    const fid = e.dataTransfer.getData('text/folder-id');
    const zone = fid ? folderZone(e) : 'into';
    if (zone === 'into') return onDrop(f.id)(e);
    e.preventDefault();
    e.stopPropagation();
    if (fid !== f.id && !isDescendant(p.doc.folders, f.id, fid)) p.onReorderFolder(fid, f.id, zone);
    clearDrag();
  };

  const dragStart = (type: 'route' | 'folder', id: string) => (e: DragEvent) => {
    e.stopPropagation();
    e.dataTransfer.setData(`text/${type}-id`, id);
    e.dataTransfer.effectAllowed = 'move';
  };
  const insertClass = (id: string) => (insert && insert.id === id ? `insert-${insert.pos}` : '');

  // ── 렌더 ──
  const renderRoute = (r: Route, depth: number) => (
    <li
      key={r.id}
      className={`route ${r.id === p.selected ? 'active' : ''} ${insertClass(r.id!)}`}
      style={{ paddingLeft: 12 + depth * 16 }}
      onClick={() => p.onSelect(r.id!)}
      onDragOver={routeDragOver(r)}
      onDragLeave={() => setInsert((cur) => (cur?.id === r.id ? null : cur))}
      onDrop={routeDrop(r)}
      draggable
      onDragStart={dragStart('route', r.id!)}
    >
      <div className="route-main">
        <div className="route-path" title={r.path}>{r.path}</div>
        <div className="route-sub">
          <span className={`method m-${r.method}`}>{r.method}</span>
          <span className="desc">{r.description || `${r.responses.length} responses`}</span>
        </div>
      </div>
      <KebabMenu open={menu?.kind === 'route' && menu.id === r.id} onToggle={() => toggleMenu('route', r.id!)} onClose={closeMenu}>
        <button onClick={() => p.onDuplicateRoute(r.id!)}>복제</button>
        <label>
          폴더로 이동
          <select value={r.folderId ?? ''} onChange={(e) => { p.onMoveRoute(r.id!, e.target.value || null); closeMenu(); }}>
            <option value="">(최상위)</option>
            {p.doc.folders.map((f) => (
              <option key={f.id} value={f.id}>{folderPath(p.doc.folders, f)}</option>
            ))}
          </select>
        </label>
        <button className="danger" onClick={() => p.onDeleteRoute(r.id!)}>삭제</button>
      </KebabMenu>
    </li>
  );

  const renderFolder = (f: Folder, depth: number) => {
    const kids = tree.childrenOf.get(f.id) ?? [];
    const routes = tree.routesOf.get(f.id) ?? [];
    const open = q ? true : !collapsed.has(f.id);
    if (q && !tree.hasVisible.has(f.id)) return null;
    return (
      <li key={f.id} className="folder-wrap">
        <div
          className={`folder ${dragOver === f.id ? 'drop' : ''} ${insertClass(f.id)}`}
          style={{ paddingLeft: 12 + depth * 16 }}
          onClick={() => toggle(f.id)}
          draggable
          onDragStart={dragStart('folder', f.id)}
          onDragOver={folderDragOver(f)}
          onDragLeave={() => {
            setDragOver(null);
            setInsert((cur) => (cur?.id === f.id ? null : cur));
          }}
          onDrop={folderDrop(f)}
        >
          <span className="chev">{open ? '▾' : '▸'}</span>
          <span className="fname">{open ? '📂' : '📁'} {f.name}</span>
          <span className="count">{tree.countOf.get(f.id) ?? 0}</span>
          <KebabMenu open={menu?.kind === 'folder' && menu.id === f.id} onToggle={() => toggleMenu('folder', f.id)} onClose={closeMenu}>
            <button onClick={() => p.onAddRoute(f.id)}>＋ 라우트</button>
            <button onClick={() => p.onImportRoute(f.id)}>⇣ API로 라우트 생성</button>
            <button onClick={() => p.onAddFolder(f.id)}>＋ 하위 폴더</button>
            <button onClick={() => p.onRenameFolder(f.id)}>이름 변경</button>
            <button className="danger" onClick={() => p.onDeleteFolder(f.id)}>삭제</button>
          </KebabMenu>
        </div>
        {open && (
          <ul>
            {kids.map((k) => renderFolder(k, depth + 1))}
            {routes.map((r) => renderRoute(r, depth + 1))}
          </ul>
        )}
      </li>
    );
  };

  return (
    <aside className={`sidebar ${resizing ? 'resizing' : ''}`} onClick={() => menu && closeMenu()}>
      <div className="side-top">
        <div className="split">
          <button className="primary" onClick={() => p.onAddRoute(null)} title="라우트 추가">＋ 라우트</button>
          <button
            className="primary caret"
            title="다른 방법으로 추가"
            onClick={(e) => {
              e.stopPropagation();
              toggleMenu('add', 'root');
            }}
          >
            ▾
          </button>
          {menu?.kind === 'add' && (
            <div className="menu top-menu" onClick={(e) => e.stopPropagation()}>
              <button onClick={() => { p.onImportRoute(null); closeMenu(); }}>⇣ API로 라우트 생성</button>
            </div>
          )}
        </div>
        <button onClick={() => p.onAddFolder(null)} title="폴더 추가">＋ 폴더</button>
        <input placeholder="필터" value={filter} onChange={(e) => setFilter(e.target.value)} />
      </div>
      <ul
        ref={treeRef}
        className={`tree ${dragOver === 'root' ? 'drop' : ''}`}
        onDragOver={allowDrop('root')}
        onDragOverCapture={autoScroll}
        onDragLeave={() => setDragOver(null)}
        onDragEndCapture={stopAutoScroll}
        onDropCapture={stopAutoScroll}
        onDrop={onDrop(null)}
      >
        {tree.rootFolders.map((f) => renderFolder(f, 0))}
        {tree.rootRoutes.map((r) => renderRoute(r, 0))}
        {p.doc.routes.length === 0 && <li className="hint">라우트가 없어요. ＋ 라우트 를 누르세요.</li>}
      </ul>
      <div
        className="resizer"
        title="드래그해서 너비 조절"
        onMouseDown={(e) => {
          e.preventDefault();
          setResizing(true);
        }}
        onDoubleClick={() => p.onWidthChange(DEFAULT_W)}
      />
    </aside>
  );
}

// ── 케밥(⋮) 버튼 + 드롭다운 메뉴. 안의 버튼을 누르면 메뉴가 닫힌다 ──
function KebabMenu({ open, onToggle, onClose, children }: { open: boolean; onToggle: () => void; onClose: () => void; children: ReactNode }) {
  return (
    <>
      <button
        className="kebab"
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
      >
        ⋮
      </button>
      {open && (
        <div
          className="menu"
          onClick={(e) => {
            e.stopPropagation();
            if ((e.target as HTMLElement).closest('button')) onClose();
          }}
        >
          {children}
        </div>
      )}
    </>
  );
}

// ── 트리 색인 만들기 (렌더마다 filter 를 반복하지 않도록 한 번에) ──
function buildTree(doc: MockCollection, q: string) {
  const folderIds = new Set(doc.folders.map((f) => f.id));
  const parentOf = (id: string | null) => (id && folderIds.has(id) ? id : null); // 없는 폴더를 가리키면 최상위로
  const visible = q ? doc.routes.filter((r) => `${r.method} ${r.path} ${r.description}`.toLowerCase().includes(q)) : doc.routes;

  const childrenOf = new Map<string | null, Folder[]>();
  for (const f of doc.folders) push(childrenOf, parentOf(f.parentId), f);
  const routesOf = new Map<string | null, Route[]>();
  for (const r of visible) push(routesOf, parentOf(r.folderId), r);
  const ownCount = new Map<string | null, number>();
  for (const r of doc.routes) ownCount.set(parentOf(r.folderId), (ownCount.get(parentOf(r.folderId)) ?? 0) + 1);

  // 하위 포함 라우트 수, 필터에 걸리는 라우트가 (하위 포함) 있는지 — 자식부터 올라오며 계산
  const countOf = new Map<string, number>();
  const hasVisible = new Set<string>();
  const walk = (id: string): number => {
    let n = ownCount.get(id) ?? 0;
    let vis = (routesOf.get(id)?.length ?? 0) > 0;
    for (const k of childrenOf.get(id) ?? []) {
      n += walk(k.id);
      if (hasVisible.has(k.id)) vis = true;
    }
    countOf.set(id, n);
    if (vis) hasVisible.add(id);
    return n;
  };
  for (const f of childrenOf.get(null) ?? []) walk(f.id);

  return { childrenOf, routesOf, countOf, hasVisible, rootFolders: childrenOf.get(null) ?? [], rootRoutes: routesOf.get(null) ?? [] };
}

function push<K, V>(m: Map<K, V[]>, k: K, v: V) {
  const a = m.get(k);
  if (a) a.push(v);
  else m.set(k, [v]);
}

export function loadSidebarWidth(): number {
  const n = Number(localStorage.getItem(WIDTH_KEY));
  return n >= MIN_W && n <= MAX_W ? n : DEFAULT_W;
}
export function saveSidebarWidth(w: number) {
  localStorage.setItem(WIDTH_KEY, String(w));
}

function folderPath(all: Folder[], f: Folder): string {
  const parent = f.parentId ? all.find((x) => x.id === f.parentId) : undefined;
  return parent ? `${folderPath(all, parent)} / ${f.name}` : f.name;
}
