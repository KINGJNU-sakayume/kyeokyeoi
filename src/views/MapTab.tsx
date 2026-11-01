import { useMemo, useState } from 'react';
import { useApp } from '../AppContext';
import { setRegionsVisited } from '../db';
import KoreaMap from '../map/KoreaMap';
import { regionLabel, useRegions } from '../map/geodata';
import { getMemoriesByRegion, getMemoryCounts, heatFill } from '../map/regionUtils';
import MemoryCard from '../components/MemoryCard';
import RegionPicker from '../components/RegionPicker';
import Sheet from '../components/Sheet';
import { IconClose, IconPlus } from '../components/icons';

export default function MapTab() {
  const { memories, visits, mapMode: mode, setMapMode: setMode, pickedRegion: picked, pickRegion: setPicked, refreshArchive, showToast, openAddSheet, navigate } = useApp();
  const regions = useRegions();
  const [search, setSearch] = useState(false);
  const [bulk, setBulk] = useState(false);
  const [query, setQuery] = useState('');
  const [chosen, setChosen] = useState<string[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [visitedOn, setVisitedOn] = useState('');
  const [focus, setFocus] = useState<[number, number, number, number] | null>(null);
  const counts = useMemo(() => getMemoryCounts(memories), [memories]);
  const confirmed = useMemo(() => new Set(visits.map(v => v.regionCode)), [visits]);
  const fills = useMemo(() => {
    const result = new Map<string, string>();
    if (mode === 'visits') confirmed.forEach(code => result.set(code, 'var(--primary)'));
    else counts.forEach((n, code) => result.set(code, heatFill(n)));
    return result;
  }, [mode, confirmed, counts]);
  const region = picked ? regions?.byCode.get(picked) : undefined;
  const here = picked ? getMemoriesByRegion(picked, memories) : [];
  const visible = regions?.regions.filter(r => regionLabel(r).replace(/\s/g, '').includes(query.replace(/\s/g, ''))) ?? [];
  const shownVisited = visits.filter(v => regions?.byCode.has(v.regionCode)).length;
  const choose = (code: string) => { setPicked(code); setExpanded(false); setVisitedOn(''); };
  async function mark(codes: string[], value: boolean) {
    if (!regions || busy) return;
    setBusy(true);
    try {
      await setRegionsVisited(codes.map(code => ({ code, label: regionLabel(regions.byCode.get(code)!) })), value, visitedOn || null);
      await refreshArchive(); showToast(value ? '방문을 표시했어요.' : '방문 표시를 해제했어요.');
      if (bulk) { setBulk(false); setChosen([]); }
    } catch (e) { showToast(e instanceof Error ? e.message : '방문 표시를 저장하지 못했어요.'); }
    finally { setBusy(false); }
  }
  return <>
    <header className="map-head">
      <h1 className="wordmark">켜켜이</h1>
      <p className="map-head__summary">{mode === 'visits' ? <><strong>{shownVisited}곳</strong> 방문 확인 · 시군구 {regions?.regions.length ?? 251}곳</> : <>장소와 연결된 기억 {Array.from(counts.values()).reduce((a, b) => a + b, 0)}개</>}</p>
    </header>
    <div className="map-tools">
      <div className="segmented" aria-label="지도 데이터 보기" role="group">
        <button className="chip" aria-pressed={mode === 'visits'} onClick={() => setMode('visits')}>방문 지도</button>
        <button className="chip" aria-pressed={mode === 'memories'} onClick={() => setMode('memories')}>기억 분포</button>
      </div>
      <div className="map-tools__actions"><button className="text-btn" onClick={() => setSearch(true)}>지역 찾기</button><button className="text-btn" onClick={() => setBulk(true)}>여러 곳 표시</button></div>
    </div>
    {mode === 'memories' && <p className="map-key">기억 수 <span style={{ background: 'var(--heat-1)' }}>1</span><span style={{ background: 'var(--heat-2)' }}>2–3</span><span style={{ background: 'var(--heat-3)' }}>4–7</span><span style={{ background: 'var(--heat-4)' }}>8+</span></p>}
    <div className={`map-workspace ${region ? 'map-workspace--picked' : ''}`}>
      <KoreaMap rememberKey="main-map" dotOverview fills={fills} selectedCode={picked} focusBox={focus} onRegionTap={choose} />
      {region ? <aside className={`region-panel ${expanded ? 'region-panel--expanded' : ''}`} aria-label="지역 정보">
        <div className="region-panel__heading"><h2>{regionLabel(region)}</h2><button className="icon-btn" aria-label="지역 닫기" onClick={() => setPicked(null)}><IconClose /></button></div>
        <p className="region-panel__meta">{confirmed.has(region.code) ? '방문 확인됨' : '방문 미등록'} · 연결된 기억 {here.length}개</p>
        {!confirmed.has(region.code) && here.length > 0 && <p className="field__hint">기억이 연결된 방문 확인 후보예요. 방문 여부를 직접 확인해 주세요.</p>}
        {confirmed.has(region.code) && visits.find(v => v.regionCode === region.code)?.visitedOn && <p className="field__hint">방문일 {visits.find(v => v.regionCode === region.code)?.visitedOn}</p>}
        <div className="region-panel__actions"><button className="btn" disabled={busy} onClick={() => mark([region.code], !confirmed.has(region.code))}>{confirmed.has(region.code) ? '방문 표시 해제' : '방문 표시'}</button><button className="text-btn" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? '접기' : '기억 펼치기'}</button></div>
        <div className="region-panel__more">
          {!confirmed.has(region.code) && <label className="field__label">방문 날짜 (선택)<input className="input" type="date" value={visitedOn} onChange={e => setVisitedOn(e.target.value)} /></label>}
          {here.length > 0 && <div className="region-sheet__list">{here.map(m => <MemoryCard key={m.id} memory={m} hideRegion onClick={() => navigate({ type: 'detail', memoryId: m.id })} />)}</div>}
          <button className="text-btn" onClick={() => openAddSheet({ regionCode: region.code, regionLabel: regionLabel(region) })}>이곳의 기억 쓰기</button>
        </div>
      </aside> : <aside className="map-intro"><p>지역을 골라 방문을 표시하세요.</p><p className="field__hint">방문 미등록은 아직 확인하지 않은 상태예요. 기억은 장소 없이도 남길 수 있어요.</p><button className="text-btn" onClick={() => setSearch(true)}>시군구 검색·목록</button></aside>}
    </div>
    <button className="add-fab" onClick={() => openAddSheet()}><IconPlus />기억 쓰기</button>
    {search && <RegionPicker currentCode={picked} onClose={() => setSearch(false)} onSelect={code => { choose(code); setFocus(regions!.byCode.get(code)!.box); }} />}
    {bulk && <Sheet label="여러 지역 방문 표시" size="tall" onClose={() => setBulk(false)} title="여러 곳 표시" left={<button className="text-btn" onClick={() => setBulk(false)}>닫기</button>}>
      <div className="picker-search"><input className="input" type="search" aria-label="방문 지역 검색" placeholder="시·도 또는 시군구 이름" value={query} onChange={e => setQuery(e.target.value)} /></div>
      <div className="sheet__body"><p className="field__hint">{chosen.length}곳 선택 · 방문 날짜는 모르면 비워 두어요.</p><label className="field__label">방문 날짜 (선택)<input className="input" type="date" value={visitedOn} onChange={e => setVisitedOn(e.target.value)} /></label>
        {visible.map(r => <label className="selection-row" key={r.code}><input type="checkbox" checked={chosen.includes(r.code)} onChange={e => setChosen(e.target.checked ? [...chosen, r.code] : chosen.filter(c => c !== r.code))} /><span>{regionLabel(r)}{confirmed.has(r.code) && <small>방문 확인됨</small>}</span></label>)}
      </div><div className="sheet__bar"><button className="text-btn" disabled={!chosen.length || busy} onClick={() => mark(chosen, false)}>선택한 방문 해제</button><button className="btn" disabled={!chosen.length || busy} onClick={() => mark(chosen, true)}>선택한 곳 방문 표시</button></div>
    </Sheet>}
  </>;
}
