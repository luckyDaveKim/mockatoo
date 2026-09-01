import type { ReactNode } from 'react';
import { Modal } from './Modal';

interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/** 도움말 모달. 본문은 자유롭게 (표, 코드 등) */
export function HelpDialog({ title, onClose, children }: Props) {
  return (
    <Modal title={title} onClose={onClose} className="help-modal">
      <div className="help-body">{children}</div>
      <div className="row end">
        <button className="primary" onClick={onClose} autoFocus>닫기</button>
      </div>
    </Modal>
  );
}

/** 경로 정규식 도움말 본문 */
export function PathHelp() {
  return (
    <>
      <p>경로는 두 가지 방식으로 쓸 수 있어요.</p>
      <h4>1. 일반 경로</h4>
      <table>
        <tbody>
          <tr><td><code>/users</code></td><td>정확히 이 경로만</td></tr>
          <tr><td><code>/users/:id</code></td><td><code>:id</code> 자리에 아무 값. 응답에서 <code>{'{{urlParam "id"}}'}</code> 로 꺼내요</td></tr>
          <tr><td><code>/files/*</code></td><td>뒤에 무엇이 와도 (하위 경로 포함)</td></tr>
        </tbody>
      </table>
      <h4>2. 정규식 경로</h4>
      <p>
        경로에 <code>( ) ? + [ ] {'{ }'} | \ ^ $</code> 중 하나라도 있으면 정규식으로 취급해요.
        경로 전체가 정확히 맞아야 해요 (앞뒤에 <code>^</code> <code>$</code> 가 자동으로 붙어요).
      </p>
      <table>
        <tbody>
          <tr><td><code>/pattern(s)?</code></td><td><code>/pattern</code>, <code>/patterns</code> 둘 다</td></tr>
          <tr><td><code>/v[12]/users</code></td><td><code>/v1/users</code>, <code>/v2/users</code></td></tr>
          <tr><td><code>/(posts|articles)/:id</code></td><td>두 이름 중 하나 + id</td></tr>
          <tr><td><code>/items/\d+</code></td><td>숫자만 (<code>/items/42</code>)</td></tr>
          <tr><td><code>/api/(v\d+)/*</code></td><td>버전 뒤에 아무 경로</td></tr>
        </tbody>
      </table>
      <ul>
        <li><code>:name</code> 은 정규식 안에서도 그대로 써요 → <code>[^/]+</code> 로 바뀌고 <code>urlParam</code> 으로 읽어요.</li>
        <li><code>/*</code> 는 <code>/.*</code> 로 바뀌어요.</li>
        <li>일반 경로가 먼저, 정규식 경로는 그다음에 검사해요. 정규식끼리는 목록 순서대로 첫 번째가 이겨요.</li>
      </ul>
    </>
  );
}

/** 응답 템플릿 도움말 본문 */
export function TemplateHelp() {
  return (
    <>
      <p>
        응답 본문 안에 <code>{'{{ ... }}'}</code> 를 쓰면 요청이 올 때마다 그 자리에 값이 채워져요.
        문법은 Handlebars 예요. JSON 이면 문자열 안에 넣으세요: <code>{'"name": "{{faker \\"person.fullName\\"}}"'}</code>
      </p>
      <h4>요청에서 꺼내기</h4>
      <table>
        <tbody>
          <tr><td><code>{'{{urlParam "id"}}'}</code></td><td>경로의 <code>:id</code> 값</td></tr>
          <tr><td><code>{'{{queryParam "q"}}'}</code></td><td>쿼리스트링 <code>?q=</code> 값</td></tr>
          <tr><td><code>{'{{header "authorization"}}'}</code></td><td>요청 헤더 (대소문자 무관)</td></tr>
          <tr><td><code>{'{{body.title}}'}</code></td><td>요청 JSON 바디의 필드</td></tr>
          <tr><td><code>{'{{json body}}'}</code></td><td>요청 바디 전체를 JSON 문자열로</td></tr>
        </tbody>
      </table>
      <h4>가짜 데이터 (faker)</h4>
      <table>
        <tbody>
          <tr><td><code>{'{{faker "person.fullName"}}'}</code></td><td>이름</td></tr>
          <tr><td><code>{'{{faker "internet.email"}}'}</code></td><td>이메일</td></tr>
          <tr><td><code>{'{{faker "string.uuid"}}'}</code></td><td>UUID</td></tr>
          <tr><td><code>{'{{faker "number.int"}}'}</code></td><td>정수</td></tr>
          <tr><td><code>{'{{faker "date.recent"}}'}</code></td><td>최근 날짜</td></tr>
          <tr><td><code>{'{{faker "lorem.sentence"}}'}</code></td><td>문장</td></tr>
        </tbody>
      </table>
      <ul>
        <li>faker 는 <code>모듈.함수</code> 점 경로를 그대로 실행해요. 목록에 없어도 <a href="https://fakerjs.dev/api/" target="_blank" rel="noreferrer">fakerjs.dev/api</a> 에 있는 건 다 돼요 (예: <code>animal.dog</code>, <code>color.rgb</code>).</li>
        <li>템플릿 메뉴 검색창에 <code>animal.dog</code> 처럼 치면 바로 넣을 수 있어요.</li>
        <li>없는 값은 빈 문자열이 돼요. HTML 이스케이프는 하지 않아요.</li>
      </ul>
    </>
  );
}
