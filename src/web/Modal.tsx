import { useEffect, type ReactNode } from 'react';

/** Esc 키를 누르면 fn 호출 */
export function useEscape(fn: () => void) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') fn();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [fn]);
}

interface Props {
  title: string;
  onClose: () => void;
  /** 작업 중이면 배경 클릭/Esc 로 닫히지 않는다 */
  busy?: boolean;
  /** 추가 클래스 (modal-sm, help-modal 등) */
  className?: string;
  children: ReactNode;
}

/** 모든 다이얼로그의 공통 껍데기: 어두운 배경 + 흰 상자 + 제목. 배경 클릭·Esc 로 닫힘 */
export function Modal({ title, onClose, busy = false, className = '', children }: Props) {
  useEscape(() => {
    if (!busy) onClose();
  });
  return (
    <div className="modal-bg" onClick={() => !busy && onClose()}>
      <div className={`modal ${className}`} onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        {children}
      </div>
    </div>
  );
}
