import { useState, useRef, useEffect, useCallback } from 'react';
import { useApp } from '../AppContext';
import { saveMemory, getMemory } from '../db/index'
import type { Memory } from '../db/index';
import { computeYear } from '../utils/timeUtils';
import { fileToBase64 } from '../utils/photoUtils';
import RegionPicker from './RegionPicker';

type TimeType = Memory['timeType'];
type Season = 'spring' | 'summer' | 'autumn' | 'winter';
type SchoolType = 'elementary' | 'middle' | 'high';

const EMOTIONS: { emoji: string; label: string }[] = [
  { emoji: '😊', label: '행복' },
  { emoji: '😢', label: '슬픔' },
  { emoji: '🥰', label: '설렘' },
  { emoji: '🤩', label: '신남' },
  { emoji: '😌', label: '평온' },
  { emoji: '😔', label: '우울' },
  { emoji: '😨', label: '두려움' },
  { emoji: '😤', label: '화남' },
  { emoji: '😂', label: '웃김' },
  { emoji: '🌅', label: '감동' },
];

const TIME_TYPES: { id: TimeType; label: string }[] = [
  { id: 'date', label: '날짜' },
  { id: 'month', label: '월' },
  { id: 'year', label: '연도' },
  { id: 'season', label: '계절' },
  { id: 'age', label: '나이' },
  { id: 'grade', label: '학년' },
  { id: 'free', label: '기억 속' },
];

const SEASON_OPTIONS: { id: Season; label: string }[] = [
  { id: 'spring', label: '봄' },
  { id: 'summer', label: '여름' },
  { id: 'autumn', label: '가을' },
  { id: 'winter', label: '겨울' },
];

