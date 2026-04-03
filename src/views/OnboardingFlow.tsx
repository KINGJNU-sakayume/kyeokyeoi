import { useState, useRef, useEffect } from 'react';
import { useApp } from '../AppContext';
import { THEMES, THEME_NAMES, THEME_COLORS, applyTheme } from '../theme/index'
import type { Theme } from '../theme/index';
import { setSetting } from '../db/index';

export default function OnboardingFlow() {
  const { navigate, setBirthYear, setTheme } = useApp();
  const [step, setStep] = useState(1);
  const [birthYearInput, setBirthYearInput] = useState('');
  const [selectedTheme, setSelectedTheme] = useState<Theme>('A');

  const currentYear = new Date().getFullYear();
  const birthYearNum = parseInt(birthYearInput, 10);
  const birthYearValid = !isNaN(birthYearNum) && birthYearNum >= 1900 && birthYearNum <= currentYear;

  async function handleStart() {
    await setTheme(selectedTheme);
    await setSetting('onboarding_done', true);
    await setBirthYear(birthYearNum); // setBirthYear internally calls setSetting('birth_year', ...)
    navigate({ type: 'main', tab: 'map' });
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: 'var(--color-primary-light)', padding: '40px 24px 32px',
    }}>
      {/* Step indicator */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '40px' }}>
        {[1, 2, 3].map(s => (
          <div key={s} style={{
            height: '3px', flex: 1,
            background: s <= step ? 'var(--color-primary)' : 'var(--color-border)',
            borderRadius: '2px', transition: 'background 0.3s',
          }} />
        ))}
      </div>

      <div style={{ flex: 1, overflow: 'auto' }}>
        {step === 1 && <Step1
          birthYearInput={birthYearInput}
          setBirthYearInput={setBirthYearInput}
          valid={birthYearValid}
          onNext={() => setStep(2)}
        />}
        {step === 2 && <Step2
          selectedTheme={selectedTheme}
          onSelect={t => { setSelectedTheme(t); applyTheme(t); }}
          onNext={() => setStep(3)}
        />}
        {step === 3 && <Step3 onStart={handleStart} />}
      </div>
    </div>
  );
}

function Step1({ birthYearInput, setBirthYearInput, valid, onNext }: {
  birthYearInput: string;
  setBirthYearInput: (v: string) => void;
  valid: boolean;
  onNext: () => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div>
        <h1 style={{ fontSize: '32px', fontWeight: 700, color: 'var(--color-primary-deep)', marginBottom: '8px' }}>
          켜켜이
        </h1>
        <p style={{ fontSize: '16px', color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
          추억을 켜켜이 쌓는 인생 아카이브
        </p>
      </div>

      <div style={{ marginTop: '16px' }}>
        <label style={{ display: 'block', fontWeight: 600, marginBottom: '8px', color: 'var(--color-text-primary)' }}>
          태어난 연도를 입력해주세요
        </label>
        <YearPicker value={birthYearInput} onChange={setBirthYearInput} />
        <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginTop: '6px' }}>
          나이/학년 추억 기록에 사용됩니다
        </p>
      </div>

      <button
        onClick={onNext}
        disabled={!valid}
        style={{
          width: '100%', padding: '16px',
          background: valid ? 'var(--color-primary)' : 'var(--color-border)',
          color: valid ? 'white' : 'var(--color-text-secondary)',
          borderRadius: 'var(--radius-md)', fontSize: '16px', fontWeight: 600,
          cursor: valid ? 'pointer' : 'not-allowed',
          transition: 'all 0.2s', marginTop: '8px',
        }}
      >
        다음
      </button>
    </div>
  );
}

function Step2({ selectedTheme, onSelect, onNext }: {
  selectedTheme: Theme;
  onSelect: (t: Theme) => void;
  onNext: () => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div>
        <h2 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--color-primary-deep)', marginBottom: '8px' }}>
          테마를 선택해주세요
        </h2>
        <p style={{ fontSize: '14px', color: 'var(--color-text-secondary)' }}>
          나중에 설정에서 변경할 수 있어요
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        {THEMES.map(t => {
          const colors = THEME_COLORS[t];
          const active = selectedTheme === t;
          return (
            <button
              key={t}
              onClick={() => onSelect(t)}
              style={{
                padding: '20px 16px',
                border: `2px solid ${active ? 'white' : 'transparent'}`,
                borderRadius: 'var(--radius-md)',
                background: `linear-gradient(135deg, ${colors.primaryDeep} 0%, ${colors.primary} 60%, ${colors.accent} 100%)`,
                textAlign: 'left', cursor: 'pointer',
                transition: 'all 0.15s',
                position: 'relative',
                minHeight: '88px',
                boxShadow: active ? `0 0 0 2px ${colors.primary}` : 'none',
              }}
            >
              {active && (
                <span style={{ position: 'absolute', top: '10px', right: '12px', fontSize: '14px', color: 'white' }}>✓</span>
              )}
              <div style={{ fontWeight: 700, fontSize: '14px', color: 'white', marginTop: '16px' }}>
                {THEME_NAMES[t]}
              </div>
              <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.75)', marginTop: '3px' }}>
                테마 {t}
              </div>
            </button>
          );
        })}
      </div>

      <button
        onClick={onNext}
        style={{
          width: '100%', padding: '16px',
          background: 'var(--color-primary)', color: 'white',
          borderRadius: 'var(--radius-md)', fontSize: '16px', fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        다음
      </button>
    </div>
  );
}

function YearPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const currentYear = new Date().getFullYear();
  const years: number[] = [];
  for (let y = currentYear; y >= 1900; y--) years.push(y);

  const ITEM_HEIGHT = 48;
  const VISIBLE = 5;
  const containerRef = useRef<HTMLDivElement>(null);
  const scrolling = useRef(false);

  useEffect(() => {
    if (!containerRef.current) return;
    const idx = value ? years.indexOf(parseInt(value, 10)) : 0;
    containerRef.current.scrollTop = Math.max(0, idx) * ITEM_HEIGHT;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleScroll() {
    if (!containerRef.current) return;
    if (scrolling.current) return;
    scrolling.current = true;
    requestAnimationFrame(() => {
      scrolling.current = false;
      if (!containerRef.current) return;
      const idx = Math.round(containerRef.current.scrollTop / ITEM_HEIGHT);
      const year = years[Math.min(idx, years.length - 1)];
      if (year !== undefined) onChange(year.toString());
    });
  }

  return (
    <div style={{ position: 'relative', height: `${ITEM_HEIGHT * VISIBLE}px`, overflow: 'hidden', borderRadius: 'var(--radius-md)', border: '2px solid var(--color-border)', background: 'var(--color-bg)' }}>
      {/* Selection highlight */}
      <div style={{
        position: 'absolute', top: '50%', transform: 'translateY(-50%)',
        left: 0, right: 0, height: `${ITEM_HEIGHT}px`,
        background: 'var(--color-primary-light)',
        borderTop: '1px solid var(--color-primary)',
        borderBottom: '1px solid var(--color-primary)',
        pointerEvents: 'none', zIndex: 1,
      }} />
      {/* Fade top */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: `${ITEM_HEIGHT * 2}px`, background: 'linear-gradient(to bottom, var(--color-bg) 0%, transparent 100%)', pointerEvents: 'none', zIndex: 2 }} />
      {/* Fade bottom */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: `${ITEM_HEIGHT * 2}px`, background: 'linear-gradient(to top, var(--color-bg) 0%, transparent 100%)', pointerEvents: 'none', zIndex: 2 }} />
      <div
        ref={containerRef}
        onScroll={handleScroll}
        style={{
          height: '100%', overflowY: 'scroll',
          scrollSnapType: 'y mandatory',
          paddingTop: `${ITEM_HEIGHT * 2}px`,
          paddingBottom: `${ITEM_HEIGHT * 2}px`,
          scrollbarWidth: 'none',
        }}
      >
        {years.map(year => {
          const selected = value === year.toString();
          return (
            <div
              key={year}
              style={{
                height: `${ITEM_HEIGHT}px`, display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: selected ? '20px' : '17px', fontWeight: selected ? 700 : 400,
                scrollSnapAlign: 'center',
                color: selected ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                transition: 'font-size 0.1s, color 0.1s',
              }}
            >
              {year}년
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Step3({ onStart }: { onStart: () => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '32px', paddingTop: '40px' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '64px', marginBottom: '20px' }}>🌿</div>
        <h2 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--color-primary-deep)', marginBottom: '12px' }}>
          준비됐어요!
        </h2>
        <p style={{ fontSize: '15px', color: 'var(--color-text-secondary)', lineHeight: 1.7 }}>
          이제 소중한 추억들을<br />켜켜이 쌓아가 보세요
        </p>
      </div>

      <button
        onClick={onStart}
        style={{
          width: '100%', padding: '18px',
          background: 'var(--color-primary)', color: 'white',
          borderRadius: 'var(--radius-lg)', fontSize: '17px', fontWeight: 700,
          cursor: 'pointer', letterSpacing: '-0.3px',
          boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
        }}
      >
        켜켜이 시작하기
      </button>
    </div>
  );
}
