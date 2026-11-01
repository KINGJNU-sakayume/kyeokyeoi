import { useState } from 'react';
import { useApp } from '../AppContext';
import { deleteMemory, saveCollection, saveMemory } from '../db';
import { formatTimeDisplay } from '../utils/timeUtils';
import { inPeriod } from '../utils/archiveUtils';
import { forgetPhotoURL } from '../utils/photoUtils';
import { displayRegion, useRegions } from '../map/geodata';
import PhotoGallery from '../components/PhotoGallery';
import MemoryCard from '../components/MemoryCard';
import Sheet from '../components/Sheet';
import ConfirmDialog from '../components/ConfirmDialog';
import { EMOTIONS } from '../utils/emotions';
import { IconBack } from '../components/icons';
const EMOTION_LABEL = new Map(EMOTIONS.map((e) => [e.emoji, e.label]));
export default function MemoryDetailView({ memoryId }: { memoryId: string }) {
  const {
    memories,
    collections,
    periods,
    navigate,
    pickRegion,
    setArchiveTarget,
    goBack,
    refreshArchive,
    openEditSheet,
    showToast,
  } = useApp();
  const regions = useRegions();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [picker, setPicker] = useState<'collection' | 'related' | null>(null);
  const [query, setQuery] = useState('');
  const memory = memories.find((m) => m.id === memoryId);
  const back = () => goBack({ type: 'main', tab: 'memories' });
  async function handleDelete() {
    if (!memory || busy) return;
    setBusy(true);
    try {
      await deleteMemory(memory.id);
      memory.photoIds.forEach(forgetPhotoURL);
      await refreshArchive();
      showToast('기억을 지웠어요.');
      back();
    } catch {
      showToast('지우지 못했어요. 다시 시도해 주세요.');
      setConfirm(false);
    } finally {
      setBusy(false);
    }
  }
  if (!memory)
    return (
      <div className="screen">
        <div className="topbar">
          <button className="icon-btn" onClick={back} aria-label="뒤로">
            <IconBack />
          </button>
        </div>
        <div className="empty">
          <p className="empty__title">이 기억을 찾을 수 없어요</p>
          <p className="empty__body">지워졌거나 다른 기기에서 만든 링크일 수 있어요.</p>
        </div>
      </div>
    );
  const time = formatTimeDisplay(memory);
  const place = displayRegion(memory.regionCode, memory.regionLabel, regions);
  const song = memory.song && [memory.song.artist, memory.song.title].filter(Boolean).join(', ');
  const memberships = collections.filter((c) => c.memoryIds.includes(memory.id));
  const stages = periods.filter((p) => inPeriod(memory, p));
  const sameRegion = memory.regionCode
    ? memories.filter((m) => m.id !== memory.id && m.regionCode === memory.regionCode)
    : [];
  const sameYear =
    memory.computedYear !== null && memory.timeType !== 'free'
      ? memories.filter(
          (m) =>
            m.id !== memory.id && m.timeType !== 'free' && m.computedYear === memory.computedYear,
        )
      : [];
  const linked = memories.filter(
    (m) =>
      m.id !== memory.id &&
      (memory.relatedMemoryIds?.includes(m.id) || m.relatedMemoryIds?.includes(memory.id)),
  );
  const toYear = () => {
    setArchiveTarget(`year:${memory.computedYear}`);
    navigate({ type: 'main', tab: 'memories' });
  };
  return (
    <div className="screen">
      <div className="topbar">
        <button className="icon-btn" onClick={back} aria-label="뒤로">
          <IconBack />
        </button>
        <span className="topbar__spacer" />
        <button className="text-btn" onClick={() => openEditSheet(memory.id)}>
          고치기
        </button>
      </div>
      <article className="screen__scroll">
        <div className="detail">
          {(time || place) && (
            <div className="detail__context">
              {time &&
                (memory.computedYear !== null && memory.timeType !== 'free' ? (
                  <button className="text-btn" onClick={toYear}>
                    {time}
                  </button>
                ) : (
                  <span>{time}</span>
                ))}
              {place &&
                (memory.regionCode && regions?.byCode.has(memory.regionCode) ? (
                  <button
                    className="text-btn"
                    onClick={() => {
                      pickRegion(memory.regionCode);
                      navigate({ type: 'main', tab: 'map' });
                    }}
                  >
                    {place}
                  </button>
                ) : (
                  <span>{place} · 이전 지역 정보</span>
                ))}
            </div>
          )}
          {memory.isFirst && <p className="detail__first">첫 경험</p>}
          <h1 className="detail__title">{memory.title}</h1>
          {memory.memo && <p className="detail__memo">{memory.memo}</p>}
          {memory.photoIds.length > 0 && <PhotoGallery photoIds={memory.photoIds} />}
          {(memory.emotions.length > 0 || song) && (
            <dl className="facts">
              {memory.emotions.length > 0 && (
                <>
                  <dt>기분</dt>
                  <dd>
                    {memory.emotions
                      .map((e) => `${e} ${EMOTION_LABEL.get(e) ?? ''}`.trim())
                      .join('  ')}
                  </dd>
                </>
              )}
              {song && (
                <>
                  <dt>노래</dt>
                  <dd>{song}</dd>
                </>
              )}
            </dl>
          )}
          {(memory.timeType === 'age' || memory.timeType === 'grade') &&
            memory.computedYear !== null && (
              <p className="field__hint">
                {memory.computedYear}년은 태어난 해를 기준으로 환산한 추정 연도예요.
              </p>
            )}
          {stages.length > 0 && (
            <section className="related-section">
              <h2>인생 시기</h2>
              {stages.map((p) => (
                <button
                  className="text-btn"
                  key={p.id}
                  onClick={() => {
                    setArchiveTarget(`period:${p.id}`);
                    navigate({ type: 'main', tab: 'timeline' });
                  }}
                >
                  {p.title}
                </button>
              ))}
            </section>
          )}
          {sameRegion.length > 0 && (
            <section className="related-section">
              <h2>같은 지역의 기억</h2>
              {sameRegion.slice(0, 4).map((m) => (
                <MemoryCard
                  key={m.id}
                  memory={m}
                  hideRegion
                  onClick={() => navigate({ type: 'detail', memoryId: m.id })}
                />
              ))}
              <button
                className="text-btn"
                onClick={() => {
                  setArchiveTarget(`region:${memory.regionCode}`);
                  navigate({ type: 'main', tab: 'memories' });
                }}
              >
                이 지역의 기억 모두 보기
              </button>
            </section>
          )}
          {sameYear.length > 0 && (
            <section className="related-section">
              <h2>
                같은 연도의 기억
                {memory.timeType === 'age' || memory.timeType === 'grade' ? ' (추정 포함)' : ''}
              </h2>
              {sameYear.slice(0, 4).map((m) => (
                <MemoryCard
                  key={m.id}
                  memory={m}
                  onClick={() => navigate({ type: 'detail', memoryId: m.id })}
                />
              ))}
              <button className="text-btn" onClick={toYear}>
                이 연도의 기억 모두 보기
              </button>
            </section>
          )}
          <section className="related-section">
            <h2>컬렉션</h2>
            {memberships.map((c) => (
              <button
                className="text-btn"
                key={c.id}
                onClick={() => {
                  setArchiveTarget(`collection:${c.id}`);
                  navigate({ type: 'main', tab: 'collections' });
                }}
              >
                {c.title}
              </button>
            ))}
            <button className="text-btn" onClick={() => setPicker('collection')}>
              컬렉션에 담기
            </button>
          </section>
          <section className="related-section">
            <h2>직접 연결한 기억</h2>
            {linked.map((m) => (
              <MemoryCard
                key={m.id}
                memory={m}
                onClick={() => navigate({ type: 'detail', memoryId: m.id })}
              />
            ))}
            <button className="text-btn" onClick={() => setPicker('related')}>
              기억 연결하기
            </button>
          </section>
          {memory.source && (
            <p className="field__hint">
              출처: {memory.source.service} · {memory.source.originalId} ·{' '}
              {memory.source.certainty === 'inferred' ? '추정 정보' : '확인된 정보'}
            </p>
          )}
          <div className="detail__foot">
            <span>{new Date(memory.createdAt).toLocaleDateString('ko-KR')}에 기록</span>
            <button
              className="text-btn text-btn--danger"
              onClick={() => setConfirm(true)}
              disabled={busy}
            >
              지우기
            </button>
          </div>
        </div>
      </article>
      {confirm && (
        <ConfirmDialog
          message="이 기억을 지울까요?"
          subMessage="사진도 함께 지워져요. 방문 표시는 유지돼요."
          confirmLabel="지우기"
          destructive
          busy={busy}
          onConfirm={handleDelete}
          onCancel={() => setConfirm(false)}
        />
      )}
      {picker && (
        <Sheet
          label={picker === 'collection' ? '담을 컬렉션' : '연결할 기억'}
          title={picker === 'collection' ? '담을 컬렉션' : '연결할 기억'}
          size="tall"
          onClose={() => setPicker(null)}
          left={
            <button className="text-btn" onClick={() => setPicker(null)}>
              닫기
            </button>
          }
        >
          <div className="sheet__body">
            {picker === 'collection' ? (
              <>
                {!collections.length && (
                  <p className="field__hint">컬렉션 화면에서 먼저 모음을 만들어 주세요.</p>
                )}
                {collections.map((c) => (
                  <button
                    className="row"
                    key={c.id}
                    disabled={busy}
                    aria-pressed={c.memoryIds.includes(memory.id)}
                    onClick={async () => {
                      setBusy(true);
                      try {
                        await saveCollection({
                          ...c,
                          memoryIds: c.memoryIds.includes(memory.id)
                            ? c.memoryIds.filter((id) => id !== memory.id)
                            : [...c.memoryIds, memory.id],
                          updatedAt: Date.now(),
                        });
                        await refreshArchive();
                      } catch {
                        showToast('컬렉션을 변경하지 못했어요.');
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    <span className="row__label">{c.title}</span>
                    <span>{c.memoryIds.includes(memory.id) ? '담김 · 빼기' : '담기'}</span>
                  </button>
                ))}
              </>
            ) : (
              <>
                <input
                  className="input"
                  type="search"
                  aria-label="연결할 기억 검색"
                  placeholder="제목·본문 검색"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                {memories
                  .filter((m) => m.id !== memory.id && `${m.title} ${m.memo ?? ''}`.includes(query))
                  .map((m) => (
                    <button
                      className="row"
                      key={m.id}
                      disabled={busy}
                      aria-pressed={memory.relatedMemoryIds?.includes(m.id) ?? false}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          const ids = memory.relatedMemoryIds ?? [];
                          await saveMemory(
                            {
                              ...memory,
                              relatedMemoryIds: ids.includes(m.id)
                                ? ids.filter((id) => id !== m.id)
                                : [...ids, m.id],
                              updatedAt: Date.now(),
                            },
                            [],
                            [],
                            memory.updatedAt,
                          );
                          await refreshArchive();
                        } catch (e) {
                          showToast(e instanceof Error ? e.message : '연결을 저장하지 못했어요.');
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      <span>
                        {m.title}
                        {memory.relatedMemoryIds?.includes(m.id) ? ' · 연결됨' : ''}
                      </span>
                    </button>
                  ))}
              </>
            )}
          </div>
        </Sheet>
      )}
    </div>
  );
}
