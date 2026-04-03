import { useState, useRef } from 'react';

interface PhotoGalleryProps {
  photos: string[];
  editable?: boolean;
  onRemove?: (index: number) => void;
}

export default function PhotoGallery({ photos, editable, onRemove }: PhotoGalleryProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const touchStartX = useRef<number | null>(null);

  function openLightbox(index: number) {
    setLightboxIndex(index);
  }

  function closeLightbox() {
    setLightboxIndex(null);
  }

  function prevPhoto() {
    if (lightboxIndex === null) return;
    setLightboxIndex((lightboxIndex - 1 + photos.length) % photos.length);
  }

  function nextPhoto() {
    if (lightboxIndex === null) return;
    setLightboxIndex((lightboxIndex + 1) % photos.length);
  }

  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (dx > 50) prevPhoto();
    else if (dx < -50) nextPhoto();
    touchStartX.current = null;
  }

  if (photos.length === 0) return null;

  return (
    <>
      {/* Thumbnail strip */}
      <div style={{
        display: 'flex', gap: '8px', overflowX: 'auto',
        paddingBottom: '4px',
      }}>
        {photos.map((photo, i) => (
          <div key={i} style={{ position: 'relative', flexShrink: 0 }}>
            <button
              onClick={() => openLightbox(i)}
              style={{ padding: 0, display: 'block', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}
            >
              <img
                src={photo}
                alt={`사진 ${i + 1}`}
                style={{ width: '72px', height: '72px', objectFit: 'cover', display: 'block' }}
              />
            </button>
            {editable && onRemove && (
              <button
                onClick={() => onRemove(i)}
                style={{
                  position: 'absolute', top: '-6px', right: '-6px',
                  width: '20px', height: '20px',
                  background: 'var(--color-destructive)', color: 'white',
                  borderRadius: '50%', fontSize: '12px', fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  lineHeight: 1, cursor: 'pointer',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                }}
                aria-label="사진 제거"
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Lightbox */}
      {lightboxIndex !== null && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 200,
            background: 'rgba(0,0,0,0.95)',
            display: 'flex', flexDirection: 'column',
            animation: 'fadeIn 0.2s ease',
          }}
          onClick={closeLightbox}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {/* Counter */}
          <div style={{
            padding: '16px', textAlign: 'center',
            color: 'rgba(255,255,255,0.7)', fontSize: '14px',
            flexShrink: 0,
          }}>
            {lightboxIndex + 1} / {photos.length}
          </div>

          {/* Image */}
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 16px' }}>
            <img
              src={photos[lightboxIndex]}
              alt={`사진 ${lightboxIndex + 1}`}
              style={{
                maxWidth: '100%', maxHeight: '100%',
                objectFit: 'contain',
                borderRadius: 'var(--radius-sm)',
              }}
              onClick={e => e.stopPropagation()}
            />
          </div>

          {/* Nav buttons */}
          {photos.length > 1 && (
            <div style={{
              display: 'flex', justifyContent: 'space-between',
              padding: '16px', flexShrink: 0,
            }}>
              <button
                onClick={e => { e.stopPropagation(); prevPhoto(); }}
                style={{
                  padding: '10px 20px', color: 'white',
                  background: 'rgba(255,255,255,0.15)',
                  borderRadius: 'var(--radius-md)', fontSize: '14px', cursor: 'pointer',
                }}
              >
                ← 이전
              </button>
              <button
                onClick={e => { e.stopPropagation(); nextPhoto(); }}
                style={{
                  padding: '10px 20px', color: 'white',
                  background: 'rgba(255,255,255,0.15)',
                  borderRadius: 'var(--radius-md)', fontSize: '14px', cursor: 'pointer',
                }}
              >
                다음 →
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
