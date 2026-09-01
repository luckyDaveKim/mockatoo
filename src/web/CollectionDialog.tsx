import { useState } from 'react';
import { api } from './api';
import { Modal } from './Modal';
import { defaultPrefix, normalizePrefix, parseHeaders, type MockCollection } from './types';

type Source = 'empty' | 'url' | 'text';

interface CreateProps {
  mode: 'create';
  /** 이미 컬렉션이 있으면 이름으로 접두어를 만들고, 없으면 루트('')로 시작 */
  hasOthers: boolean;
  onClose: () => void;
  onDone: (name: string) => void | Promise<void>;
}
interface EditProps {
  mode: 'edit';
  name: string;
  doc: MockCollection;
  onClose: () => void;
  onDone: (name: string) => void | Promise<void>;
  onDelete: () => void;
}
type Props = CreateProps | EditProps;

/** 컬렉션 만들기(빈 것 / OpenAPI 에서) · 설정(이름·접두어·CORS·삭제) 한 곳에서 */
export function CollectionDialog(props: Props) {
  const isEdit = props.mode === 'edit';
  const init = isEdit ? props.doc : null;

  const [name, setName] = useState(isEdit ? props.name : '');
  const [prefix, setPrefix] = useState(init ? init.prefix : props.mode === 'create' && !props.hasOthers ? '' : '');
  const [prefixTouched, setPrefixTouched] = useState(isEdit || (props.mode === 'create' && !props.hasOthers));
  const [cors, setCors] = useState(init?.cors ?? true);
  const [description, setDescription] = useState(init?.description ?? '');
  const [source, setSource] = useState<Source>('empty');
  const [url, setUrl] = useState('');
  const [text, setText] = useState('');
  const [header, setHeader] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const trimmedName = name.trim();
  const canSubmit =
    !!trimmedName && !busy && (isEdit || source === 'empty' || (source === 'url' ? !!url.trim() : !!text.trim()));

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setErr('');
    const p = normalizePrefix(prefix);
    try {
      if (props.mode === 'create') {
        if (source === 'empty') {
          await api.save(trimmedName, { name: trimmedName, prefix: p, cors, ...(description.trim() ? { description: description.trim() } : {}), folders: [], routes: [] });
        } else {
          await api.importOpenApi({
            name: trimmedName,
            prefix: p,
            headers: parseHeaders([header]),
            ...(source === 'url' ? { url: url.trim() } : { text })
          });
        }
        await props.onDone(trimmedName);
      } else {
        // 설정 저장 = 지금 편집 중인 문서까지 함께 저장. 이름이 바뀌면 새 이름으로 저장한 뒤 옛 것을 지운다
        await api.save(trimmedName, { ...props.doc, name: trimmedName, prefix: p, cors, description: description.trim() || undefined });
        if (trimmedName !== props.name) await api.remove(props.name);
        await props.onDone(trimmedName);
      }
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <Modal title={isEdit ? '컬렉션 설정' : '새 컬렉션'} onClose={props.onClose} busy={busy}>
      {!isEdit && (
        <div className="seg" role="tablist">
          {(
            [
              ['empty', '빈 컬렉션'],
              ['url', 'OpenAPI URL'],
              ['text', 'OpenAPI 붙여넣기']
            ] as [Source, string][]
          ).map(([k, label]) => (
            <button key={k} role="tab" className={source === k ? 'on' : ''} onClick={() => setSource(k)} type="button">
              {label}
            </button>
          ))}
        </div>
      )}

      {!isEdit && source === 'url' && (
        <>
          <label>
            문서 URL
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…/openapi.json 또는 /v3/api-docs" autoFocus />
          </label>
          <label>
            요청 헤더 (선택)
            <input value={header} onChange={(e) => setHeader(e.target.value)} placeholder="Authorization: Bearer xxx" />
          </label>
        </>
      )}
      {!isEdit && source === 'text' && (
        <label>
          OpenAPI / Swagger 문서 (JSON 또는 YAML)
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={8} placeholder={'openapi: 3.0.0\ninfo: …'} spellCheck={false} autoFocus />
        </label>
      )}

      <div className="stack">
        <label>
          이름 (= 파일 이름)
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (!prefixTouched) setPrefix(e.target.value ? defaultPrefix(e.target.value) : '');
            }}
            placeholder="petstore"
            autoFocus={isEdit || source === 'empty'}
            onFocus={(e) => e.target.select()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submit();
            }}
          />
        </label>
        <label>
          설명 (선택)
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="이 컬렉션의 설명" />
        </label>
        <label title="이 컬렉션의 라우트가 붙는 경로 접두어. 비우면 루트(접두어 없음). 컬렉션끼리 겹칠 수 없고, 루트는 하나만">
          경로 접두어 (비우면 루트)
          <input
            value={prefix}
            onChange={(e) => {
              setPrefixTouched(true);
              setPrefix(e.target.value);
            }}
            onBlur={(e) => setPrefix(normalizePrefix(e.target.value))}
            placeholder="/ (루트)"
            spellCheck={false}
          />
        </label>
        <label className="check">
          <span>CORS</span>
          <span className="row">
            <input type="checkbox" checked={cors} onChange={(e) => setCors(e.target.checked)} />
            모든 출처 허용
          </span>
        </label>
      </div>

      <p className="hint">
        {isEdit
          ? '저장하면 지금 편집 중인 라우트도 함께 저장돼요. 이름을 바꾸면 파일 이름도 바뀌어요.'
          : source === 'empty'
            ? '라우트는 접두어 뒤에 붙어요 (예: /petstore/pets). 접두어는 컬렉션끼리 겹칠 수 없어요.'
            : '같은 이름의 컬렉션이 있으면 덮어써요. 라우트는 접두어 뒤에 붙어요 (예: /petstore/pets).'}
      </p>
      {err && <div className="err-line">{err}</div>}

      <div className={`row ${isEdit ? 'between' : 'end'}`}>
        {isEdit && (
          <button className="danger" onClick={props.onDelete} disabled={busy}>
            컬렉션 삭제
          </button>
        )}
        <span className="row">
          <button onClick={props.onClose} disabled={busy}>
            취소
          </button>
          <button className="primary" onClick={() => void submit()} disabled={!canSubmit}>
            {busy ? (isEdit ? '저장 중…' : '만드는 중…') : isEdit ? '저장' : source === 'empty' ? '만들기' : '가져와서 만들기'}
          </button>
        </span>
      </div>
    </Modal>
  );
}
