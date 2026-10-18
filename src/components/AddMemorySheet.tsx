import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../AppContext';
import type { SheetPrefill } from '../AppContext';
import { getMemory, MAX_PHOTOS, newId, saveMemory } from '../db/index';
import type { Memory, Season, SchoolType, TimeType, TimeValue } from '../db/index';
import { computeYear } from '../utils/timeUtils';
import { EMOTIONS } from '../utils/emotions';
import { compressImage, forgetPhotoURL, registerPhotoURL, usePhotoURL } from '../utils/photoUtils';
import Sheet from './Sheet';
import RegionPicker from './RegionPicker';
import ConfirmDialog from './ConfirmDialog';
import { IconChevron, IconClose, IconPlus } from './icons';

const TIME_TYPES: { id: TimeType; label: string }[] = [
  { id: 'date', label: '날짜' },
  { id: 'month', label: '달' },
  { id: 'year', label: '해' },
  { id: 'season', label: '계절' },
  { id: 'age', label: '나이' },
  { id: 'grade', label: '학년' },
  { id: 'free', label: '말로 적기' },
];

const SEASONS: { id: Season; label: string }[] = [
  { id: 'spring', label: '봄' }, { id: 'summer', label: '여름' }, { id: 'autumn', label: '가을' }, { id: 'winter', label: '겨울' },
];

const SCHOOLS: { id: SchoolType; label: string }[] = [
  { id: 'elementary', label: '초등학교' }, { id: 'middle', label: '중학교' }, { id: 'high', label: '고등학교' },
];

type DraftPhoto = { id: string; blob?: Blob };

const int = (s: string) => { const n = parseInt(s, 10); return Number.isFinite(n) ? n : undefined; };
const inRange = (n: number | undefined, lo: number, hi: number) => (n !== undefined && n >= lo && n <= hi ? n : undefined);

function PhotoTile({ id, onRemove }: { id: string; onRemove: () => void }) {
  const url = usePhotoURL(id);
  return (
    <div className="photo-tile">
      {url && <img src={url} alt="" />}
      <button type="button" className="photo-tile__remove" onClick={onRemove} aria-label="사진 빼기"><IconClose /></button>
    </div>
  );
}

