import { useState, useEffect, useRef } from 'react';
import { loadRegions, getProvinces, getRegionsByProvince } from '../map/geodata'
import type { RegionData } from '../map/geodata';
import KoreaMap from '../map/KoreaMap';

interface RegionPickerProps {
  onSelect: (code: string, label: string) => void;
  onClose: () => void;
  currentCode?: string | null;
}

export default function RegionPicker({ onSelect, onClose, currentCode }: RegionPickerProps) {
  const [regions, setRegions] = useState<RegionData[]>([]);
  const [provinces, setProvinces] = useState<string[]>([]);
  const [selectedProvince, setSelectedProvince] = useState<string | null>(null);
  const [selectedCode, setSelectedCode] = useState<string | null>(currentCode ?? null);
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadRegions().then(r => {
      setRegions(r);
      setProvinces(getProvinces(r));
    });
  }, []);

  const municipalitiesInProvince = selectedProvince
    ? getRegionsByProvince(selectedProvince, regions)
    : [];

  const selectedRegion = selectedCode ? regions.find(r => r.code === selectedCode) : null;

  function handleConfirm() {
    if (!selectedCode || !selectedRegion) return;
    const province = selectedRegion.province ?? '';
    const label = province ? `${province} ${selectedRegion.name}` : selectedRegion.name;
    onSelect(selectedCode, label);
    onClose();
  }

  function handleMapClick(code: string) {
    const region = regions.find(r => r.code === code);
    if (region) {
      setSelectedCode(code);
      setSelectedProvince(region.province ?? null);
    }
  }

  const selectedColors = new Map<string, string>();
  if (selectedCode) {
    selectedColors.set(selectedCode, 'var(--color-primary-deep)');
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 60,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'flex-end',
      }}
      onClick={onClose}
    >
      <div
        ref={sheetRef}
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: '480px', margin: '0 auto',
          background: 'var(--color-bg)',
          borderTopLeftRadius: 'var(--radius-lg)',
          borderTopRightRadius: 'var(--radius-lg)',
          maxHeight: '90dvh',
          display: 'flex', flexDirection: 'column',
          animation: 'slideUp 0.25s ease',
        }}
      >
        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px' }}>
          <div style={{ width: '36px', height: '4px', background: 'var(--color-border)', borderRadius: '2px' }} />
        </div>

        {/* Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '8px 16px 12px',
        }}>
          <h3 style={{ fontSize: '17px', fontWeight: 700 }}>지역 선택</h3>
          <button onClick={onClose} style={{ fontSize: '20px', color: 'var(--color-text-secondary)', cursor: 'pointer' }}>×</button>
        </div>

        {/* Mini map */}
        <div style={{ padding: '0 16px', flexShrink: 0 }}>
          <KoreaMap
            compact
            regionColors={selectedColors}
            onRegionClick={handleMapClick}
            selectedCode={selectedCode}
          />
        </div>

        {/* Province selector */}
        <div style={{ padding: '12px 16px 4px', flexShrink: 0 }}>
          <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-secondary)', display: 'block', marginBottom: '8px' }}>
            시/도 선택
          </label>
          <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '4px' }}>
            {provinces.map(p => (
              <button
                key={p}
                onClick={() => { setSelectedProvince(p); setSelectedCode(null); }}
                style={{
                  padding: '6px 12px', borderRadius: '16px', fontSize: '13px',
                  whiteSpace: 'nowrap', flexShrink: 0, cursor: 'pointer',
                  background: selectedProvince === p ? 'var(--color-primary)' : 'var(--color-bg-secondary)',
                  color: selectedProvince === p ? 'white' : 'var(--color-text-secondary)',
                  border: `1px solid ${selectedProvince === p ? 'var(--color-primary)' : 'var(--color-border)'}`,
                  transition: 'all 0.15s',
                }}
              >
                {p.replace('특별시', '').replace('광역시', '').replace('특별자치시', '').replace('특별자치도', '').replace('도', '')}
              </button>
            ))}
          </div>
        </div>

        {/* Municipality list */}
        {selectedProvince && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 16px' }}>
            <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-secondary)', display: 'block', marginBottom: '8px' }}>
              시/군/구 선택
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {municipalitiesInProvince.map(r => (
                <button
                  key={r.code}
                  onClick={() => setSelectedCode(r.code)}
                  style={{
                    padding: '7px 13px', borderRadius: '16px', fontSize: '13px',
                    cursor: 'pointer',
                    background: selectedCode === r.code ? 'var(--color-primary)' : 'var(--color-bg-secondary)',
                    color: selectedCode === r.code ? 'white' : 'var(--color-text-primary)',
                    border: `1px solid ${selectedCode === r.code ? 'var(--color-primary)' : 'var(--color-border)'}`,
                    transition: 'all 0.15s',
                    fontWeight: selectedCode === r.code ? 600 : 400,
                  }}
                >
                  {r.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Confirm button */}
        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--color-border)', flexShrink: 0 }}>
          <button
            onClick={handleConfirm}
            disabled={!selectedCode}
            style={{
              width: '100%', padding: '14px',
              background: selectedCode ? 'var(--color-primary)' : 'var(--color-border)',
              color: selectedCode ? 'white' : 'var(--color-text-secondary)',
              borderRadius: 'var(--radius-md)', fontSize: '15px', fontWeight: 600,
              cursor: selectedCode ? 'pointer' : 'not-allowed',
              transition: 'all 0.2s',
            }}
          >
            {selectedCode && selectedRegion ? `${selectedRegion.name} 선택` : '이 지역으로 선택'}
          </button>
        </div>
      </div>
    </div>
  );
}
