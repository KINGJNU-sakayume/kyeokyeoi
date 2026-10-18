import { useEffect, useRef, useState } from 'react';
import { usePhotoURL } from '../utils/photoUtils';
import { IconClose } from './icons';

function Photo({ id, alt }: { id: string; alt: string }) {
  const url = usePhotoURL(id);
  return url ? <img src={url} alt={alt} /> : <img alt="" />;
}

/** 상세 화면의 사진 줄. 누르면 전체 화면으로 보고 좌우로 넘겨요. */
export default function PhotoGallery({ photoIds }: { photoIds: string[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const startX = useRef<number | null>(null);

  useEffect(() => {
    if (open === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(null);
      if (e.key === 'ArrowRight') setOpen(i => (i === null ? i : (i + 1) % photoIds.length));
      if (e.key === 'ArrowLeft') setOpen(i => (i === null ? i : (i - 1 + photoIds.length) % photoIds.length));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, photoIds.length]);

  if (photoIds.length === 0) return null;

  return (
    <>
      <div className={photoIds.length === 1 ? 'detail__photos detail__photos--single' : 'detail__photos'}>
        {photoIds.map((id, i) => (
          <button key={id} type="button" onClick={() => setOpen(i)} aria-label={`사진 ${i + 1} 크게 보기`}>
            <Photo id={id} alt={`사진 ${i + 1}`} />
          </button>
        ))}
      </div>

      {open !== null && (
        <div
          className="lightbox"
          role="dialog"
          aria-modal="true"
          aria-label="사진 보기"
          onPointerDown={e => { startX.current = e.clientX; }}
          onPointerUp={e => {
            if (startX.current === null) return;
            const dx = e.clientX - startX.current;
            startX.current = null;
            if (Math.abs(dx) < 50 || photoIds.length < 2) return;
            setOpen(i => (i === null ? i : (i + (dx < 0 ? 1 : -1) + photoIds.length) % photoIds.length));
          }}
        >
          <div className="lightbox__bar">
            <span>{open + 1} / {photoIds.length}</span>
            <button type="button" className="icon-btn" onClick={() => setOpen(null)} aria-label="닫기"><IconClose /></button>
          </div>
          <div className="lightbox__img">
            <Photo id={photoIds[open]} alt={`사진 ${open + 1}`} />
          </div>
        </div>
      )}
    </>
  );
}
