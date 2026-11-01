import { useMemo, useState } from 'react';
import { useApp } from '../AppContext';
import { inPeriod } from '../utils/archiveUtils';
import { sortMemories } from '../utils/timeUtils';
import MemoryCard from '../components/MemoryCard';
import { IconPlus } from '../components/icons';
export default function MemoriesTab() {
  const { memories, periods, navigate, openAddSheet, archiveTarget } = useApp();
  const [query, setQuery] = useState('');
  const [place, setPlace] = useState(
    archiveTarget?.startsWith('region:') ? archiveTarget.slice(7) : '',
  );
  const [period, setPeriod] = useState(archiveTarget?.startsWith('year:') ? archiveTarget : '');
  const [first, setFirst] = useState(false);
  const [photo, setPhoto] = useState(false);
  const [order, setOrder] = useState('created');
  const [limit, setLimit] = useState(50);
  const places = useMemo(
    () =>
      [
        ...new Map(
          memories
            .filter((m) => m.regionCode)
            .map((m) => [m.regionCode!, m.regionLabel ?? m.regionCode!]),
        ).entries(),
      ].sort((a, b) => a[1].localeCompare(b[1], 'ko')),
    [memories],
  );
  const years = useMemo(
    () =>
      [
        ...new Set(
          memories
            .filter((m) => m.timeType !== 'free' && m.computedYear != null)
            .map((m) => m.computedYear!),
        ),
      ].sort((a, b) => b - a),
    [memories],
  );
  const list = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    const items = memories.filter((m) => {
      if (q && !`${m.title} ${m.memo ?? ''}`.toLocaleLowerCase().includes(q)) return false;
      if (place === 'unknown' ? m.regionCode !== null : place && m.regionCode !== place)
        return false;
      if ((first && !m.isFirst) || (photo && !m.photoIds.length)) return false;
      if (period === 'unknown' && m.timeType !== 'free' && m.computedYear != null) return false;
      if (
        period.startsWith('year:') &&
        (m.timeType === 'free' || m.computedYear !== Number(period.slice(5)))
      )
        return false;
      if (period.startsWith('period:')) {
        const p = periods.find((p) => p.id === period.slice(7));
        if (p && !inPeriod(m, p)) return false;
      }
      return true;
    });
    return order === 'created'
      ? items.sort((a, b) => b.createdAt - a.createdAt)
      : sortMemories(items).flatMap((g) => g.memories);
  }, [memories, query, place, period, first, photo, order, periods]);
  return (
    <div className="screen">
      <div className="screen__scroll archive-page">
        <header className="page-head">
          <h1 className="page-title">기억</h1>
        </header>
        <div className="archive-filters">
          <input
            className="input"
            type="search"
            aria-label="기억 검색"
            placeholder="제목과 본문에서 찾기"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setLimit(50);
            }}
          />
          <div className="input-row">
            <select
              className="input"
              aria-label="장소 필터"
              value={place}
              onChange={(e) => {
                setPlace(e.target.value);
                setLimit(50);
              }}
            >
              <option value="">모든 장소</option>
              <option value="unknown">장소 미상</option>
              {places.map(([code, label]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </select>
            <select
              className="input"
              aria-label="시기 필터"
              value={period}
              onChange={(e) => {
                setPeriod(e.target.value);
                setLimit(50);
              }}
            >
              <option value="">모든 시기</option>
              <option value="unknown">정확한 연도 미상</option>
              {periods.map((p) => (
                <option key={p.id} value={`period:${p.id}`}>
                  {p.title}
                </option>
              ))}
              {years.map((y) => (
                <option key={y} value={`year:${y}`}>
                  {y}년
                </option>
              ))}
            </select>
          </div>
          <div className="archive-filter-row">
            <button
              className="chip"
              aria-pressed={first}
              onClick={() => {
                setFirst(!first);
                setLimit(50);
              }}
            >
              첫 경험
            </button>
            <button
              className="chip"
              aria-pressed={photo}
              onClick={() => {
                setPhoto(!photo);
                setLimit(50);
              }}
            >
              사진 있음
            </button>
            <select aria-label="기억 정렬" value={order} onChange={(e) => setOrder(e.target.value)}>
              <option value="created">작성순</option>
              <option value="experience">경험 시점순</option>
            </select>
          </div>
        </div>
        <p className="list-count" role="status">
          기억 {list.length}개
          {order === 'experience' ? ' · 정확한 시기가 없는 기억은 뒤에 모아요' : ''}
        </p>
        <div className="memory-index">
          {list.slice(0, limit).map((m) => (
            <MemoryCard
              key={m.id}
              memory={m}
              onClick={() => navigate({ type: 'detail', memoryId: m.id })}
            />
          ))}
        </div>
        {!list.length && (
          <div className="empty">
            <p className="empty__body">
              {memories.length
                ? '조건에 맞는 기억이 없어요.'
                : '제목 하나로 기억을 남길 수 있어요. 시간·장소·사진은 선택이에요.'}
            </p>
          </div>
        )}
        {list.length > limit && (
          <button className="text-btn load-more" onClick={() => setLimit(limit + 50)}>
            기억 50개 더 보기
          </button>
        )}
      </div>
      <button className="add-fab" onClick={() => openAddSheet()}>
        <IconPlus />
        기억 쓰기
      </button>
    </div>
  );
}
