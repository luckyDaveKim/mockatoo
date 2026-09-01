import { useState } from 'react';
import { api, type ProbeResult } from './api';
import { Modal } from './Modal';
import { METHODS, bodyToText, newResponse, parseHeaders, uid, type Method, type Route } from './types';

interface Props {
  prefix: string;
  folderId: string | null;
  onClose: () => void;
  onCreate: (route: Route) => void;
}

/** 실제 API 를 한 번 호출해서 URL·상태·응답 본문으로 라우트를 만든다 */
export function ImportApiDialog({ prefix, folderId, onClose, onCreate }: Props) {
  const [method, setMethod] = useState<Method>('GET');
  const [url, setUrl] = useState('');
  const [headers, setHeaders] = useState('');
  const [reqBody, setReqBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [result, setResult] = useState<ProbeResult | null>(null);
  const [path, setPath] = useState('');

  const hasBody = !['GET', 'HEAD'].includes(method);

  const probe = async () => {
    const u = url.trim();
    if (!u || busy) return;
    setBusy(true);
    setErr('');
    setResult(null);
    try {
      const r = await api.probe({ method, url: u, headers: parseHeaders(headers.split('\n')), body: hasBody && reqBody ? reqBody : undefined });
      setResult(r);
      // 컬렉션 접두어로 시작하면 그 부분은 떼어낸다 (라우트 경로는 접두어 뒤에 붙으니까)
      const p = prefix && r.path.startsWith(prefix + '/') ? r.path.slice(prefix.length) : r.path;
      setPath(p || '/');
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const create = () => {
    if (!result) return;
    const route: Route = {
      id: uid(),
      method,
      path: path.trim() || '/',
      description: `${url.trim()} 에서 가져옴`,
      folderId,
      responses: [{ ...newResponse(result.status), label: 'OK', headers: result.headers, body: result.body as Route['responses'][number]['body'] }]
    };
    onCreate(route);
    onClose();
  };

  return (
    <Modal title="API 에서 라우트 가져오기" onClose={onClose} busy={busy}>
      <div className="stack">
        <label>
          요청
          <div className="row">
            <select value={method} onChange={(e) => setMethod(e.target.value as Method)}>
              {METHODS.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://api.example.com/users/1?x=1"
              autoFocus
              spellCheck={false}
              style={{ flex: 1 }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void probe();
              }}
            />
            <button className="primary" onClick={() => void probe()} disabled={!url.trim() || busy}>
              {busy ? '호출 중…' : '호출'}
            </button>
          </div>
        </label>
        <label>
          요청 헤더 (선택, 한 줄에 하나)
          <textarea value={headers} onChange={(e) => setHeaders(e.target.value)} rows={2} placeholder={'Authorization: Bearer xxx\nCookie: a=b'} spellCheck={false} />
        </label>
        {hasBody && (
          <label>
            요청 본문 (선택)
            <textarea value={reqBody} onChange={(e) => setReqBody(e.target.value)} rows={3} placeholder='{"key": "value"}' spellCheck={false} />
          </label>
        )}
      </div>

      {err && <div className="err-line">{err}</div>}

      {result && (
        <div className="stack probe-result">
          <label>
            라우트 경로 {prefix && <span className="hint" style={{ margin: 0 }}>(접두어 {prefix} 뒤에 붙어요)</span>}
            <input value={path} onChange={(e) => setPath(e.target.value)} spellCheck={false} />
          </label>
          <label>
            응답 미리보기 · HTTP {result.status} {result.headers['content-type'] && <span className="pill">{result.headers['content-type']}</span>}
            <textarea value={bodyToText(result.body as Route['responses'][number]['body'])} readOnly rows={10} spellCheck={false} />
          </label>
        </div>
      )}

      <p className="hint">서버가 대신 호출해요 (브라우저 CORS 영향 없음). 응답 상태·content-type·본문이 그대로 라우트 응답이 돼요.</p>

      <div className="row end">
        <button onClick={onClose} disabled={busy}>취소</button>
        <button className="primary" onClick={create} disabled={!result || busy}>라우트 추가</button>
      </div>
    </Modal>
  );
}
