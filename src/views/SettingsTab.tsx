import { useState } from 'react';
import { useApp } from '../AppContext';
import { THEMES, THEME_NAMES, THEME_COLORS } from '../theme/index'
import type { Theme } from '../theme/index';
import { getMemories, saveMemory } from '../db/index';
import { computeYear } from '../utils/timeUtils';

export default function SettingsTab() {
  const { birthYear, setBirthYear, theme, setTheme, refreshMemories } = useApp();
  const [editingBirthYear, setEditingBirthYear] = useState(false);
  const [birthYearInput, setBirthYearInput] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSaveBirthYear() {
    const year = parseInt(birthYearInput, 10);
    const currentYear = new Date().getFullYear();
    if (isNaN(year) || year < 1900 || year > currentYear) return;

    setSaving(true);
    try {
      await setBirthYear(year);
      // Recompute computedYear for all age/grade memories
      const all = await getMemories();
      for (const m of all) {
        if (m.timeType === 'age' || m.timeType === 'grade') {
          const updated = { ...m, computedYear: computeYear(m.timeType, m.timeValue, year), updatedAt: Date.now() };
          await saveMemory(updated);
        }
      }
      await refreshMemories();
      setEditingBirthYear(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto' }}>
      {/* Header */}
      <div style={{ padding: '16px', borderBottom: '1px solid var(--color-border)', flexShrink: 0 }}>
        <h1 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--color-primary-deep)' }}>설정</h1>
      </div>

      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {/* Birth year section */}
        <section>
          <h2 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            생년 설정
          </h2>
          <div style={{
            background: 'var(--color-bg)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
            overflow: 'hidden',
          }}>
            {!editingBirthYear ? (
              <button
                onClick={() => { setBirthYearInput(birthYear?.toString() ?? ''); setEditingBirthYear(true); }}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  width: '100%', padding: '16px', cursor: 'pointer',
                  background: 'none', textAlign: 'left',
                }}
              >
                <span style={{ fontSize: '15px', color: 'var(--color-text-primary)' }}>출생연도</span>
                <span style={{ fontSize: '15px', color: 'var(--color-primary)', fontWeight: 600 }}>
                  {birthYear ? `${birthYear}년` : '미설정'}
                </span>
              </button>
            ) : (
              <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <label style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                  출생연도
                </label>
                <input
                  type="number"
                  value={birthYearInput}
                  onChange={e => setBirthYearInput(e.target.value)}
                  placeholder="예: 1995"
                  min="1900"
                  max={new Date().getFullYear().toString()}
                  autoFocus
                  style={{
                    width: '100%', padding: '10px 12px',
                    border: '2px solid var(--color-primary)',
                    borderRadius: 'var(--radius-sm)', fontSize: '16px',
                    outline: 'none', background: 'var(--color-bg)',
                  }}
                />
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => setEditingBirthYear(false)}
                    style={{
                      flex: 1, padding: '10px',
                      border: '1px solid var(--color-border)',
                      borderRadius: 'var(--radius-sm)', fontSize: '14px', cursor: 'pointer',
                      background: 'var(--color-bg)', color: 'var(--color-text-secondary)',
                    }}
                  >
                    취소
                  </button>
                  <button
                    onClick={handleSaveBirthYear}
                    disabled={saving}
                    style={{
                      flex: 1, padding: '10px',
                      background: 'var(--color-primary)', color: 'white',
                      borderRadius: 'var(--radius-sm)', fontSize: '14px', fontWeight: 600,
                      cursor: saving ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {saving ? '저장 중...' : '저장'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Theme section */}
        <section>
          <h2 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            테마
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            {THEMES.map(t => {
              const colors = THEME_COLORS[t];
              const active = theme === t;
              return (
                <button
                  key={t}
                  onClick={() => setTheme(t as Theme)}
                  style={{
                    padding: '18px 14px',
                    border: `2px solid ${active ? 'white' : 'transparent'}`,
                    borderRadius: 'var(--radius-md)',
                    background: `linear-gradient(135deg, ${colors.primaryDeep} 0%, ${colors.primary} 60%, ${colors.accent} 100%)`,
                    textAlign: 'left', cursor: 'pointer',
                    position: 'relative',
                    transition: 'all 0.15s',
                    minHeight: '80px',
                    boxShadow: active ? `0 0 0 2px ${colors.primary}` : 'none',
                  }}
                >
                  {active && (
                    <span style={{ position: 'absolute', top: '8px', right: '10px', fontSize: '14px', color: 'white' }}>✓</span>
                  )}
                  <div style={{ fontWeight: 700, fontSize: '13px', color: 'white', marginTop: '14px' }}>
                    {THEME_NAMES[t]}
                  </div>
                  <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.75)', marginTop: '2px' }}>
                    테마 {t}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* App info */}
        <section style={{ paddingTop: '8px', borderTop: '1px solid var(--color-border)' }}>
          <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', textAlign: 'center', lineHeight: 1.7 }}>
            켜켜이 — 추억을 켜켜이 쌓는 인생 아카이브<br />
            모든 데이터는 이 기기에만 저장됩니다
          </p>
        </section>
      </div>
    </div>
  );
}