export default function AddMemorySheet({ editId, prefill }: { editId: string | null; prefill?: SheetPrefill }) {
  const { closeSheet, refreshMemories, birthYear, showToast } = useApp();
  const isEdit = !!editId;
  const thisYear = new Date().getFullYear();

  const [loaded, setLoaded] = useState<Memory | null>(null);
  const [title, setTitle] = useState('');
  const [regionCode, setRegionCode] = useState<string | null>(prefill?.regionCode ?? null);
  const [regionLabel, setRegionLabel] = useState<string | null>(prefill?.regionLabel ?? null);
  const [timeType, setTimeType] = useState<TimeType | null>(null);
  const [year, setYear] = useState('');
  const [month, setMonth] = useState('');
  const [day, setDay] = useState('');
  const [season, setSeason] = useState<Season | null>(null);
  const [age, setAge] = useState('');
  const [school, setSchool] = useState<SchoolType>('elementary');
  const [grade, setGrade] = useState('1');
  const [freeText, setFreeText] = useState('');
  const [emotions, setEmotions] = useState<string[]>([]);
  const [artist, setArtist] = useState('');
  const [songTitle, setSongTitle] = useState('');
  const [photos, setPhotos] = useState<DraftPhoto[]>([]);
  const [memo, setMemo] = useState('');
  const [isFirst, setIsFirst] = useState(false);

  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editId) return;
    getMemory(editId).then(m => {
      if (!m) { showToast('이 추억을 찾지 못했어요.'); closeSheet(); return; }
      setLoaded(m);
      setTitle(m.title);
      setRegionCode(m.regionCode);
      setRegionLabel(m.regionLabel);
      setTimeType(m.timeType);
      const v = m.timeValue ?? {};
      setYear(v.year?.toString() ?? '');
      setMonth(v.month?.toString() ?? '');
      setDay(v.day?.toString() ?? '');
      setSeason(v.season ?? null);
      setAge(v.age?.toString() ?? '');
      setSchool(v.schoolType ?? 'elementary');
      setGrade(v.schoolGrade?.toString() ?? '1');
      setFreeText(v.freeText ?? '');
      setEmotions(m.emotions);
      setArtist(m.song?.artist ?? '');
      setSongTitle(m.song?.title ?? '');
      setPhotos(m.photoIds.map(id => ({ id })));
      setMemo(m.memo ?? '');
      setIsFirst(m.isFirst);
    });
  }, [editId, closeSheet, showToast]);

  // 입력이 바뀌면 닫기 전에 한 번 물어봐요
  const touch = <T,>(set: (v: T) => void) => (v: T) => { set(v); setDirty(true); };

  function buildTimeValue(): TimeValue | null {
    const y = inRange(int(year), 1900, thisYear + 1);
    const mo = inRange(int(month), 1, 12);
    const d = inRange(int(day), 1, 31);
    switch (timeType) {
      case 'date': return { year: y, month: mo, day: d };
      case 'month': return { year: y, month: mo };
      case 'year': return { year: y };
      case 'season': return { year: y, season: season ?? undefined };
      case 'age': return { age: inRange(int(age), 1, 130) };
      case 'grade': return { schoolType: school, schoolGrade: inRange(int(grade), 1, 6) ?? 1 };
      case 'free': return { freeText: freeText.trim() };
      default: return null;
    }
  }

  async function handleSave() {
    if (!title.trim() || saving) return;
    setSaving(true);
    try {
      const tv = buildTimeValue();
      const now = Date.now();
      const id = editId ?? newId();
      const memory: Memory = {
        id,
        title: title.trim(),
        regionCode, regionLabel,
        timeType: tv ? timeType : null,
        timeValue: tv,
        computedYear: computeYear(timeType, tv, birthYear),
        emotions,
        song: artist.trim() || songTitle.trim() ? { artist: artist.trim(), title: songTitle.trim() } : null,
        photoIds: photos.map(p => p.id),
        memo: memo.trim() || null,
        isFirst,
        isPublic: false,
        createdAt: loaded?.createdAt ?? now,
        updatedAt: now,
      };
      const added = photos.filter(p => p.blob).map(p => ({ id: p.id, blob: p.blob! }));
      const kept = new Set(memory.photoIds);
      const removed = (loaded?.photoIds ?? []).filter(pid => !kept.has(pid));
      await saveMemory(memory, added, removed);
      removed.forEach(forgetPhotoURL);
      await refreshMemories();
      showToast(isEdit ? '고쳤어요.' : '기록했어요.');
      closeSheet();
    } catch (e) {
      console.error(e);
      const full = e instanceof DOMException && e.name === 'QuotaExceededError';
      showToast(full
        ? '저장 공간이 부족해서 저장하지 못했어요. 사진을 줄이거나 설정에서 백업 후 정리해 주세요.'
        : '저장하지 못했어요. 입력한 내용은 그대로 있으니 다시 눌러 주세요.');
    } finally {
      setSaving(false);
    }
  }

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    const room = MAX_PHOTOS - photos.length;
    if (files.length > room) showToast(`사진은 ${MAX_PHOTOS}장까지 붙일 수 있어서 앞의 ${room}장만 넣었어요.`);
    const next: DraftPhoto[] = [];
    for (const f of files.slice(0, Math.max(0, room))) {
      const blob = await compressImage(f);
      const id = newId();
      registerPhotoURL(id, blob);
      next.push({ id, blob });
    }
    if (next.length) { setPhotos(prev => [...prev, ...next].slice(0, MAX_PHOTOS)); setDirty(true); }
  }

  const requestClose = useCallback(() => {
    if (dirty) setConfirmDiscard(true);
    else closeSheet();
  }, [dirty, closeSheet]);

  const needsBirth = (timeType === 'age' || timeType === 'grade') && !birthYear;
  const tv = buildTimeValue();
  const preview = timeType === 'age' || timeType === 'grade' ? computeYear(timeType, tv, birthYear) : null;

  return (
    <>
      <Sheet
        label={isEdit ? '추억 고치기' : '새 추억'}
        size="tall"
        onClose={requestClose}
        left={<button type="button" className="text-btn text-btn--muted" onClick={requestClose}>취소</button>}
        title={isEdit ? '추억 고치기' : '새 추억'}
        right={
          <button type="button" className="text-btn" onClick={handleSave} disabled={!title.trim() || saving}>
            {saving ? '저장 중' : '저장'}
          </button>
        }
      >
        <div className="sheet__body">
          <label className="visually-hidden" htmlFor="memory-title">제목</label>
          <input
            id="memory-title"
            className="title-input"
            value={title}
            onChange={e => touch(setTitle)(e.target.value)}
            placeholder="어떤 순간이었나요"
            maxLength={80}
            autoFocus={!isEdit}
            enterKeyHint="done"
          />

          <div className="field">
            <span className="field__label">어디서</span>
            <button type="button" className="pick" onClick={() => setPicking(true)}>
              {regionLabel ? <span>{regionLabel}</span> : <span className="pick__placeholder">시군구 고르기</span>}
              <IconChevron />
            </button>
            {regionLabel && (
              <button type="button" className="text-btn text-btn--muted" style={{ paddingLeft: 0 }}
                onClick={() => { setRegionCode(null); setRegionLabel(null); setDirty(true); }}>
                장소 비우기
              </button>
            )}
          </div>

          <div className="field">
            <span className="field__label">언제</span>
            <div className="segmented" role="group" aria-label="시간을 적는 방식">
              {TIME_TYPES.map(t => (
                <button key={t.id} type="button" className="chip" aria-pressed={timeType === t.id}
                  onClick={() => touch(setTimeType)(timeType === t.id ? null : t.id)}>
                  {t.label}
                </button>
              ))}
            </div>

            {(timeType === 'date' || timeType === 'month' || timeType === 'year' || timeType === 'season') && (
              <div className="input-row">
                <input className="input" style={{ flex: 2 }} inputMode="numeric" placeholder={`연도 (예: ${thisYear})`} aria-label="연도"
                  value={year} onChange={e => touch(setYear)(e.target.value.replace(/\D/g, '').slice(0, 4))} />
                {(timeType === 'date' || timeType === 'month') && (
                  <input className="input" style={{ flex: 1 }} inputMode="numeric" placeholder="월" aria-label="월"
                    value={month} onChange={e => touch(setMonth)(e.target.value.replace(/\D/g, '').slice(0, 2))} />
                )}
                {timeType === 'date' && (
                  <input className="input" style={{ flex: 1 }} inputMode="numeric" placeholder="일" aria-label="일"
                    value={day} onChange={e => touch(setDay)(e.target.value.replace(/\D/g, '').slice(0, 2))} />
                )}
              </div>
            )}
            {timeType === 'season' && (
              <div className="segmented" style={{ marginTop: 8, marginBottom: 0 }} role="group" aria-label="계절">
                {SEASONS.map(s => (
                  <button key={s.id} type="button" className="chip" aria-pressed={season === s.id}
                    onClick={() => touch(setSeason)(s.id)}>{s.label}</button>
                ))}
              </div>
            )}
            {timeType === 'age' && (
              <input className="input" inputMode="numeric" placeholder="몇 살 때 (세는 나이)" aria-label="나이" disabled={!birthYear}
                value={age} onChange={e => touch(setAge)(e.target.value.replace(/\D/g, '').slice(0, 3))} />
            )}
            {timeType === 'grade' && (
              <div className="input-row">
                <select className="input" style={{ flex: 2 }} aria-label="학교" disabled={!birthYear}
                  value={school} onChange={e => { touch(setSchool)(e.target.value as SchoolType); setGrade('1'); }}>
                  {SCHOOLS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
                <select className="input" style={{ flex: 1 }} aria-label="학년" disabled={!birthYear}
                  value={grade} onChange={e => touch(setGrade)(e.target.value)}>
                  {Array.from({ length: school === 'elementary' ? 6 : 3 }, (_, i) => i + 1).map(g => (
                    <option key={g} value={g}>{g}학년</option>
                  ))}
                </select>
              </div>
            )}
            {timeType === 'free' && (
              <input className="input" placeholder="어릴 때 여름마다, 입대 전날 밤" aria-label="시간을 말로"
                value={freeText} onChange={e => touch(setFreeText)(e.target.value)} maxLength={40} />
            )}
            {needsBirth && <p className="field__hint field__hint--warn">설정에서 태어난 해를 먼저 적어 주세요. 그래야 몇 년도인지 계산할 수 있어요.</p>}
            {preview && <p className="field__hint">{preview}년으로 쌓여요.</p>}
          </div>

          <div className="field">
            <span className="field__label">그때 기분</span>
            <div className="emotions">
              {EMOTIONS.map(({ emoji, label }) => (
                <button key={emoji} type="button" className="emotion" aria-pressed={emotions.includes(emoji)}
                  onClick={() => touch(setEmotions)(emotions.includes(emoji) ? emotions.filter(x => x !== emoji) : [...emotions, emoji])}>
                  <span className="emotion__emoji" aria-hidden="true">{emoji}</span>
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <span className="field__label">함께 떠오르는 노래</span>
            <div className="input-row">
              <input className="input" placeholder="가수" aria-label="가수" value={artist} onChange={e => touch(setArtist)(e.target.value)} />
              <input className="input" placeholder="곡 제목" aria-label="곡 제목" value={songTitle} onChange={e => touch(setSongTitle)(e.target.value)} />
            </div>
          </div>

          <div className="field">
            <span className="field__label">사진 {photos.length > 0 && `${photos.length}/${MAX_PHOTOS}`}</span>
            <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={handleFiles} />
            <div className="photos-grid">
              {photos.map(p => (
                <PhotoTile key={p.id} id={p.id} onRemove={() => { setPhotos(prev => prev.filter(x => x.id !== p.id)); setDirty(true); }} />
              ))}
              {photos.length < MAX_PHOTOS && (
                <button type="button" className="photo-add" onClick={() => fileRef.current?.click()} aria-label="사진 붙이기">
                  <IconPlus />
                </button>
              )}
            </div>
          </div>

          <div className="field">
            <label className="field__label" htmlFor="memory-memo">적어 두고 싶은 것</label>
            <textarea id="memory-memo" className="input" rows={4} value={memo} onChange={e => touch(setMemo)(e.target.value)} />
          </div>

          <div className="switch-row">
            <span className="switch-row__text" id="first-label">
              처음 해 본 일
              <small>타임라인에서 따로 모아 볼 수 있어요</small>
            </span>
            <button type="button" role="switch" className="switch" aria-checked={isFirst} aria-labelledby="first-label"
              onClick={() => touch(setIsFirst)(!isFirst)} />
          </div>
        </div>
      </Sheet>

      {picking && (
        <RegionPicker
          currentCode={regionCode}
          onSelect={(code, label) => { setRegionCode(code); setRegionLabel(label); setDirty(true); }}
          onClose={() => setPicking(false)}
        />
      )}

      {confirmDiscard && (
        <ConfirmDialog
          message="적던 내용을 버릴까요?"
          subMessage="저장하지 않은 내용은 사라져요."
          confirmLabel="버리기"
          destructive
          onCancel={() => setConfirmDiscard(false)}
          onConfirm={() => { photos.filter(p => p.blob).forEach(p => forgetPhotoURL(p.id)); closeSheet(); }}
        />
      )}
    </>
  );
}
