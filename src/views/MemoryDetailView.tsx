import { useState, useEffect } from 'react';
import { useApp } from '../AppContext';
import { getMemory, deleteMemory } from '../db/index'
import type { Memory } from '../db/index';
import { formatTimeDisplay } from '../utils/timeUtils';
import PhotoGallery from '../components/PhotoGallery';
import ConfirmDialog from '../components/ConfirmDialog';

interface MemoryDetailViewProps {
  memoryId: string;
}

export default function MemoryDetailView({ memoryId }: MemoryDetailViewProps) {
  const { navigate, refreshMemories, openEditSheet, addSheetOpen } = useApp();
  const [memory, setMemory] = useState<Memory | null>(null);
  const [loading, setLoading] = useState(true);
  const [showConfirm, setShowConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    getMemory(memoryId).then(m => {
      setMemory(m ?? null);
      setLoading(false);
    });
  }, [memoryId]);

  // Refresh when sheet closes after edit
  useEffect(() => {
    if (!addSheetOpen) {
      getMemory(memoryId).then(m => m && setMemory(m));
    }
  }, [addSheetOpen, memoryId]);

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteMemory(memoryId);
      await refreshMemories();
      navigate({ type: 'main', tab: 'timeline' });
    } catch {
      setDeleting(false);
      setShowConfirm(false);
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--color-text-secondary)' }}>
        불러오는 중...
      </div>
    );
  }

  if (!memory) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '16px' }}>
        <p style={{ color: 'var(--color-text-secondary)' }}>추억을 찾을 수 없어요</p>
        <button
          onClick={() => navigate({ type: 'main', tab: 'timeline' })}
          style={{
            padding: '10px 20px', background: 'var(--color-primary)', color: 'white',
            borderRadius: 'var(--radius-md)', fontSize: '14px', fontWeight: 600, cursor: 'pointer',
          }}
        >
          돌아가기
        </button>
      </div>
    );
  }

  const timeDisplay = formatTimeDisplay(memory);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', animation: 'slideInRight 0.25s ease' }}>
      {/* Header */}
      <header style={{
        display: 'flex', alignItems: 'center', gap: '12px',
        padding: '0 16px',
        height: 'var(--header-height)',
        borderBottom: '1px solid var(--color-border)',
        background: 'var(--color-bg)',
        flexShrink: 0,
      }}>
        <button
          onClick={() => navigate({ type: 'main', tab: 'timeline' })}
          style={{ padding: '8px', color: 'var(--color-primary)', cursor: 'pointer', fontSize: '18px' }}
          aria-label="뒤로 가기"
        >
          ←
        </button>
        <h1 style={{
          flex: 1, fontSize: '16px', fontWeight: 700, overflow: 'hidden',
          textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {memory.title}
        </h1>
        <button
          onClick={() => openEditSheet(memoryId)}
          style={{ padding: '8px', color: 'var(--color-primary)', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}
        >
          수정
        </button>
      </header>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 16px' }}>
        {/* Region + Time */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px', flexWrap: 'wrap', gap: '4px' }}>
          {memory.regionLabel && (
            <span style={{ fontSize: '14px', color: 'var(--color-primary)', fontWeight: 500 }}>
              📍 {memory.regionLabel}
            </span>
          )}
          {timeDisplay && (
            <span style={{ fontSize: '14px', color: 'var(--color-text-secondary)' }}>
              🕐 {timeDisplay}
            </span>
          )}
        </div>

        {/* isFirst badge */}
        {memory.isFirst && (
          <div style={{ marginBottom: '16px' }}>
            <span style={{
              fontSize: '13px', fontWeight: 600,
              background: '#FFF3E0', color: 'var(--color-accent)',
              padding: '4px 12px', borderRadius: '12px',
            }}>
              ✨ 첫 경험
            </span>
          </div>
        )}

        {/* Emotions */}
        {memory.emotions.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
            {memory.emotions.map((emoji, i) => (
              <span key={i} style={{
                padding: '6px 10px', borderRadius: '20px', fontSize: '18px',
                background: 'var(--color-primary-light)',
                border: '1px solid var(--color-border)',
              }}>
                {emoji}
              </span>
            ))}
          </div>
        )}

        {/* Song */}
        {memory.song && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '12px 14px',
            background: 'var(--color-bg-secondary)',
            borderRadius: 'var(--radius-md)',
            marginBottom: '16px',
          }}>
            <span style={{ fontSize: '18px' }}>♪</span>
            <span style={{ fontSize: '14px', color: 'var(--color-text-primary)' }}>
              <strong>{memory.song.artist}</strong>
              {memory.song.title && ` · ${memory.song.title}`}
            </span>
          </div>
        )}

        {/* Photos */}
        {memory.photos.length > 0 && (
          <div style={{ marginBottom: '16px' }}>
            <PhotoGallery photos={memory.photos} />
          </div>
        )}

        {/* Memo */}
        {memory.memo && (
          <div style={{
            borderTop: '1px solid var(--color-border)',
            paddingTop: '16px', marginBottom: '16px',
          }}>
            <p style={{ fontSize: '15px', color: 'var(--color-text-primary)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
              {memory.memo}
            </p>
          </div>
        )}

        {/* Timestamps */}
        <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid var(--color-border)' }}>
          <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
            기록: {new Date(memory.createdAt).toLocaleDateString('ko-KR')}
          </p>
        </div>
      </div>

      {/* Delete button */}
      <div style={{ padding: '12px 16px', borderTop: '1px solid var(--color-border)', flexShrink: 0, background: 'var(--color-bg)' }}>
        <button
          onClick={() => setShowConfirm(true)}
          disabled={deleting}
          style={{
            width: '100%', padding: '13px',
            background: 'var(--color-destructive-bg)',
            color: 'var(--color-destructive)',
            border: '1px solid var(--color-destructive)',
            borderRadius: 'var(--radius-md)',
            fontSize: '14px', fontWeight: 600, cursor: 'pointer',
          }}
        >
          {deleting ? '삭제 중...' : '이 추억 삭제'}
        </button>
      </div>

      {showConfirm && (
        <ConfirmDialog
          message="이 추억을 삭제할까요?"
          subMessage="되돌릴 수 없어요."
          confirmLabel="삭제"
          destructive
          onConfirm={handleDelete}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </div>
  );
}
