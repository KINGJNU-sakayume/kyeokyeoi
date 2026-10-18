import { useMemo, useState } from 'react';
import { useApp } from '../AppContext';
import MemoryCard from '../components/MemoryCard';
import { sortMemories } from '../utils/timeUtils';
import { IconPlus } from '../components/icons';

type Filter = 'all' | 'first' | 'photo';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: '전부' },
  { id: 'first', label: '첫 경험' },
  { id: 'photo', label: '사진 있는 것' },
];

export default function TimelineTab() {
  const { memories, navigate, openAddSheet } = useApp();
  const [filter, setFilter] = useState<Filter>('all');

  const groups = useMemo(() => {
    const list = filter === 'first' ? memories.filter(m => m.isFirst)
      : filter === 'photo' ? memories.filter(m => m.photoIds.length > 0)
      : memories;
    return sortMemories(list);
  }, [memories, filter]);

  return (
    <div className="screen">
      <div className="screen__scroll">
        <header className="page-head">
          <h1 className="page-title">타임라인</h1>
        </header>

        {memories.length > 0 && (
          <div className="filters" role="group" aria-label="보기">
            {FILTERS.map(f => (
              <button key={f.id} type="button" className="chip" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
                {f.label}
              </button>
            ))}
          </div>
        )}

        {memories.length === 0 ? (
          <div className="empty">
            <p className="empty__title">첫 겹을 쌓아 볼까요</p>
            <p className="empty__body">기억나는 순간 하나를 적으면 그 해의 층이 생겨요. 날짜를 몰라도 ‘중학교 2학년’, ‘어릴 때’처럼 적을 수 있어요.</p>
            <button type="button" className="btn" onClick={() => openAddSheet()}><IconPlus />기록하기</button>
          </div>
        ) : groups.length === 0 ? (
          <div className="empty">
            <p className="empty__body">{filter === 'first' ? '첫 경험으로 표시한 추억이 아직 없어요.' : '사진을 붙인 추억이 아직 없어요.'}</p>
          </div>
        ) : (
          <div className="strata">
            {groups.map(g => (
              <section key={g.year ?? 'memory'} className="stratum" aria-label={g.isMemorySection ? '때를 모르는 추억' : `${g.year}년`}>
                <div className="stratum__year">
                  <span className="stratum__year-label">
                    {g.isMemorySection ? '언젠가' : g.year}
                    <small>{g.memories.length}개</small>
                  </span>
                </div>
                <div className="stratum__items">
                  {g.memories.map(m => (
                    <MemoryCard key={m.id} memory={m} onClick={() => navigate({ type: 'detail', memoryId: m.id })} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      {memories.length > 0 && (
        <button type="button" className="add-fab" onClick={() => openAddSheet()}>
          <IconPlus />
          기록하기
        </button>
      )}
    </div>
  );
}
