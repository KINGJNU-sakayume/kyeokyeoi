import { useMemo, useState } from 'react';
import { useApp } from '../AppContext';
import MemoryCard from '../components/MemoryCard';
import { sortMemories } from '../utils/timeUtils';
import type { Memory } from '../db/index';

type Filter = 'all' | 'first' | 'photo';

const FILTER_LABELS: Record<Filter, string> = {
  all: '전체',
  first: '첫 경험',
  photo: '사진 있는 것',
};

export default function TimelineTab() {
  const { memories, navigate, openAddSheet } = useApp();
  const [filter, setFilter] = useState<Filter>('all');

  const filtered: Memory[] = useMemo(() => {
    switch (filter) {
      case 'first': return memories.filter(m => m.isFirst);
      case 'photo': return memories.filter(m => m.photos.length > 0);
      default: return memories;
    }
  }, [memories, filter]);

  const groups = useMemo(() => sortMemories(filtered), [filtered]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{
        padding: '16px 16px 0',
        background: 'var(--color-bg)',
        borderBottom: '1px solid var(--color-border)',
        flexShrink: 0,
      }}>
        <h1 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--color-primary-deep)', marginBottom: '12px' }}>
          타임라인
        </h1>
        {/* Filter chips */}
        <div style={{ display: 'flex', gap: '8px', paddingBottom: '12px', overflowX: 'auto' }}>
          {(['all', 'first', 'photo'] as Filter[]).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                padding: '6px 14px', borderRadius: '20px', fontSize: '13px', fontWeight: 500,
                whiteSpace: 'nowrap', flexShrink: 0,
                background: filter === f ? 'var(--color-primary)' : 'var(--color-bg-secondary)',
                color: filter === f ? 'white' : 'var(--color-text-secondary)',
                border: `1px solid ${filter === f ? 'var(--color-primary)' : 'var(--color-border)'}`,
                transition: 'all 0.15s',
                cursor: 'pointer',
              }}
            >
              {FILTER_LABELS[f]}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px 80px' }}>
        {groups.length === 0 ? (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            paddingTop: '60px', gap: '12px',
          }}>
            <p style={{ fontSize: '15px', color: 'var(--color-text-secondary)', textAlign: 'center', lineHeight: 1.6 }}>
              {filter === 'all'
                ? '아직 기록된 추억이 없어요.\n첫 추억을 남겨보세요!'
                : '해당하는 추억이 없어요.'}
            </p>
            {filter === 'all' && (
              <button
                onClick={openAddSheet}
                style={{
                  padding: '10px 20px',
                  background: 'var(--color-primary)', color: 'white',
                  borderRadius: 'var(--radius-md)', fontSize: '14px', fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                + 추억 추가
              </button>
            )}
          </div>
        ) : (
          groups.map((group, gi) => (
            <section key={gi} style={{ marginBottom: '24px' }}>
              {/* Year header */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px',
              }}>
                <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--color-primary-deep)', flexShrink: 0 }}>
                  {group.isMemorySection ? '기억 속' : `${group.year}년`}
                </h2>
                <div style={{ flex: 1, height: '1px', background: 'var(--color-border)' }} />
                <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)', flexShrink: 0 }}>
                  {group.memories.length}개
                </span>
              </div>

              {/* Cards */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {group.memories.map(m => (
                  <MemoryCard
                    key={m.id}
                    memory={m}
                    onClick={() => navigate({ type: 'detail', memoryId: m.id })}
                  />
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
