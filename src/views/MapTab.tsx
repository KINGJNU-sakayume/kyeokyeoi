import { useMemo, useState } from 'react';
import { useApp } from '../AppContext';
import KoreaMap from '../map/KoreaMap';
import { regionLabel, useRegions } from '../map/geodata';
import { getMemoriesByRegion, getVisitCounts, heatFill } from '../map/regionUtils';
import MemoryCard from '../components/MemoryCard';
import Sheet from '../components/Sheet';
import { IconPlus } from '../components/icons';

export default function MapTab() {
  const { memories, openAddSheet, navigate } = useApp();
  const set = useRegions();
  const [picked, setPicked] = useState<string | null>(null);

  const counts = useMemo(() => getVisitCounts(memories), [memories]);
  const fills = useMemo(() => {
    const m = new Map<string, string>();
    counts.forEach((n, code) => m.set(code, heatFill(n)));
    return m;
  }, [counts]);

  const region = picked && set ? set.byCode.get(picked) : undefined;
  const here = picked ? getMemoriesByRegion(picked, memories) : [];
  const total = set?.regions.length ?? 0;

  return (
    <>
      <header className="map-head">
        <h1 className="wordmark">켜켜이</h1>
        <p className="map-head__summary">
          {memories.length === 0
            ? '다녀온 곳을 기록하면 지도에 짙게 쌓여요.'
            : <>시군구 {total}곳 중 <strong>{counts.size}곳</strong>에 추억 {memories.length}개</>}
        </p>
      </header>

      {memories.length > 0 && (
        <div className="map-legend" aria-hidden="true">
          적음
          <span className="map-legend__ramp">
            <span style={{ background: 'var(--heat-1)' }} />
            <span style={{ background: 'var(--heat-2)' }} />
            <span style={{ background: 'var(--heat-3)' }} />
            <span style={{ background: 'var(--heat-4)' }} />
          </span>
          많음
        </div>
      )}

      <KoreaMap fills={fills} selectedCode={picked} onRegionTap={setPicked} />

      <button type="button" className="add-fab" onClick={() => openAddSheet()}>
        <IconPlus />
        기록하기
      </button>

      {region && (
        <Sheet label={`${region.name} 추억`} onClose={() => setPicked(null)}>
          <div className="region-sheet__head">
            <h2 className="region-sheet__name">{regionLabel(region)}</h2>
            <p className="region-sheet__count">{here.length ? `추억 ${here.length}개` : '아직 이곳의 추억이 없어요.'}</p>
          </div>
          {here.length > 0 && (
            <div className="region-sheet__list">
              {here.map(m => (
                <MemoryCard key={m.id} memory={m} hideRegion
                  onClick={() => { setPicked(null); navigate({ type: 'detail', memoryId: m.id }); }} />
              ))}
            </div>
          )}
          <div className="region-sheet__foot">
            <button type="button" className="btn btn--block"
              onClick={() => { setPicked(null); openAddSheet({ regionCode: region.code, regionLabel: regionLabel(region) }); }}>
              여기서의 추억 기록하기
            </button>
          </div>
        </Sheet>
      )}
    </>
  );
}
