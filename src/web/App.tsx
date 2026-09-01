import { useCallback, useEffect, useMemo, useState } from 'react';
import { Sidebar, loadSidebarWidth, saveSidebarWidth } from './Sidebar';
import { RouteEditor } from './RouteEditor';
import { CollectionDialog } from './CollectionDialog';
import { NameDialog } from './NameDialog';
import { ImportApiDialog } from './ImportApiDialog';
import { ConfirmDialog } from './ConfirmDialog';
import { HelpDialog } from './HelpDialog';
import { useCollection } from './useCollection';
import * as act from './docActions';
import { newRoute, type Route } from './types';

type ConfirmState = { title: string; message?: string; confirmLabel?: string; danger?: boolean; onConfirm: () => void | Promise<void> };
type FolderDlg = { mode: 'add'; parentId: string | null } | { mode: 'rename'; id: string };

export function App() {
  const col = useCollection();
  const { doc, name, status, list, dirty, update, flash, report } = col;

  const [selected, setSelected] = useState<string | null>(null); // route id
  const [confirmDlg, setConfirmDlg] = useState<ConfirmState | null>(null);
  const [colDlg, setColDlg] = useState<'create' | 'edit' | null>(null);
  const [importDlg, setImportDlg] = useState<{ folderId: string | null } | null>(null);
  const [folderDlg, setFolderDlg] = useState<FolderDlg | null>(null);
  const [errDetail, setErrDetail] = useState<{ title: string; detail: string } | null>(null);

  // 문서가 바뀌었는데 선택한 라우트가 없어졌으면 첫 라우트로
  useEffect(() => {
    if (!doc) return;
    setSelected((cur) => (doc.routes.some((r) => r.id === cur) ? cur : (doc.routes[0]?.id ?? null)));
  }, [doc]);

  const open = async (n: string) => {
    try {
      await col.load(n);
    } catch (e) {
      report(e);
    }
  };
  const switchCollection = (n: string) => {
    if (n === name) return;
    if (dirty) setConfirmDlg({ title: '저장 안 한 변경이 있어요', message: '변경을 버리고 다른 컬렉션을 열까요?', confirmLabel: '버리기', danger: true, onConfirm: () => open(n) });
    else void open(n);
  };
  const deleteCollection = () => {
    if (!name) return;
    setColDlg(null);
    setConfirmDlg({ title: `"${name}" 컬렉션을 삭제할까요?`, confirmLabel: '삭제', danger: true, onConfirm: () => col.remove(name) });
  };

  // ── 라우트/폴더 조작 ──────────────────────────────────
  const addRoute = (folderId: string | null) => {
    const r = newRoute(folderId);
    update(act.addRoute(r));
    setSelected(r.id!);
  };
  const addImportedRoute = (r: Route) => {
    update(act.addRoute(r));
    setSelected(r.id!);
    flash('API 응답으로 라우트를 만들었어요');
  };
  const duplicateRoute = (id: string) => {
    const r = doc?.routes.find((x) => x.id === id);
    if (!r) return;
    const copy = act.cloneRoute(r);
    update(act.addRoute(copy));
    setSelected(copy.id!);
  };
  const deleteRoute = (id: string) => {
    const r = doc?.routes.find((x) => x.id === id);
    if (!r) return;
    setConfirmDlg({
      title: `${r.method} ${r.path} 를 삭제할까요?`,
      confirmLabel: '삭제',
      danger: true,
      onConfirm: () => update(act.removeRoute(id))
    });
  };
  const submitFolderName = (n: string) => {
    if (!folderDlg) return;
    update(folderDlg.mode === 'add' ? act.addFolder(n, folderDlg.parentId) : act.renameFolder(folderDlg.id, n));
  };
  const deleteFolder = (id: string) => {
    const f = doc?.folders.find((x) => x.id === id);
    if (!f) return;
    setConfirmDlg({ title: `폴더 "${f.name}" 를 삭제할까요?`, message: '안의 라우트와 하위 폴더는 상위로 이동해요.', confirmLabel: '삭제', danger: true, onConfirm: () => update(act.removeFolder(f)) });
  };

  const [sideWidth, setSideWidth] = useState(loadSidebarWidth);
  const onSideWidth = useCallback((w: number) => {
    setSideWidth(w);
    saveSidebarWidth(w);
  }, []);

  const route = useMemo(() => doc?.routes.find((r) => r.id === selected) ?? null, [doc, selected]);
  // 지금 보는 컬렉션이 접두어 충돌로 서빙에서 빠졌는지
  const skippedReason = useMemo(() => status?.skipped.find((s) => s.name === name)?.reason ?? null, [status, name]);

  const afterCollectionDialog = async (n: string, text: string) => {
    setColDlg(null);
    await Promise.all([col.refreshList(), col.refreshStatus()]);
    await col.load(n);
    flash(text);
  };

  return (
    <div className="app">
      <header className="topbar">
        <span className="logo">🦜 mockatoo</span>
        <select className="collection-select" value={name ?? ''} onChange={(e) => switchCollection(e.target.value)}>
          {list.map((d) => (
            <option key={d.name} value={d.name}>
              {d.prefix || '/'} · {d.name} ({d.routes})
            </option>
          ))}
        </select>
        <button onClick={() => setColDlg('create')} title="새 컬렉션 (빈 컬렉션 또는 OpenAPI 에서)">＋ 새 컬렉션</button>
        <button onClick={() => setColDlg('edit')} disabled={!doc} title="이름·접두어·CORS 변경, 삭제">⚙ 컬렉션 설정</button>
        {skippedReason && <span className="msg warn" title={skippedReason}>⚠ 서빙 안 됨: {skippedReason}</span>}
        <span className="spacer" />
        {col.msg && (
          <span
            className={`msg ${col.msg.kind} ${col.msg.detail ? 'clickable' : ''}`}
            title={col.msg.detail ? '눌러서 자세히 보기' : undefined}
            onClick={() => {
              if (!col.msg?.detail) return;
              setErrDetail({ title: col.msg.text, detail: col.msg.detail });
              col.dismiss();
            }}
          >
            {col.msg.text}
          </span>
        )}
        {col.remoteChanged && <span className="msg warn">서버에 새 버전이 있어요. 저장하면 덮어씁니다</span>}
        <span className="status">
          {status
            ? `${status.served.length}개 컬렉션 · ${status.served.reduce((n, d) => n + d.routes, 0)} routes` +
              (status.skipped.length ? ` · ⚠ ${status.skipped.length}개 건너뜀` : '')
            : '…'}
        </span>
        <button className={`primary ${dirty ? 'dirty' : ''}`} onClick={() => void col.save()} disabled={!dirty}>
          저장 {dirty ? '●' : ''} <kbd>⌘S</kbd>
        </button>
      </header>

      {doc ? (
        <main className="body" style={{ gridTemplateColumns: `${sideWidth}px 1fr` }}>
          <Sidebar
            doc={doc}
            selected={selected}
            onSelect={setSelected}
            onAddRoute={addRoute}
            onImportRoute={(folderId) => setImportDlg({ folderId })}
            onAddFolder={(parentId) => setFolderDlg({ mode: 'add', parentId })}
            onRenameFolder={(id) => setFolderDlg({ mode: 'rename', id })}
            onDeleteFolder={deleteFolder}
            onDuplicateRoute={duplicateRoute}
            onDeleteRoute={deleteRoute}
            onMoveRoute={(id, folderId) => update(act.patchRoute(id, { folderId }))}
            onMoveFolder={(id, parentId) => update(act.moveFolder(id, parentId))}
            onReorderRoute={(id, t, pos) => update(act.reorderRoute(id, t, pos))}
            onReorderFolder={(id, t, pos) => update(act.reorderFolder(id, t, pos))}
            width={sideWidth}
            onWidthChange={onSideWidth}
          />
          {route ? (
            <RouteEditor
              key={route.id}
              route={route}
              prefix={doc.prefix}
              baseUrl={status ? `${window.location.protocol}//${window.location.hostname}:${status.port}` : undefined}
              onChange={(patch) => update(act.patchRoute(route.id!, patch))}
              onDuplicate={() => duplicateRoute(route.id!)}
              onDelete={() => deleteRoute(route.id!)}
            />
          ) : (
            <section className="editor empty">
              <p>왼쪽에서 라우트를 선택하거나 <button onClick={() => addRoute(null)}>＋ 라우트 추가</button></p>
            </section>
          )}
        </main>
      ) : (
        <main className="body empty">
          <p>컬렉션이 없어요. <button onClick={() => setColDlg('create')}>＋ 새 컬렉션 만들기</button> (빈 컬렉션 또는 OpenAPI 에서 가져오기)</p>
        </main>
      )}

      {confirmDlg && <ConfirmDialog {...confirmDlg} onClose={() => setConfirmDlg(null)} />}
      {errDetail && (
        <HelpDialog title={`오류: ${errDetail.title}`} onClose={() => setErrDetail(null)}>
          <pre className="err-detail">{errDetail.detail}</pre>
        </HelpDialog>
      )}
      {importDlg && doc && (
        <ImportApiDialog prefix={doc.prefix} folderId={importDlg.folderId} onClose={() => setImportDlg(null)} onCreate={addImportedRoute} />
      )}
      {folderDlg && (
        <NameDialog
          title={folderDlg.mode === 'add' ? '새 폴더' : '폴더 이름 변경'}
          defaultValue={folderDlg.mode === 'add' ? '새 폴더' : (doc?.folders.find((x) => x.id === folderDlg.id)?.name ?? '')}
          placeholder="폴더 이름"
          submitLabel={folderDlg.mode === 'add' ? '추가' : '변경'}
          onClose={() => setFolderDlg(null)}
          onSubmit={submitFolderName}
        />
      )}
      {colDlg === 'create' && (
        <CollectionDialog mode="create" hasOthers={list.length > 0} onClose={() => setColDlg(null)} onDone={(n) => afterCollectionDialog(n, '만들어짐')} />
      )}
      {colDlg === 'edit' && name && doc && (
        <CollectionDialog mode="edit" name={name} doc={doc} onClose={() => setColDlg(null)} onDelete={deleteCollection} onDone={(n) => afterCollectionDialog(n, '저장됨')} />
      )}
    </div>
  );
}
