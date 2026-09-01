import { useEffect, useMemo, useRef, useState } from 'react';
import { HelpDialog, TemplateHelp } from './HelpDialog';

export interface Snippet {
  group: string;
  label: string;
  /** JSON 밖에서 쓰는 원본. 예: {{faker "person.fullName"}} */
  raw: string;
}

// 자주 쓰는 템플릿. faker 는 서버가 점 경로 그대로 실행하므로 여기 없는 것도 직접 쓸 수 있다
export const SNIPPETS: Snippet[] = [
  { group: '요청', label: 'URL 파라미터 (:id)', raw: '{{urlParam "id"}}' },
  { group: '요청', label: '쿼리 파라미터 (?q=)', raw: '{{queryParam "q"}}' },
  { group: '요청', label: '요청 헤더', raw: '{{header "authorization"}}' },
  { group: '사람', label: '이름', raw: '{{faker "person.fullName"}}' },
  { group: '사람', label: '이름 (성)', raw: '{{faker "person.lastName"}}' },
  { group: '사람', label: '이메일', raw: '{{faker "internet.email"}}' },
  { group: '사람', label: '전화번호', raw: '{{faker "phone.number"}}' },
  { group: '사람', label: '아바타 URL', raw: '{{faker "image.avatar"}}' },
  { group: '식별', label: 'UUID', raw: '{{faker "string.uuid"}}' },
  { group: '식별', label: '숫자 (int)', raw: '{{faker "number.int"}}' },
  { group: '식별', label: '불리언', raw: '{{faker "datatype.boolean"}}' },
  { group: '시간', label: '최근 날짜', raw: '{{faker "date.recent"}}' },
  { group: '시간', label: '과거 날짜', raw: '{{faker "date.past"}}' },
  { group: '시간', label: '미래 날짜', raw: '{{faker "date.future"}}' },
  { group: '텍스트', label: '단어', raw: '{{faker "lorem.word"}}' },
  { group: '텍스트', label: '문장', raw: '{{faker "lorem.sentence"}}' },
  { group: '텍스트', label: '문단', raw: '{{faker "lorem.paragraph"}}' },
  { group: '인터넷', label: 'URL', raw: '{{faker "internet.url"}}' },
  { group: '인터넷', label: '도메인', raw: '{{faker "internet.domainName"}}' },
  { group: '인터넷', label: 'IP', raw: '{{faker "internet.ip"}}' },
  { group: '장소', label: '도시', raw: '{{faker "location.city"}}' },
  { group: '장소', label: '주소', raw: '{{faker "location.streetAddress"}}' },
  { group: '장소', label: '나라', raw: '{{faker "location.country"}}' },
  { group: '상거래', label: '상품명', raw: '{{faker "commerce.productName"}}' },
  { group: '상거래', label: '가격', raw: '{{faker "commerce.price"}}' },
  { group: '상거래', label: '회사명', raw: '{{faker "company.name"}}' }
];

interface Props {
  onPick: (raw: string) => void;
}

/** "＋ 템플릿" 버튼 + 검색 가능한 드롭다운. 고르면 onPick(raw) 호출 */
export function TemplateMenu({ onPick }: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [help, setHelp] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', h);
    document.addEventListener('keydown', k);
    return () => {
      document.removeEventListener('mousedown', h);
      document.removeEventListener('keydown', k);
    };
  }, [open]);

  const groups = useMemo(() => {
    const t = q.trim().toLowerCase();
    const hit = SNIPPETS.filter((s) => !t || s.label.toLowerCase().includes(t) || s.raw.toLowerCase().includes(t) || s.group.includes(t));
    const m = new Map<string, Snippet[]>();
    for (const s of hit) m.set(s.group, [...(m.get(s.group) ?? []), s]);
    return [...m.entries()];
  }, [q]);

  // 목록에 없는 faker 경로를 직접 친 경우 (예: "animal.dog") 그대로 faker 로 감싸서 제안
  const custom = q.trim() && /^[a-z]+\.[a-zA-Z.]+$/.test(q.trim()) ? `{{faker "${q.trim()}"}}` : null;

  const pick = (raw: string) => {
    onPick(raw);
    setOpen(false);
    setQ('');
  };

  return (
    <span className="tmpl-wrap" ref={wrap}>
      <button onClick={() => setOpen((o) => !o)} title="커서 위치에 템플릿 넣기">
        ＋ 템플릿 ▾
      </button>
      <button className="help" onClick={() => setHelp(true)} title="템플릿 사용법">?</button>
      {help && (
        <HelpDialog title="템플릿 사용법" onClose={() => setHelp(false)}>
          <TemplateHelp />
        </HelpDialog>
      )}
      {open && (
        <div className="menu tmpl-menu">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="검색 또는 faker 경로 (예: animal.dog)"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const first = groups[0]?.[1][0];
                if (custom && !first) pick(custom);
                else if (first) pick(first.raw);
              }
            }}
          />
          <div className="tmpl-list">
            {groups.map(([g, items]) => (
              <div key={g} className="tmpl-group">
                <div className="tmpl-group-name">{g}</div>
                {items.map((s) => (
                  <button key={s.raw} onClick={() => pick(s.raw)} title={s.raw}>
                    <span>{s.label}</span>
                    <code>{s.raw}</code>
                  </button>
                ))}
              </div>
            ))}
            {custom && (
              <div className="tmpl-group">
                <div className="tmpl-group-name">직접 입력</div>
                <button onClick={() => pick(custom)}>
                  <span>faker 경로로 넣기</span>
                  <code>{custom}</code>
                </button>
              </div>
            )}
            {!groups.length && !custom && <div className="hint">없어요. faker 경로를 직접 쳐도 돼요 (예: animal.dog)</div>}
          </div>
        </div>
      )}
    </span>
  );
}
