import { useRef, useState } from 'react';
import { TemplateMenu } from './TemplateMenu';
import { bodyToText, jsonProblem, looksLikeJson, STATUS_CODES, textToBody, type Response, type Rule } from './types';

interface Props {
  response: Response;
  onChange: (patch: Partial<Response>) => void;
}

type Tab = 'body' | 'headers' | 'rules';

export function ResponseEditor({ response: r, onChange }: Props) {
  const [tab, setTab] = useState<Tab>('body');
  const [bodyText, setBodyText] = useState(() => bodyToText(r.body));
  const jsonError = jsonProblem(bodyText);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  // 마지막 커서 위치. 한 번도 클릭 안 했으면 null → 맨 끝에 붙인다
  const caret = useRef<[number, number] | null>(null);
  const rememberCaret = () => {
    const ta = bodyRef.current;
    if (ta) caret.current = [ta.selectionStart, ta.selectionEnd];
  };

  // 커서 위치(또는 선택 영역)에 템플릿을 넣는다. JSON 문자열 안이면 따옴표를 \" 로, 밖이면 "..." 로 감싼다
  const insertTemplate = (raw: string) => {
    const ta = bodyRef.current;
    const [start, end] = caret.current ?? [bodyText.length, bodyText.length];
    const before = bodyText.slice(0, start);
    const looksJson = looksLikeJson(bodyText);
    const inString = looksJson && (before.match(/(?<!\\)"/g)?.length ?? 0) % 2 === 1;
    const text = !looksJson ? raw : inString ? raw.replace(/"/g, '\\"') : `"${raw.replace(/"/g, '\\"')}"`;
    const next = before + text + bodyText.slice(end);
    onBody(next);
    requestAnimationFrame(() => {
      ta?.focus();
      ta?.setSelectionRange(start + text.length, start + text.length);
      caret.current = [start + text.length, start + text.length];
    });
  };

  const onBody = (t: string) => {
    setBodyText(t);
    onChange({ body: textToBody(t) });
  };
  const format = () => {
    try {
      onBody(JSON.stringify(JSON.parse(bodyText), null, 2));
    } catch {
      /* JSON 아니면 그대로 */
    }
  };

  const setHeader = (i: number, k: string, v: string) => {
    const entries = Object.entries(r.headers);
    entries[i] = [k, v];
    onChange({ headers: Object.fromEntries(entries) });
  };
  const delHeader = (i: number) => {
    const entries = Object.entries(r.headers);
    entries.splice(i, 1);
    onChange({ headers: Object.fromEntries(entries) });
  };
  const setRule = (i: number, patch: Partial<Rule>) => onChange({ rules: r.rules.map((x, j) => (j === i ? { ...x, ...patch } : x)) });

  return (
    <div className="resp-editor">
      <div className="tabs">
        <button className={tab === 'body' ? 'active' : ''} onClick={() => setTab('body')}>Status & Body</button>
        <button className={tab === 'headers' ? 'active' : ''} onClick={() => setTab('headers')}>
          Headers {Object.keys(r.headers).length > 0 && <span className="pill">{Object.keys(r.headers).length}</span>}
        </button>
        <button className={tab === 'rules' ? 'active' : ''} onClick={() => setTab('rules')}>
          Rules {r.rules.length > 0 && <span className="pill">{r.rules.length}</span>}
        </button>
      </div>

      {tab === 'body' && (
        <div className="pane">
          <div className="row">
            <select
              className="status-select"
              value={r.status}
              onChange={(e) => onChange({ status: Number(e.target.value) })}
            >
              {STATUS_CODES.map(([c, t]) => (
                <option key={c} value={c}>{c} - {t}</option>
              ))}
            </select>
            <label className="latency" title="응답 지연(ms)">
              ⏱
              <input
                type="number"
                min={0}
                value={r.latencyMs}
                onChange={(e) => onChange({ latencyMs: Math.max(0, Number(e.target.value) || 0) })}
              />
              ms
            </label>
          </div>
          <input
            className="label-input"
            value={r.label}
            onChange={(e) => onChange({ label: e.target.value })}
            placeholder="이 응답 설명 (선택) 예: 인증 헤더 없을 때"
          />
          <div className="body-head">
            <span className="hint">
              Body — JSON 이면 객체로 저장, 아니면 문자열. 템플릿: {'{{urlParam "id"}}'} {'{{queryParam "q"}}'} {'{{faker "person.fullName"}}'}
            </span>
            <span className="row">
              <TemplateMenu onPick={insertTemplate} />
              <button onClick={format} disabled={!!jsonError} title="JSON 들여쓰기 정리">포멧팅</button>
            </span>
          </div>
          <textarea
            ref={bodyRef}
            onSelect={rememberCaret}
            onKeyUp={rememberCaret}
            onClick={rememberCaret}
            onBlur={rememberCaret}
            className={`body ${jsonError ? 'bad' : ''}`}
            value={bodyText}
            onChange={(e) => onBody(e.target.value)}
            spellCheck={false}
          />
          {jsonError && <div className="err-line">JSON 처럼 보이는데 문법이 틀렸어요 (문자열로 저장됨): {jsonError}</div>}
        </div>
      )}

      {tab === 'headers' && (
        <div className="pane">
          <table className="kv">
            <thead>
              <tr><th>Header</th><th>Value</th><th /></tr>
            </thead>
            <tbody>
              {Object.entries(r.headers).map(([k, v], i) => (
                <tr key={i}>
                  <td><input value={k} onChange={(e) => setHeader(i, e.target.value, v)} placeholder="content-type" /></td>
                  <td><input value={v} onChange={(e) => setHeader(i, k, e.target.value)} placeholder="application/json" /></td>
                  <td><button className="icon danger" onClick={() => delHeader(i)}>✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <button onClick={() => onChange({ headers: { ...r.headers, '': '' } })} disabled={'' in r.headers}>＋ 헤더</button>
          <p className="hint">content-type 을 안 주면 application/json 으로 나가요.</p>
        </div>
      )}

      {tab === 'rules' && (
        <div className="pane">
          <table className="kv rules">
            <thead>
              <tr><th>어디서</th><th>키</th><th>값이 이것과 같으면</th><th /></tr>
            </thead>
            <tbody>
              {r.rules.map((rule, i) => (
                <tr key={i}>
                  <td>
                    <select value={rule.target} onChange={(e) => setRule(i, { target: e.target.value as Rule['target'] })}>
                      <option value="params">URL 파라미터 (:id)</option>
                      <option value="query">쿼리스트링 (?a=)</option>
                      <option value="header">요청 헤더</option>
                      <option value="body">요청 body (최상위 키)</option>
                    </select>
                  </td>
                  <td><input value={rule.key} onChange={(e) => setRule(i, { key: e.target.value })} placeholder="id" /></td>
                  <td><input value={rule.equals} onChange={(e) => setRule(i, { equals: e.target.value })} placeholder="0" /></td>
                  <td><button className="icon danger" onClick={() => onChange({ rules: r.rules.filter((_, j) => j !== i) })}>✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <button onClick={() => onChange({ rules: [...r.rules, { target: 'params', key: '', equals: '' }] })}>＋ 규칙</button>
          <p className="hint">
            규칙이 <b>모두</b> 맞을 때 이 응답을 써요. 규칙이 하나도 없으면 "기본 응답" 후보가 돼요.
          </p>
        </div>
      )}
    </div>
  );
}
