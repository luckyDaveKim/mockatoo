import { Modal } from './Modal';

interface Props {
  title: string;
  message?: string;
  confirmLabel?: string;
  danger?: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
}

/** 시스템 confirm() 대신 쓰는 확인 모달 */
export function ConfirmDialog({ title, message, confirmLabel = '확인', danger, onClose, onConfirm }: Props) {
  const ok = () => {
    onClose();
    void onConfirm();
  };

  return (
    <Modal title={title} onClose={onClose} className="modal-sm">
      {message && <p className="hint">{message}</p>}
      <div className="row end">
        <button onClick={onClose}>취소</button>
        <button className={danger ? 'danger' : 'primary'} onClick={ok} autoFocus>{confirmLabel}</button>
      </div>
    </Modal>
  );
}
