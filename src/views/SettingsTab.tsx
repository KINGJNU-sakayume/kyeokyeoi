import { useEffect, useRef, useState } from 'react';
import { useApp } from '../AppContext';
import { THEMES, THEME_NAMES, THEME_SWATCH } from '../theme/index';
import { buildBackup, estimateUsage, getMemories, getSetting, importBackup, setSetting, updateMemories } from '../db/index';
import { computeYear } from '../utils/timeUtils';
import { formatBytes } from '../utils/photoUtils';
import Sheet from '../components/Sheet';
import { YearWheel } from './OnboardingFlow';

export default function SettingsTab() {
  const { birthYear, setBirthYear, theme, setTheme, refreshMemories, memories, showToast } = useApp();
  const [editingYear, setEditingYear] = useState(false);
  const [yearDraft, setYearDraft] = useState('');
  const [usage, setUsage] = useState<string | null>(null);
  const [lastBackup, setLastBackup] = useState<number | null>(null);
  const [busy, setBusy] = useState<'export' | 'import' | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    estimateUsage().then(u => setUsage(u ? formatBytes(u.usage) : null));
    getSetting<number>('last_backup_at').then(t => setLastBackup(t ?? null));
  }, [memories]);

  async function saveYear() {
    const y = parseInt(yearDraft, 10);
    if (!Number.isFinite(y)) return;
    await setBirthYear(y);
    // 나이·학년으로 적은 추억의 연도를 다시 계산해요
    const all = await getMemories();
    const changed = all
      .filter(m => m.timeType === 'age' || m.timeType === 'grade')
      .map(m => ({ ...m, computedYear: computeYear(m.timeType, m.timeValue, y), updatedAt: Date.now() }));
    if (changed.length) await updateMemories(changed);
    await refreshMemories();
    setEditingYear(false);
  }

  async function exportBackup() {
    setBusy('export');
    try {
      const { file, missingPhotos } = await buildBackup();
      const blob = new Blob([JSON.stringify(file)], { type: 'application/json' });
      const name = `kyeokyeoi-${new Date().toISOString().slice(0, 10)}.json`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      const now = Date.now();
      await setSetting('last_backup_at', now);
      setLastBackup(now);
      showToast(missingPhotos
        ? `백업 파일을 만들었어요. 사진 ${missingPhotos}장은 읽지 못해 빠졌어요.`
        : '백업 파일을 만들었어요.');
    } catch (e) {
      console.error(e);
      showToast('백업 파일을 만들지 못했어요.');
    } finally {
      setBusy(null);
    }
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 300 * 1024 * 1024) { showToast('파일이 너무 커요 (300MB까지).'); return; }
    setBusy('import');
    try {
      const json = JSON.parse(await file.text());
      const r = await importBackup(json);
      await refreshMemories();
      const parts = [`${r.added}개를 더했어요`];
      if (r.skipped) parts.push(`이미 있는 ${r.skipped}개는 그대로 뒀어요`);
      if (r.invalid) parts.push(`형식이 틀린 ${r.invalid}개는 건너뛰었어요`);
      showToast(parts.join('. ') + '.');
    } catch (err) {
      showToast(err instanceof SyntaxError ? 'JSON 파일이 아니에요.' : err instanceof Error ? err.message : '불러오지 못했어요.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="screen">
      <div className="screen__scroll">
        <header className="page-head">
          <h1 className="page-title">설정</h1>
        </header>

        <section className="group" aria-labelledby="g-me">
          <h2 className="group__title" id="g-me">나</h2>
          <div className="rows">
            <button type="button" className="row" onClick={() => { setYearDraft(String(birthYear ?? 2000)); setEditingYear(true); }}>
              <span className="row__label">
                태어난 해
                <small>‘몇 살 때’, ‘몇 학년 때’로 적은 추억의 연도를 계산해요</small>
              </span>
              <span className="row__value">{birthYear ? `${birthYear}년` : '안 적음'}</span>
              <svg className="row__chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
            </button>
          </div>
        </section>

        <section className="group" aria-labelledby="g-theme">
          <h2 className="group__title" id="g-theme">색</h2>
          <div className="rows" role="radiogroup" aria-labelledby="g-theme">
            {THEMES.map(t => {
              const s = THEME_SWATCH[t];
              return (
                <button key={t} type="button" role="radio" aria-checked={theme === t} className="row" onClick={() => setTheme(t)}>
                  <span className="swatch" aria-hidden="true">
                    <span style={{ background: s.paper }} />
                    <span style={{ background: s.land }} />
                    <span style={{ background: s.primary }} />
                    <span style={{ background: s.deep }} />
                  </span>
                  <span className="row__label">{THEME_NAMES[t]}</span>
                  {theme === t && <svg className="row__check" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>}
                </button>
              );
            })}
          </div>
        </section>

        <section className="group" aria-labelledby="g-data">
          <h2 className="group__title" id="g-data">백업</h2>
          <div className="rows">
            <button type="button" className="row" onClick={exportBackup} disabled={busy !== null}>
              <span className="row__label">
                {busy === 'export' ? '백업 파일 만드는 중' : '백업 파일 내려받기'}
                <small>{lastBackup ? `마지막 백업 ${new Date(lastBackup).toLocaleDateString('ko-KR')}` : '아직 백업한 적 없어요'}</small>
              </span>
            </button>
            <button type="button" className="row" onClick={() => fileRef.current?.click()} disabled={busy !== null}>
              <span className="row__label">
                {busy === 'import' ? '불러오는 중' : '백업 파일에서 불러오기'}
                <small>지금 기록은 지우지 않고, 없는 추억만 더해요</small>
              </span>
            </button>
          </div>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={handleImport} />
          <p className="group__note">
            기록은 이 브라우저 안에만 있어요. 브라우저 데이터를 지우거나 기기를 바꾸면 사라지니 가끔 백업해 두세요.
            {usage && ` 지금 ${usage}를 쓰고 있어요.`}
          </p>
        </section>

        <p className="about">켜켜이는 지나온 장소와 시간을 한 겹씩 쌓아 두는 기록장이에요.</p>
      </div>

      {editingYear && (
        <Sheet
          label="태어난 해"
          onClose={() => setEditingYear(false)}
          left={<button type="button" className="text-btn text-btn--muted" onClick={() => setEditingYear(false)}>취소</button>}
          title="태어난 해"
          right={<button type="button" className="text-btn" onClick={saveYear}>저장</button>}
        >
          <div className="sheet__body">
            <YearWheel value={yearDraft} onChange={setYearDraft} />
          </div>
        </Sheet>
      )}
    </div>
  );
}
