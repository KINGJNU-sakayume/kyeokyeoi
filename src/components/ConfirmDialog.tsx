import { useEffect } from 'react';

interface ConfirmDialogProps {
  message: string;
  subMessage?: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmLabel?: string;
  destructive?: boolean;
  busy?: boolean;
}

export default function ConfirmDialog({ message, subMessage, onConfirm, onCancel, confirmLabel = '확인', destructive, busy }: ConfirmDialogProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopImmediatePropagation(); onCancel(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onCancel]);

  return (
    <div className="dialog-wrap" onClick={onCancel}>
      <div className="dialog" role="alertdialog" aria-modal="true" aria-label={message} onClick={e => e.stopPropagation()}>
        <p className="dialog__title">{message}</p>
        {subMessage && <p className="dialog__body">{subMessage}</p>}
        <div className="dialog__actions">
          <button type="button" className="text-btn text-btn--muted" onClick={onCancel}>취소</button>
          <button
            type="button"
            className={destructive ? 'text-btn text-btn--danger' : 'text-btn'}
            onClick={onConfirm}
            disabled={busy}
            autoFocus
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
