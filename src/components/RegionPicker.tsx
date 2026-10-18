import { useMemo, useState } from 'react';
import { PROVINCES, provinceOf, regionLabel, regionsInProvince, unionBox, useRegions } from '../map/geodata';
import KoreaMap from '../map/KoreaMap';
import Sheet from './Sheet';

interface RegionPickerProps {
  onSelect: (code: string, label: string) => void;
  onClose: () => void;
  currentCode?: string | null;
}

/** 시군구 고르기: 이름으로 찾거나, 시·도를 고른 뒤 목록에서 골라요. 위 지도는 고른 곳을 보여주기만 해요. */
export default function RegionPicker({ onSelect, onClose, currentCode }: RegionPickerProps) {
  const set = useRegions();
  const current = currentCode && set ? set.byCode.get(currentCode) : undefined;
  const [prov, setProv] = useState<string>(current?.prov ?? '11');
  const [code, setCode] = useState<string | null>(currentCode ?? null);
  const [query, setQuery] = useState('');

  const q = query.trim().replace(/\s+/g, '');
  const list = useMemo(() => {
    if (!set) return [];
    if (q) {
      return set.regions
        .filter(r => (provinceOf(r)?.name + r.name).replace(/\s+/g, '').includes(q) || regionLabel(r).replace(/\s+/g, '').includes(q))
        .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
        .slice(0, 40);
    }
    return regionsInProvince(set, prov);
  }, [set, q, prov]);

  const selected = code && set ? set.byCode.get(code) : undefined;
  const focus = useMemo(() => {
    if (!set) return null;
    if (selected) return selected.box;
    return unionBox(q ? list : regionsInProvince(set, prov));
  }, [set, selected, prov, q, list]);
  const fills = useMemo(() => {
    const m = new Map<string, string>();
    if (set && !selected) (q ? list : regionsInProvince(set, prov)).forEach(r => m.set(r.code, 'var(--heat-1)'));
    if (selected) m.set(selected.code, 'var(--heat-3)');
    return m;
  }, [set, selected, prov, q, list]);

  function confirm() {
    if (!selected) return;
    onSelect(selected.code, regionLabel(selected));
    onClose();
  }

  return (
    <Sheet
      label="장소 고르기"
      size="tall"
      onClose={onClose}
      left={<button type="button" className="text-btn text-btn--muted" onClick={onClose}>취소</button>}
      title="장소"
      right={<button type="button" className="text-btn" onClick={confirm} disabled={!selected}>고르기</button>}
    >
      <div className="picker-map" aria-hidden="true">
        <KoreaMap interactive={false} fills={fills} selectedCode={code} focusBox={focus} />
      </div>
      <div className="picker-search">
        <input
          className="input"
          type="search"
          placeholder="시군구 이름으로 찾기"
          aria-label="시군구 이름으로 찾기"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
      </div>
      {!q && (
        <div className="province-row" role="group" aria-label="시·도">
          {PROVINCES.map(p => (
            <button key={p.code} type="button" className="chip" aria-pressed={prov === p.code}
              onClick={() => { setProv(p.code); setCode(null); }}>
              {p.short}
            </button>
          ))}
        </div>
      )}
      <div className="sheet__body">
        {set === null && <p className="field__hint">지도 데이터를 불러오지 못했어요. 인터넷에 연결된 뒤 다시 열어 주세요.</p>}
        {q && list.length === 0 && <p className="field__hint">‘{query}’에 맞는 시군구가 없어요.</p>}
        <div className="place-list">
          {list.map(r => (
            <button
              key={r.code}
              type="button"
              className="place"
              aria-pressed={code === r.code}
              onClick={() => setCode(r.code)}
              onDoubleClick={() => { onSelect(r.code, regionLabel(r)); onClose(); }}
            >
              {r.name}
              {q && <small>{provinceOf(r)?.short}</small>}
            </button>
          ))}
        </div>
      </div>
    </Sheet>
  );
}
