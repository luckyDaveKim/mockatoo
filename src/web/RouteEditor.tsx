import { useLayoutEffect, useRef, useState } from 'react';
import { HelpDialog, PathHelp } from './HelpDialog';
import { ResponseEditor } from './ResponseEditor';
import { METHODS, newResponse, uid, type Response, type Route } from './types';

interface Props {
  route: Route;
  /** 컬렉션의 경로 접두어 (표시용) */
  prefix?: string;
  /** mock 서버 주소 (URL 복사용). 없으면 경로만 복사 */
  baseUrl?: string;
  onChange: (patch: Partial<Route> | ((r: Route) => Route)) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

// 오른쪽: method + path + 설명, 그 아래 응답 목록과 선택한 응답의 편집기
export function RouteEditor({ route, prefix, baseUrl, onChange, onDuplicate, onDelete }: Props) {
  const [idx, setIdx] = useState(0);
  const [copied, setCopied] = useState(false);
  const [help, setHelp] = useState(false);
  const tabsRef = useRef<HTMLDivElement>(null);
  const lastRects = useRef(new Map<string, DOMRect>());
  // FLIP: 렌더 뒤 탭 위치가 이전과 다르면 이전 자리에서 새 자리로 미끄러지게 (응답 id 로 같은 탭을 추적)
  useLayoutEffect(() => {
    const el = tabsRef.current;
    if (!el) return;
    const now = new Map<string, DOMRect>();
    for (const tab of el.querySelectorAll<HTMLElement>('.resp-tab')) {
      const k = tab.dataset.key!;
      const r = tab.getBoundingClientRect();
      now.set(k, r);
      const prev = lastRects.current.get(k);
      const dx = prev ? prev.left - r.left : 0;
      if (Math.abs(dx) > 1) {
        tab.animate([{ transform: `translateX(${dx}px)` }, { transform: 'none' }], { duration: 220, easing: 'cubic-bezier(.2,.8,.2,1)' });
      }
    }
    lastRects.current = now;
  });
  const fullUrl = (baseUrl ?? '') + (prefix ?? '') + route.path;
  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(fullUrl);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = fullUrl;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };
  const cur = Math.min(idx, route.responses.length - 1);
  const res = route.responses[cur];

  const setResponses = (fn: (rs: Response[]) => Response[]) => onChange((r) => ({ ...r, responses: fn(r.responses) }));
  const updateRes = (patch: Partial<Response>) => setResponses((rs) => rs.map((x, i) => (i === cur ? { ...x, ...patch } : x)));

  const add = () => {
    setResponses((rs) => [...rs, newResponse(200)]);
    setIdx(route.responses.length);
  };
  const duplicate = () => {
    setResponses((rs) => [...rs.slice(0, cur + 1), { ...structuredClone(rs[cur]), id: uid() }, ...rs.slice(cur + 1)]);
    setIdx(cur + 1);
  };
  const remove = () => {
    if (route.responses.length <= 1) return;
    setResponses((rs) => rs.filter((_, i) => i !== cur));
    setIdx(Math.max(0, cur - 1));
  };
  const move = (dir: -1 | 1) => {
    const to = cur + dir;
    if (to < 0 || to >= route.responses.length) return;
    setResponses((rs) => {
      const n = [...rs];
      [n[cur], n[to]] = [n[to], n[cur]];
      return n;
    });
    setIdx(to);
  };

  // "기본 응답" = 규칙 없는 첫 응답. 서버가 그렇게 고른다
  const defaultIdx = route.responses.findIndex((r) => r.rules.length === 0);

  return (
    <section className="editor">
      <div className="route-head">
        <select
          className={`method-select m-${route.method}`}
          value={route.method}
          onChange={(e) => onChange({ method: e.target.value as Route['method'] })}
        >
          {METHODS.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
        {prefix && <span className="prefix-chip" title="컬렉션 접두어 (상단에서 변경)">{prefix}</span>}
        <input
          className="path-input"
          value={route.path}
          onChange={(e) => onChange({ path: e.target.value })}
          onBlur={(e) => !e.target.value.startsWith('/') && onChange({ path: '/' + e.target.value })}
          placeholder="/users/:id  (정규식도 가능: /pattern(s)?/*)"
          spellCheck={false}
        />
        <button className="help" onClick={() => setHelp(true)} title="경로·정규식 사용법">?</button>
        <button onClick={() => void copyUrl()} title={`URL 복사: ${fullUrl}`}>{copied ? '✓ 복사됨' : 'URL 복사'}</button>
        <button onClick={onDuplicate} title="라우트 복제">복제</button>
        <button className="danger" onClick={onDelete} title="라우트 삭제">삭제</button>
      </div>
      <div className="route-head second">
        <input
          className="desc-input"
          value={route.description}
          onChange={(e) => onChange({ description: e.target.value })}
          placeholder="설명 (선택)"
        />
      </div>

      <div className="responses">
        <button className="icon" onClick={add} title="응답 추가">＋</button>
        <div className="resp-tabs" ref={tabsRef}>
          {route.responses.map((r, i) => (
            <button
              key={r.id}
              data-key={r.id}
              className={`resp-tab ${i === cur ? 'active' : ''} s${String(r.status)[0]}`}
              onClick={() => setIdx(i)}
              title={r.label}
            >
              <span className="n">Response {i + 1}</span>
              <span className="code">({r.status})</span>
              {r.label && <span className="lbl">{r.label}</span>}
              {r.rules.length > 0 && <span className="pill">규칙 {r.rules.length}</span>}
              {i === defaultIdx && <span className="pill default" title="규칙에 하나도 안 맞을 때 쓰는 응답">기본</span>}
            </button>
          ))}
        </div>
        <div className="resp-actions">
          <button className="icon" onClick={() => move(-1)} disabled={cur === 0} title="위로">↑</button>
          <button className="icon" onClick={() => move(1)} disabled={cur === route.responses.length - 1} title="아래로">↓</button>
          <button className="icon" onClick={duplicate} title="응답 복제">⧉</button>
          <button className="icon danger" onClick={remove} disabled={route.responses.length <= 1} title={route.responses.length <= 1 ? '응답은 최소 1개 필요해요' : '응답 삭제'}>🗑</button>
        </div>
      </div>

      {res && <ResponseEditor key={res.id} response={res} onChange={updateRes} />}

      <p className="hint">
        응답 고르는 규칙: 규칙(Rules)이 전부 맞는 첫 응답 → 없으면 규칙 없는 첫 응답(기본). 순서가 중요하면 ↑↓ 로 바꾸세요.
      </p>
      {help && (
        <HelpDialog title="경로 작성법" onClose={() => setHelp(false)}>
          <PathHelp />
        </HelpDialog>
      )}
    </section>
  );
}
