import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../AppContext';
import { THEMES, THEME_NAMES, THEME_SWATCH } from '../theme/index';
import type { Theme } from '../theme/index';
import { setSetting } from '../db/index';

export default function OnboardingFlow({ onDone }: { onDone: () => void }) {
  const { setBirthYear, setTheme, theme } = useApp();
  const [step, setStep] = useState<1 | 2>(1);
  const [year, setYear] = useState('2000');

  async function finish(withYear: boolean) {
    if (withYear) await setBirthYear(parseInt(year, 10));
    await setSetting('onboarding_done', true);
    onDone();
  }

  if (step === 1) {
    return (
      <div className="onboarding">
        <div className="onboarding__layers" aria-hidden="true"><span /><span /><span /></div>
        <h1 className="onboarding__mark">켜켜이</h1>
        <p className="onboarding__lede">지나온 장소와 시간을<br />한 겹씩 쌓아 두는 기록장</p>

        <p className="onboarding__q">
          태어난 해를 알려 주세요
          <small>‘중학교 2학년 때’처럼 적은 추억을 몇 년도에 쌓을지 계산할 때만 써요.</small>
        </p>
        <YearWheel value={year} onChange={setYear} />

        <div className="onboarding__actions">
          <button type="button" className="btn btn--block" onClick={() => setStep(2)}>다음</button>
        </div>
      </div>
    );
  }

  return (
    <div className="onboarding">
      <h1 className="page-title">색을 골라 주세요</h1>
      <p className="onboarding__lede" style={{ fontSize: 'var(--t-md)' }}>나중에 설정에서 바꿀 수 있어요.</p>
      <div className="rows" role="radiogroup" aria-label="색" style={{ marginTop: 28 }}>
        {THEMES.map(t => {
          const s = THEME_SWATCH[t];
          return (
            <button key={t} type="button" role="radio" aria-checked={theme === t} className="row" onClick={() => setTheme(t as Theme)}>
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
      <div className="onboarding__actions">
        <button type="button" className="btn btn--block" onClick={() => finish(true)}>시작하기</button>
        <button type="button" className="text-btn text-btn--muted" onClick={() => setStep(1)}>이전</button>
      </div>
    </div>
  );
}

const ITEM = 44;

/** 연도 휠. 스크롤이 멈춘 자리의 연도를 고르고, 키보드 위·아래로도 움직여요. */
export function YearWheel({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const current = new Date().getFullYear();
  const years = useMemo(() => Array.from({ length: current - 1900 + 1 }, (_, i) => current - i), [current]);
  const ref = useRef<HTMLDivElement>(null);
  const frame = useRef(0);

  useEffect(() => {
    const idx = years.indexOf(parseInt(value, 10));
    if (ref.current) ref.current.scrollTop = Math.max(0, idx) * ITEM;
    // 처음 위치만 맞춰요
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onScroll() {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      if (!ref.current) return;
      const idx = Math.min(years.length - 1, Math.max(0, Math.round(ref.current.scrollTop / ITEM)));
      const y = String(years[idx]);
      if (y !== value) onChange(y);
    });
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    const idx = years.indexOf(parseInt(value, 10)) + (e.key === 'ArrowDown' ? 1 : -1);
    const clamped = Math.min(years.length - 1, Math.max(0, idx));
    ref.current?.scrollTo({ top: clamped * ITEM, behavior: 'smooth' });
    onChange(String(years[clamped]));
  }

  return (
    <div className="wheel">
      <div className="wheel__band" />
      <div
        ref={ref}
        className="wheel__list"
        onScroll={onScroll}
        onKeyDown={onKey}
        tabIndex={0}
        role="listbox"
        aria-label="태어난 해"
        aria-activedescendant={`y-${value}`}
      >
        {years.map(y => (
          <div key={y} id={`y-${y}`} role="option" aria-selected={String(y) === value} className="wheel__item"
            onClick={() => { ref.current?.scrollTo({ top: years.indexOf(y) * ITEM, behavior: 'smooth' }); onChange(String(y)); }}>
            {y}년
          </div>
        ))}
      </div>
    </div>
  );
}
