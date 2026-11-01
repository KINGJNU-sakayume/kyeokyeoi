import { useState } from 'react';
import { useApp } from '../AppContext';
import type { LifePeriod } from '../db';
import { deleteLifePeriod } from '../db';
import { inPeriod, lifeStage } from '../utils/archiveUtils';
import { sortMemories } from '../utils/timeUtils';
import MemoryCard from '../components/MemoryCard';
import ArchiveEditor from '../components/ArchiveEditor';
import ConfirmDialog from '../components/ConfirmDialog';
import { IconPlus } from '../components/icons';
export default function TimelineTab() {
  const { memories, periods, navigate, refreshArchive, showToast, openAddSheet, archiveTarget } =
    useApp();
  const [mode, setMode] = useState<'chapters' | 'years'>('chapters');
  const [editing, setEditing] = useState<LifePeriod | 'new' | null>(null);
  const [removing, setRemoving] = useState<LifePeriod | null>(null);
  const builtIn = [
    {
      id: 'childhood',
      title: '어린 시절',
      records: memories.filter((m) => lifeStage(m) === 'childhood'),
    },
    {
      id: 'school',
      title: '학창 시절',
      records: memories.filter((m) => lifeStage(m) === 'school'),
    },
  ].filter((p) => p.records.length > 0);
  const groups = sortMemories(memories);
  return (
    <div className="screen">
      <div className="screen__scroll archive-page">
        <header className="page-head">
          <h1 className="page-title">시간</h1>
          <p className="page-lede">지나온 시기를 펼쳐 보세요.</p>
        </header>
        <div className="filters" role="group" aria-label="시간 탐색">
          <button
            className="chip"
            aria-pressed={mode === 'chapters'}
            onClick={() => setMode('chapters')}
          >
            인생 시기
          </button>
          <button className="chip" aria-pressed={mode === 'years'} onClick={() => setMode('years')}>
            연도별
          </button>
        </div>
        {mode === 'chapters' ? (
          <div className="chapters">
            <button className="text-btn" onClick={() => setEditing('new')}>
              시기 만들기
            </button>
            {periods.map((p) => (
              <section key={p.id} className="chapter">
                <details open={archiveTarget === `period:${p.id}` || undefined}>
                  <summary>
                    <span>{p.title}</span>
                    <small>{memories.filter((m) => inPeriod(m, p)).length}개</small>
                  </summary>
                  <p className="field__hint">
                    직접 만든 시기
                    {p.startYear || p.endYear
                      ? ` · ${p.startYear ?? '…'}–${p.endYear ?? '…'}년`
                      : ''}
                  </p>
                  {memories
                    .filter((m) => inPeriod(m, p))
                    .map((m) => (
                      <MemoryCard
                        key={m.id}
                        memory={m}
                        onClick={() => navigate({ type: 'detail', memoryId: m.id })}
                      />
                    ))}
                  <button className="text-btn" onClick={() => setEditing(p)}>
                    시기 고치기
                  </button>
                  <button className="text-btn text-btn--danger" onClick={() => setRemoving(p)}>
                    시기 삭제
                  </button>
                </details>
              </section>
            ))}
            {builtIn.map((p) => (
              <section key={p.id} className="chapter">
                <details>
                  <summary>
                    <span>{p.title}</span>
                    <small>{p.records.length}개 · 입력 기준</small>
                  </summary>
                  <p className="field__hint">직접 입력한 나이·학년 표현으로 모았어요.</p>
                  {p.records.map((m) => (
                    <MemoryCard
                      key={m.id}
                      memory={m}
                      onClick={() => navigate({ type: 'detail', memoryId: m.id })}
                    />
                  ))}
                </details>
              </section>
            ))}
            {memories.some(
              (m) => lifeStage(m) === 'other' && !periods.some((p) => inPeriod(m, p)),
            ) && (
              <section className="chapter">
                <details>
                  <summary>다른 시기의 기억</summary>
                  {memories
                    .filter((m) => lifeStage(m) === 'other' && !periods.some((p) => inPeriod(m, p)))
                    .map((m) => (
                      <MemoryCard
                        key={m.id}
                        memory={m}
                        onClick={() => navigate({ type: 'detail', memoryId: m.id })}
                      />
                    ))}
                </details>
              </section>
            )}
            {!memories.length && (
              <div className="empty">
                <p className="empty__body">
                  기억이 생기면 이곳에서 시기를 따라 볼 수 있어요. 시기는 나중에 만들어도 괜찮아요.
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="strata">
            {groups.map((g) => (
              <section key={g.year ?? 'unknown'} className="stratum">
                <div className="stratum__year">
                  <span className="stratum__year-label">
                    {g.isMemorySection ? '언젠가' : g.year}
                    <small>{g.memories.length}개</small>
                  </span>
                </div>
                <div className="stratum__items">
                  {g.memories.map((m) => (
                    <MemoryCard
                      key={m.id}
                      memory={m}
                      onClick={() => navigate({ type: 'detail', memoryId: m.id })}
                    />
                  ))}
                </div>
              </section>
            ))}
            <p className="group__note">
              나이·학년에서 환산한 연도는 추정이에요. 원래 입력한 시기 표현을 함께 표시해요.
            </p>
          </div>
        )}
      </div>
      <button className="add-fab" onClick={() => openAddSheet()}>
        <IconPlus />
        기억 쓰기
      </button>
      {editing && (
        <ArchiveEditor
          kind="period"
          value={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      )}
      {removing && (
        <ConfirmDialog
          message="이 시기를 삭제할까요?"
          subMessage="연결된 기억은 모두 유지돼요."
          confirmLabel="삭제"
          onCancel={() => setRemoving(null)}
          onConfirm={async () => {
            try {
              await deleteLifePeriod(removing.id);
              await refreshArchive();
              setRemoving(null);
            } catch {
              showToast('삭제하지 못했어요.');
            }
          }}
        />
      )}
    </div>
  );
}
