import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

interface SheetProps {
  onClose: () => void;
  /** 위쪽 막대: [왼쪽, 가운데 제목, 오른쪽] */
  title?: ReactNode;
  left?: ReactNode;
  right?: ReactNode;
  size?: 'tall' | 'auto';
  label: string;
  children: ReactNode;
}

/** 아래에서 올라오는 시트. 손잡이를 끌어내리거나 바깥을 누르거나 Esc로 닫혀요. */
export default function Sheet({ onClose, title, left, right, size = 'auto', label, children }: SheetProps) {
  const [drag, setDrag] = useState(0);
  const startY = useRef<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // 지도를 탭해 열 때 뒤따라오는 클릭이 바깥(scrim)에 떨어져 바로 닫히지 않게 잠깐 무시해요
  const [openedAt] = useState(() => performance.now());
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);

  useEffect(() => {
    // 위에 다른 시트·대화상자가 떠 있으면 맨 위 것만 Esc에 반응해요
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !ref.current) return;
      const layers = document.querySelectorAll('[aria-modal="true"]');
      if (layers[layers.length - 1] === ref.current) closeRef.current();
    };
    window.addEventListener('keydown', onKey);
    const prev = document.activeElement as HTMLElement | null;
    if (!ref.current?.contains(document.activeElement)) ref.current?.focus({ preventScroll: true });
    return () => { window.removeEventListener('keydown', onKey); prev?.focus?.({ preventScroll: true }); };
  }, []);

  return (
    <>
      <div className="scrim" onClick={() => { if (performance.now() - openedAt > 400) onClose(); }} />
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className={`sheet sheet--${size}`}
        style={drag ? { transform: `translate(-50%, ${drag}px)`, transition: 'none' } : undefined}
      >
        <div
          className="sheet__grip"
          onPointerDown={e => { startY.current = e.clientY; (e.target as Element).setPointerCapture(e.pointerId); }}
          onPointerMove={e => { if (startY.current != null) setDrag(Math.max(0, e.clientY - startY.current)); }}
          onPointerUp={() => { if (drag > 90) onClose(); setDrag(0); startY.current = null; }}
          onPointerCancel={() => { setDrag(0); startY.current = null; }}
        />
        {(title || left || right) && (
          <div className="sheet__bar">
            <div>{left}</div>
            <div className="sheet__title">{title}</div>
            <div>{right}</div>
          </div>
        )}
        {children}
      </div>
    </>
  );
}