const SCHOOL_OPTIONS: { id: SchoolType; label: string }[] = [
  { id: 'elementary', label: '초등학교' },
  { id: 'middle', label: '중학교' },
  { id: 'high', label: '고등학교' },
];

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export default function AddMemorySheet() {
  const { closeAddSheet, addSheetEditId, refreshMemories, birthYear } = useApp();

  // Form state
  const [title, setTitle] = useState('');
  const [regionCode, setRegionCode] = useState<string | null>(null);
  const [regionLabel, setRegionLabel] = useState<string | null>(null);
  const [timeType, setTimeType] = useState<TimeType>(null);
  const [timeYear, setTimeYear] = useState('');
  const [timeMonth, setTimeMonth] = useState('');
  const [timeDay, setTimeDay] = useState('');
  const [timeSeason, setTimeSeason] = useState<Season | null>(null);
  const [timeAge, setTimeAge] = useState('');
  const [schoolType, setSchoolType] = useState<SchoolType>('elementary');
  const [schoolGrade, setSchoolGrade] = useState('1');
  const [timeFree, setTimeFree] = useState('');
  const [emotions, setEmotions] = useState<string[]>([]);
  const [songArtist, setSongArtist] = useState('');
  const [songTitle, setSongTitle] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [memo, setMemo] = useState('');
  const [isFirst, setIsFirst] = useState(false);
  const [showRegionPicker, setShowRegionPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [emotionTooltip, setEmotionTooltip] = useState<string | null>(null);
  const tooltipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Drag to dismiss
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef<number | null>(null);
  const [dragOffset, setDragOffset] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const isEdit = !!addSheetEditId;

  // Load existing memory in edit mode
  useEffect(() => {
    if (!addSheetEditId) return;
    getMemory(addSheetEditId).then(m => {
      if (!m) return;
      setTitle(m.title);
      setRegionCode(m.regionCode);
      setRegionLabel(m.regionLabel);
      setTimeType(m.timeType);
      if (m.timeValue) {
        if (m.timeValue.year) setTimeYear(m.timeValue.year.toString());
        if (m.timeValue.month) setTimeMonth(m.timeValue.month.toString());
        if (m.timeValue.day) setTimeDay(m.timeValue.day.toString());
        if (m.timeValue.season) setTimeSeason(m.timeValue.season);
        if (m.timeValue.age) setTimeAge(m.timeValue.age.toString());
        if (m.timeValue.schoolType) setSchoolType(m.timeValue.schoolType);
        if (m.timeValue.schoolGrade) setSchoolGrade(m.timeValue.schoolGrade.toString());
        if (m.timeValue.freeText) setTimeFree(m.timeValue.freeText);
      }
      setEmotions(m.emotions);
      setSongArtist(m.song?.artist ?? '');
      setSongTitle(m.song?.title ?? '');
      setPhotos(m.photos);
      setMemo(m.memo ?? '');
      setIsFirst(m.isFirst);
    });
  }, [addSheetEditId]);

  function buildTimeValue(): Memory['timeValue'] {
    switch (timeType) {
      case 'date': return { year: parseInt(timeYear) || undefined, month: parseInt(timeMonth) || undefined, day: parseInt(timeDay) || undefined };
      case 'month': return { year: parseInt(timeYear) || undefined, month: parseInt(timeMonth) || undefined };
      case 'year': return { year: parseInt(timeYear) || undefined };
      case 'season': return { year: parseInt(timeYear) || undefined, season: timeSeason ?? undefined };
      case 'age': return { age: parseInt(timeAge) || undefined };
      case 'grade': return { schoolType, schoolGrade: parseInt(schoolGrade) || 1 };
      case 'free': return { freeText: timeFree };
      default: return null;
    }
  }

  async function handleSave() {
    if (!title.trim()) return;
    setSaving(true);
    try {
      const tv = buildTimeValue();
      const cy = computeYear(timeType, tv, birthYear);
      const now = Date.now();
      const memory: Memory = {
        id: addSheetEditId ?? generateUUID(),
        title: title.trim(),
        regionCode, regionLabel,
        timeType, timeValue: tv,
        computedYear: cy,
        emotions,
        song: (songArtist || songTitle) ? { artist: songArtist.trim(), title: songTitle.trim() } : null,
        photos, memo: memo.trim() || null,
        isFirst, isPublic: false,
        createdAt: now, // overwritten below in edit mode
        updatedAt: now,
      };
      if (isEdit) {
        const existing = await getMemory(addSheetEditId!);
        if (!existing) {
          showToast('기존 추억 정보를 불러오지 못했습니다. 다시 시도해주세요.');
          return;
        }
        memory.createdAt = existing.createdAt;
      } else {
        memory.createdAt = now;
      }
      await saveMemory(memory);
      await refreshMemories();
      closeAddSheet();
    } catch (e) {
      console.error(e);
      showToast('저장에 실패했습니다. 다시 시도해주세요.');
    } finally {
      setSaving(false);
    }
  }

  async function handlePhotoAdd(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    const bases = await Promise.all(files.map(fileToBase64));
    setPhotos(prev => [...prev, ...bases]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function toggleEmotion(emoji: string) {
    setEmotions(prev => prev.includes(emoji) ? prev.filter(e => e !== emoji) : [...prev, emoji]);
  }

  const startEmotionTooltip = useCallback((label: string) => {
    tooltipTimer.current = setTimeout(() => setEmotionTooltip(label), 500);
  }, []);

  const clearEmotionTooltip = useCallback(() => {
    if (tooltipTimer.current) { clearTimeout(tooltipTimer.current); tooltipTimer.current = null; }
    setEmotionTooltip(null);
  }, []);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  function handleTouchStart(e: React.TouchEvent) {
    dragStartY.current = e.touches[0].clientY;
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (dragStartY.current === null) return;
    const dy = e.touches[0].clientY - dragStartY.current;
    if (dy > 0) setDragOffset(dy);
  }

  function handleTouchEnd() {
    if (dragOffset > 100) {
      closeAddSheet();
    } else {
      setDragOffset(0);
    }
    dragStartY.current = null;
  }

  const maxGrade = schoolType === 'elementary' ? 6 : 3;

  return (
    <>
      {/* Backdrop */}
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(0,0,0,0.5)', animation: 'fadeIn 0.2s ease' }}
        onClick={closeAddSheet}
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        className="modal-container"
        style={{
          position: 'fixed', bottom: 0, left: '50%', transform: `translateX(-50%) translateY(${dragOffset}px)`,
          width: '100%', maxWidth: '480px',
          height: '85dvh',
          background: 'var(--color-bg)',
          borderTopLeftRadius: 'var(--radius-lg)',
          borderTopRightRadius: 'var(--radius-lg)',
          display: 'flex', flexDirection: 'column',
          zIndex: 50,
          animation: dragOffset > 0 ? 'none' : 'slideUp 0.28s cubic-bezier(0.32, 0.72, 0, 1)',
          transition: dragOffset > 0 ? 'none' : 'transform 0.2s ease',
          boxShadow: 'var(--shadow-lg)',
        }}
      >
        {/* Drag handle */}
        <div
          style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px', flexShrink: 0, cursor: 'grab' }}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div style={{ width: '36px', height: '4px', background: 'var(--color-border)', borderRadius: '2px' }} />
        </div>

        {/* Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '4px 16px 12px', flexShrink: 0,
          borderBottom: '1px solid var(--color-border)',
        }}>
          <h2 style={{ fontSize: '17px', fontWeight: 700 }}>
            {isEdit ? '추억 수정' : '새 추억 추가'}
          </h2>
          <button onClick={closeAddSheet} style={{ fontSize: '20px', color: 'var(--color-text-secondary)', cursor: 'pointer' }}>×</button>
        </div>

        {/* Scrollable form */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
          {/* 제목 */}
          <FormField label="제목" required>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="오늘의 추억 한 줄로..."
              style={inputStyle(!!title)}
            />
          </FormField>

          {/* 지역 */}
          <FormField label="지역">
            <button
              onClick={() => setShowRegionPicker(true)}
              style={{
                ...inputStyle(!!regionLabel),
                textAlign: 'left', cursor: 'pointer', display: 'block', width: '100%',
                color: regionLabel ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
              }}
            >
              {regionLabel ?? '시/군/구 선택'}
            </button>
            {regionLabel && (
              <button
                onClick={() => { setRegionCode(null); setRegionLabel(null); }}
                style={{ marginTop: '4px', fontSize: '12px', color: 'var(--color-text-secondary)', cursor: 'pointer' }}
              >
                ✕ 지역 초기화
              </button>
            )}
          </FormField>

          {/* 시간 */}
          <FormField label="시간">
            {/* Type selector - horizontally scrollable */}
            <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', marginBottom: '10px', paddingBottom: '2px' }}>
              {TIME_TYPES.map(tt => (
                <button
                  key={tt.id ?? 'null'}
                  onClick={() => setTimeType(tt.id)}
                  style={{
                    padding: '6px 12px', borderRadius: '16px', fontSize: '13px',
                    whiteSpace: 'nowrap', flexShrink: 0, cursor: 'pointer',
                    background: timeType === tt.id ? 'var(--color-primary)' : 'var(--color-bg-secondary)',
                    color: timeType === tt.id ? 'white' : 'var(--color-text-secondary)',
                    border: `1px solid ${timeType === tt.id ? 'var(--color-primary)' : 'var(--color-border)'}`,
                    transition: 'all 0.15s',
                  }}
                >
                  {tt.label}
                </button>
              ))}
            </div>

            {/* Type-specific inputs */}
            {timeType === 'date' && (
              <div style={{ display: 'flex', gap: '6px' }}>
                <input type="number" value={timeYear} onChange={e => setTimeYear(e.target.value)} placeholder="연도" style={{ ...inputStyle(!!timeYear), flex: 2 }} />
                <input type="number" value={timeMonth} onChange={e => setTimeMonth(e.target.value)} placeholder="월" min="1" max="12" style={{ ...inputStyle(!!timeMonth), flex: 1 }} />
                <input type="number" value={timeDay} onChange={e => setTimeDay(e.target.value)} placeholder="일" min="1" max="31" style={{ ...inputStyle(!!timeDay), flex: 1 }} />
              </div>
            )}
            {timeType === 'month' && (
              <div style={{ display: 'flex', gap: '6px' }}>
                <input type="number" value={timeYear} onChange={e => setTimeYear(e.target.value)} placeholder="연도" style={{ ...inputStyle(!!timeYear), flex: 2 }} />
                <input type="number" value={timeMonth} onChange={e => setTimeMonth(e.target.value)} placeholder="월" min="1" max="12" style={{ ...inputStyle(!!timeMonth), flex: 1 }} />
              </div>
            )}
            {timeType === 'year' && (
              <input type="number" value={timeYear} onChange={e => setTimeYear(e.target.value)} placeholder="연도" style={inputStyle(!!timeYear)} />
            )}
            {timeType === 'season' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <input type="number" value={timeYear} onChange={e => setTimeYear(e.target.value)} placeholder="연도" style={inputStyle(!!timeYear)} />
                <div style={{ display: 'flex', gap: '6px' }}>
                  {SEASON_OPTIONS.map(s => (
                    <button key={s.id} onClick={() => setTimeSeason(s.id)} style={{
                      flex: 1, padding: '8px 0', borderRadius: 'var(--radius-sm)', fontSize: '14px', cursor: 'pointer',
                      background: timeSeason === s.id ? 'var(--color-primary)' : 'var(--color-bg-secondary)',
                      color: timeSeason === s.id ? 'white' : 'var(--color-text-primary)',
                      border: `1px solid ${timeSeason === s.id ? 'var(--color-primary)' : 'var(--color-border)'}`,
                      fontWeight: timeSeason === s.id ? 600 : 400, transition: 'all 0.15s',
                    }}>{s.label}</button>
                  ))}
                </div>
              </div>
            )}
            {timeType === 'age' && (
              <div>
                {!birthYear && (
                  <p style={{ fontSize: '12px', color: 'var(--color-destructive)', marginBottom: '6px' }}>
                    설정에서 출생연도를 먼저 입력해주세요
                  </p>
                )}
                <input
                  type="number"
                  value={timeAge}
                  onChange={e => setTimeAge(e.target.value)}
                  placeholder="나이 (세는 나이)"
                  disabled={!birthYear}
                  style={{ ...inputStyle(!!timeAge), opacity: birthYear ? 1 : 0.5 }}
                />
                {birthYear && timeAge && !isNaN(parseInt(timeAge)) && (
                  <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
                    → {birthYear + parseInt(timeAge) - 1}년
                  </p>
                )}
              </div>
            )}
            {timeType === 'grade' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {!birthYear && (
                  <p style={{ fontSize: '12px', color: 'var(--color-destructive)' }}>
                    설정에서 출생연도를 먼저 입력해주세요
                  </p>
                )}
                <div style={{ display: 'flex', gap: '6px' }}>
                  {SCHOOL_OPTIONS.map(s => (
                    <button key={s.id} onClick={() => { setSchoolType(s.id); setSchoolGrade('1'); }} style={{
                      flex: 1, padding: '8px 0', borderRadius: 'var(--radius-sm)', fontSize: '13px', cursor: 'pointer',
                      background: schoolType === s.id ? 'var(--color-primary)' : 'var(--color-bg-secondary)',
                      color: schoolType === s.id ? 'white' : 'var(--color-text-primary)',
                      border: `1px solid ${schoolType === s.id ? 'var(--color-primary)' : 'var(--color-border)'}`,
                      fontWeight: schoolType === s.id ? 600 : 400, transition: 'all 0.15s',
                    }}>{s.label}</button>
                  ))}
                </div>
                <select
                  value={schoolGrade}
                  onChange={e => setSchoolGrade(e.target.value)}
                  disabled={!birthYear}
                  style={{ ...inputStyle(true), opacity: birthYear ? 1 : 0.5 }}
                >
                  {Array.from({ length: maxGrade }, (_, i) => i + 1).map(g => (
                    <option key={g} value={g}>{g}학년</option>
                  ))}
                </select>
              </div>
            )}
            {timeType === 'free' && (
              <input
                type="text"
                value={timeFree}
                onChange={e => setTimeFree(e.target.value)}
                placeholder="어릴 때 자주, 군대 가기 전..."
                style={inputStyle(!!timeFree)}
              />
            )}
          </FormField>

          {/* 감정 */}
          <FormField label="감정 태그">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {EMOTIONS.map(({ emoji, label }) => {
                const selected = emotions.includes(emoji);
                return (
                  <button
                    key={emoji}
                    onClick={() => toggleEmotion(emoji)}
                    onPointerDown={() => startEmotionTooltip(label)}
                    onPointerUp={clearEmotionTooltip}
                    onPointerLeave={clearEmotionTooltip}
                    style={{
                      width: '44px', height: '44px', fontSize: '22px',
                      borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                      background: selected ? 'var(--color-primary-light)' : 'var(--color-bg-secondary)',
                      border: `2px solid ${selected ? 'var(--color-primary)' : 'var(--color-border)'}`,
                      transition: 'all 0.15s',
                      position: 'relative',
                    }}
                  >
                    {emoji}
                    {emotionTooltip === label && (
                      <span style={{
                        position: 'absolute', bottom: 'calc(100% + 6px)', left: '50%',
                        transform: 'translateX(-50%)',
                        background: 'rgba(0,0,0,0.8)', color: 'white',
                        padding: '3px 8px', borderRadius: '6px', fontSize: '11px',
                        whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 10,
                      }}>
                        {label}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </FormField>

          {/* 연결 노래 */}
          <FormField label="연결 노래">
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                value={songArtist}
                onChange={e => setSongArtist(e.target.value)}
                placeholder="아티스트"
                style={{ ...inputStyle(!!songArtist), flex: 1 }}
              />
              <input
                type="text"
                value={songTitle}
                onChange={e => setSongTitle(e.target.value)}
                placeholder="곡 제목"
                style={{ ...inputStyle(!!songTitle), flex: 1 }}
              />
            </div>
          </FormField>

          {/* 사진 */}
          <FormField label="사진">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handlePhotoAdd}
              style={{ display: 'none' }}
            />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {photos.map((photo, i) => (
                <div key={i} style={{
                  width: 'calc((100% - 16px) / 3)', aspectRatio: '1 / 1',
                  position: 'relative', borderRadius: 'var(--radius-sm)', overflow: 'hidden',
                  flexShrink: 0,
                }}>
                  <img src={photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  <button
                    onClick={() => setPhotos(prev => prev.filter((_, idx) => idx !== i))}
                    style={{
                      position: 'absolute', top: '4px', right: '4px',
                      width: '22px', height: '22px', borderRadius: '50%',
                      background: 'rgba(0,0,0,0.6)', color: 'white',
                      fontSize: '13px', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                    aria-label="사진 삭제"
                  >×</button>
                </div>
              ))}
              {photos.length < 5 && (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    width: 'calc((100% - 16px) / 3)', aspectRatio: '1 / 1',
                    border: '1.5px dashed var(--color-border)',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--color-bg-secondary)',
                    display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', color: 'var(--color-text-secondary)',
                    flexShrink: 0,
                  }}
                >
                  <span style={{ fontSize: '22px', lineHeight: 1 }}>📷</span>
                  <span style={{ fontSize: '11px', marginTop: '5px' }}>추가</span>
                </button>
              )}
            </div>
          </FormField>

          {/* 메모 */}
          <FormField label="메모">
            <textarea
              value={memo}
              onChange={e => setMemo(e.target.value)}
              placeholder="자유롭게 기록해요..."
              rows={3}
              style={{
                ...inputStyle(!!memo),
                resize: 'vertical',
                minHeight: '80px',
              }}
            />
          </FormField>

          {/* 첫 경험 toggle */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '14px 0',
            borderTop: '1px solid var(--color-border)',
          }}>
            <span style={{ fontSize: '15px', fontWeight: 500 }}>첫 경험이에요</span>
            <button
              onClick={() => setIsFirst(!isFirst)}
              style={{
                width: '48px', height: '26px',
                borderRadius: '13px',
                background: isFirst ? 'var(--color-primary)' : 'var(--color-border)',
                position: 'relative', cursor: 'pointer',
                transition: 'background 0.2s',
                border: 'none',
              }}
              role="switch"
              aria-checked={isFirst}
            >
              <span style={{
                position: 'absolute',
                top: '3px', left: isFirst ? '25px' : '3px',
                width: '20px', height: '20px',
                borderRadius: '50%', background: 'white',
                transition: 'left 0.2s',
                boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
              }} />
            </button>
          </div>

          {/* Bottom padding */}
          <div style={{ height: '16px' }} />
        </div>

        {/* Save button */}
        <div style={{
          padding: '12px 16px',
          borderTop: '1px solid var(--color-border)',
          flexShrink: 0,
          background: 'var(--color-bg)',
        }}>
          <button
            onClick={handleSave}
            disabled={!title.trim() || saving}
            style={{
              width: '100%', padding: '15px',
              background: title.trim() && !saving ? 'var(--color-primary)' : 'var(--color-border)',
              color: title.trim() && !saving ? 'white' : 'var(--color-text-secondary)',
              borderRadius: 'var(--radius-md)', fontSize: '16px', fontWeight: 700,
              cursor: title.trim() && !saving ? 'pointer' : 'not-allowed',
              transition: 'all 0.2s',
            }}
          >
            {saving ? '저장 중...' : '저장하기'}
          </button>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: '100px', left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(0,0,0,0.8)', color: 'white',
          padding: '10px 18px', borderRadius: 'var(--radius-md)',
          fontSize: '14px', zIndex: 200,
          animation: 'fadeIn 0.2s ease',
        }}>
          {toast}
        </div>
      )}

      {/* Region Picker */}
      {showRegionPicker && (
        <RegionPicker
          currentCode={regionCode}
          onSelect={(code, label) => { setRegionCode(code); setRegionLabel(label); }}
          onClose={() => setShowRegionPicker(false)}
        />
      )}
    </>
  );
}

function FormField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '18px' }}>
      <label style={{
        display: 'block', fontSize: '14px', fontWeight: 600,
        color: 'var(--color-text-secondary)', marginBottom: '6px',
      }}>
        {label}
        {required && <span style={{ color: 'var(--color-destructive)', marginLeft: '3px' }}>*</span>}
      </label>
      {children}
    </div>
  );
}

function inputStyle(filled: boolean): React.CSSProperties {
  return {
    width: '100%', padding: '10px 12px',
    border: `2px solid ${filled ? 'var(--color-primary)' : 'var(--color-border)'}`,
    borderRadius: 'var(--radius-sm)', fontSize: '15px',
    background: 'var(--color-bg)', outline: 'none',
    transition: 'border-color 0.2s',
    color: 'var(--color-text-primary)',
  };
}
