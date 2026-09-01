import { useCallback, useEffect, useRef, useState } from 'react';
import { api, errorDetail } from './api';
import { withIds, type CollectionSummary, type MockCollection, type Status } from './types';

export type Flash = (text: string, kind?: 'ok' | 'err', detail?: string) => void;
export interface Msg {
  text: string;
  kind: 'ok' | 'err';
  /** 눌렀을 때 보여줄 상세 (에러) */
  detail?: string;
}

const POLL_MS = 5000;
const OK_MS = 4000;
const ERR_MS = 12000; // 에러는 눌러서 상세를 볼 시간을 준다

/**
 * 서버 상태·컬렉션 목록·지금 열어 둔 컬렉션 문서를 한 곳에서 관리한다.
 * - 처음에 상태 → 목록 → 첫 컬렉션 열기
 * - 5초마다 폴링. 다른 사람이 저장했으면 알려주거나(수정 중) 조용히 다시 읽는다
 * - Cmd/Ctrl+S 저장
 */
export function useCollection() {
  const [status, setStatus] = useState<Status | null>(null);
  const [list, setList] = useState<CollectionSummary[]>([]);
  const [name, setName] = useState<string | null>(null);
  const [doc, setDoc] = useState<MockCollection | null>(null);
  const [loadedAt, setLoadedAt] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [remoteChanged, setRemoteChanged] = useState(false);
  const [msg, setMsg] = useState<Msg | null>(null);
  const msgTimer = useRef<number>(0);

  const flash = useCallback<Flash>((text, kind = 'ok', detail) => {
    setMsg({ text, kind, detail });
    window.clearTimeout(msgTimer.current);
    msgTimer.current = window.setTimeout(() => setMsg(null), kind === 'err' ? ERR_MS : OK_MS);
  }, []);
  /** 실패를 배너로. 메시지는 한 줄, 상세는 눌러서 */
  const report = useCallback((e: unknown) => flash((e as Error).message, 'err', errorDetail(e)), [flash]);
  const dismiss = useCallback(() => setMsg(null), []);

  const refreshList = useCallback(async () => setList(await api.list()), []);
  const refreshStatus = useCallback(async () => {
    try {
      setStatus(await api.status());
    } catch {
      /* 잠깐 끊긴 것. 다음 폴링에서 다시 */
    }
  }, []);

  const load = useCallback(async (n: string) => {
    const s = await api.get(n);
    setName(n);
    setDoc(withIds(s.collection));
    setLoadedAt(s.updatedAt);
    setDirty(false);
    setRemoteChanged(false);
  }, []);

  const update = useCallback((fn: (d: MockCollection) => MockCollection) => {
    setDoc((d) => (d ? fn(d) : d));
    setDirty(true);
  }, []);

  const save = useCallback(async () => {
    if (!name || !doc) return;
    try {
      const s = await api.save(name, doc);
      setDoc(withIds(s.collection));
      setLoadedAt(s.updatedAt);
      setDirty(false);
      setRemoteChanged(false);
      flash(`저장됨 · ${s.collection.routes.length} routes`);
      await Promise.all([refreshList(), refreshStatus()]);
    } catch (e) {
      report(e);
    }
  }, [name, doc, flash, report, refreshList, refreshStatus]);

  /** 컬렉션 삭제 후 남은 첫 컬렉션을 연다. 없으면 빈 화면 */
  const remove = useCallback(
    async (n: string) => {
      try {
        await api.remove(n);
        const fresh = await api.list();
        setList(fresh);
        if (fresh[0]) await load(fresh[0].name);
        else {
          setName(null);
          setDoc(null);
        }
        flash('삭제됨');
      } catch (e) {
        report(e);
      }
    },
    [load, flash, report]
  );

  // 처음: 상태 → 목록 → 첫 컬렉션 열기 (루트 컬렉션이 있으면 그것부터)
  useEffect(() => {
    (async () => {
      try {
        const st = await api.status();
        setStatus(st);
        const l = await api.list();
        setList(l);
        const first = st.served.find((d) => d.prefix === '')?.name ?? st.served[0]?.name ?? l[0]?.name;
        if (first) await load(first);
      } catch (e) {
        report(e);
      }
    })();
  }, [report, load]);

  // 폴링. 최신 값은 ref 로 읽어서 값이 바뀔 때마다 인터벌이 다시 시작되지 않게 한다
  const latest = useRef({ name, loadedAt, dirty });
  latest.current = { name, loadedAt, dirty };
  useEffect(() => {
    const t = window.setInterval(async () => {
      await refreshStatus();
      const { name, loadedAt, dirty } = latest.current;
      if (!name) return;
      try {
        const fresh = await api.list();
        setList(fresh);
        const mine = fresh.find((d) => d.name === name);
        if (mine && loadedAt && mine.updatedAt !== loadedAt) {
          if (dirty) setRemoteChanged(true);
          else await load(name);
        }
      } catch {
        /* 무시 */
      }
    }, POLL_MS);
    return () => window.clearInterval(t);
  }, [load, refreshStatus]);

  // Cmd/Ctrl+S 저장
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void save();
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [save]);

  return { status, list, name, doc, dirty, remoteChanged, msg, flash, report, dismiss, load, update, save, remove, refreshList, refreshStatus };
}
