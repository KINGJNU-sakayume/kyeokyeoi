interface ConfirmDialogProps {
  message: string;
  subMessage?: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmLabel?: string;
  destructive?: boolean;
}

export default function ConfirmDialog({ message, subMessage, onConfirm, onCancel, confirmLabel = '확인', destructive }: ConfirmDialogProps) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '24px',
        animation: 'fadeIn 0.15s ease',
      }}
      onClick={onCancel}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--color-bg)',
          borderRadius: 'var(--radius-lg)',
          padding: '24px',
          width: '100%',
          maxWidth: '320px',
          boxShadow: 'var(--shadow-lg)',
        }}
      >
        <p style={{ fontWeight: 700, fontSize: '16px', marginBottom: subMessage ? '8px' : '20px', textAlign: 'center' }}>
          {message}
        </p>
        {subMessage && (
          <p style={{ fontSize: '14px', color: 'var(--color-text-secondary)', marginBottom: '20px', textAlign: 'center', lineHeight: 1.5 }}>
            {subMessage}
          </p>
        )}
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={onCancel}
            style={{
              flex: 1, padding: '12px',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
              fontSize: '15px', fontWeight: 500,
              cursor: 'pointer', background: 'var(--color-bg)',
              color: 'var(--color-text-primary)',
            }}
          >
            취소
          </button>
          <button
            onClick={onConfirm}
            style={{
              flex: 1, padding: '12px',
              background: destructive ? 'var(--color-destructive)' : 'var(--color-primary)',
              color: 'white',
              borderRadius: 'var(--radius-md)',
              fontSize: '15px', fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
