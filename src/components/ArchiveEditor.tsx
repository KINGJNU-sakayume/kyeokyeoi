import { useState } from 'react';
import { useApp } from '../AppContext';
import { newId, saveCollection, saveLifePeriod } from '../db';
import type { MemoryCollection, LifePeriod } from '../db';
import Sheet from './Sheet';
export default function ArchiveEditor({ kind, value, onClose }: { kind: 'collection' | 'period'; value?: MemoryCollection | LifePeriod; onClose: () => void }) {
  const { memories, refreshArchive, showToast } = useApp();
  const [title, setTitle] = useState(value?.title ?? '');
  const [ids, setIds] = useState(value?.memoryIds ?? []);
  const [query, setQuery] = useState('');
  const [start, setStart] = useState(value && 'startYear' in value ? String(value.startYear ?? '') : '');
  const [end, setEnd] = useState(value && 'endYear' in value ? String(value.endYear ?? '') : '');
  const [busy, setBusy] = useState(false);
  const noun = kind === 'collection' ? '컬렉션' : '인생 시기';
  async function save() {
    if (!title.trim() || busy) return;
    if ((start && !/^\d{4}$/.test(start)) || (end && !/^\d{4}$/.test(end)) || (start && end && Number(start) > Number(end))) { showToast('시작·끝 연도를 확인해 주세요.'); return; }
    setBusy(true);
    try {
      const record = { id: value?.id ?? newId(), title: title.trim(), memoryIds: ids, createdAt: value?.createdAt ?? Date.now(), updatedAt: Date.now() };
      if (kind === 'period') await saveLifePeriod({ ...record, startYear: start ? Number(start) : null, endYear: end ? Number(end) : null });
      else await saveCollection(record);
      await refreshArchive(); onClose();
    } catch { showToast('저장하지 못했어요. 입력은 그대로 있어요.'); } finally { setBusy(false); }
  }
  return <Sheet label={`${noun} 편집`} title={value ? `${noun} 고치기` : `새 ${noun}`} size="tall" onClose={onClose} left={<button className="text-btn" onClick={onClose}>취소</button>} right={<button className="text-btn" disabled={!title.trim() || busy} onClick={save}>저장</button>}>
    <div className="sheet__body"><label className="field__label">이름<input className="input" value={title} onChange={e => setTitle(e.target.value)} maxLength={80} /></label>
      {kind === 'period' && <div className="field"><span className="field__label">연도 범위 (선택)</span><div className="input-row"><input className="input" aria-label="시작 연도" inputMode="numeric" placeholder="시작 연도" value={start} onChange={e => setStart(e.target.value)} /><input className="input" aria-label="끝 연도" inputMode="numeric" placeholder="끝 연도" value={end} onChange={e => setEnd(e.target.value)} /></div><p className="field__hint">범위 안의 기억과 직접 고른 기억을 모아요. 나이·학년의 환산 연도는 추정이며, 자유 입력 시기는 자동 배치하지 않아요.</p></div>}
      <div className="field"><label className="field__label">기억 고르기<input className="input" type="search" placeholder="제목·본문 검색" value={query} onChange={e => setQuery(e.target.value)} /></label><p className="field__hint">{ids.length}개 선택. 같은 기억을 여러 모음에 담을 수 있어요.</p>
        {memories.filter(m => `${m.title} ${m.memo ?? ''}`.includes(query)).map(m => <label key={m.id} className="selection-row"><input type="checkbox" checked={ids.includes(m.id)} onChange={e => setIds(e.target.checked ? [...ids, m.id] : ids.filter(id => id !== m.id))} /><span>{m.title}</span></label>)}
      </div>
    </div>
  </Sheet>;
}
