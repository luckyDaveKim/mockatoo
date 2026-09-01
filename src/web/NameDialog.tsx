import { useState } from 'react';
import { Modal } from './Modal';

interface Props {
  title: string;
  defaultValue?: string;
  placeholder?: string;
  submitLabel?: string;
  onClose: () => void;
  onSubmit: (value: string) => void;
}

/** 시스템 prompt() 대신 쓰는 한 줄 입력 모달 */
export function NameDialog({ title, defaultValue = '', placeholder, submitLabel = '확인', onClose, onSubmit }: Props) {
  const [value, setValue] = useState(defaultValue);
  const trimmed = value.trim();

  const submit = () => {
    if (!trimmed) return;
    onSubmit(trimmed);
    onClose();
  };

  return (
    <Modal title={title} onClose={onClose} className="modal-sm">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
        }}
        placeholder={placeholder}
        autoFocus
        onFocus={(e) => e.target.select()}
      />
      <div className="row end">
        <button onClick={onClose}>취소</button>
        <button className="primary" onClick={submit} disabled={!trimmed}>{submitLabel}</button>
      </div>
    </Modal>
  );
}
