import type { Memory } from '../db/index';
import { formatTimeDisplay } from '../utils/timeUtils';

interface MemoryCardProps {
  memory: Memory;
  onClick: () => void;
}

export default function MemoryCard({ memory, onClick }: MemoryCardProps) {
  const timeDisplay = formatTimeDisplay(memory);

  return (
    <button
      onClick={onClick}
      style={{
        display: 'block', width: '100%', textAlign: 'left',
        background: 'var(--color-bg)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)',
        padding: '14px',
        cursor: 'pointer',
        transition: 'box-shadow 0.15s',
      }}
    >
      {/* Top row: region + date */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
        {memory.regionLabel && (
          <span style={{ fontSize: '12px', color: 'var(--color-primary)', fontWeight: 500, flex: 1 }}>
            {memory.regionLabel}
          </span>
        )}
        {timeDisplay && (
          <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)', flexShrink: 0, marginLeft: '8px' }}>
            {timeDisplay}
          </span>
        )}
      </div>

      {/* Title */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <span style={{ fontWeight: 700, fontSize: '15px', color: 'var(--color-text-primary)', flex: 1 }}>
          {memory.title}
        </span>
        {memory.isFirst && (
          <span style={{
            fontSize: '11px', fontWeight: 600,
            background: '#FFF3E0', color: 'var(--color-accent)',
            padding: '2px 7px', borderRadius: '10px', flexShrink: 0,
          }}>
            첫 경험
          </span>
        )}
      </div>

      {/* Emotions + Song row */}
      {(memory.emotions.length > 0 || memory.song) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
          {memory.emotions.length > 0 && (
            <span style={{ fontSize: '15px', letterSpacing: '1px' }}>
              {memory.emotions.join('')}
            </span>
          )}
          {memory.song && (
            <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              ♪ {memory.song.artist} · {memory.song.title}
            </span>
          )}
        </div>
      )}

      {/* Photo + Memo row */}
      <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
        {memory.photos.length > 0 && (
          <img
            src={memory.photos[0]}
            alt="사진"
            style={{ width: '52px', height: '52px', objectFit: 'cover', borderRadius: 'var(--radius-sm)', flexShrink: 0 }}
          />
        )}
        {memory.memo && (
          <p style={{
            fontSize: '13px', color: 'var(--color-text-secondary)',
            overflow: 'hidden', display: '-webkit-box',
            WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
            lineHeight: 1.5,
          }}>
            {memory.memo}
          </p>
        )}
      </div>
    </button>
  );
}
