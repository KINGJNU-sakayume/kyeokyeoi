import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../AppContext';
import { getMemories, getRegionVisits, newId, repository } from '../db/index';
import {
  APP_URL, autoApplyEnabled, beginConnect, browserDeps, completeConnect, connectAvailable, disconnect, isAuthCallback,
  isConnected, LifeHubError, memoryPrefill, rejectLocally, rememberVisitReceipt, setAutoApply, sourceFor, sync,
  uploadRegionRefs, validDate,
} from '../integration/lifehub';
import type { Proposal } from '../integration/lifehub';
import { boardEnabled, setBoardEnabled, uploadBoard } from '../integration/boardUpload';
import { planAutoApply, regionRefs, type RegionEntry } from '../integration/lifehubApply';
import {
  getLifeHubState, hubPhase, requestLifeHubSync, setLifeHubState, statusLine, SYNC_EVENT, useLifeHub,
} from '../integration/lifehubStore';
import { loadRegions, PROVINCES, provinceOf, regionLabel, useRegions } from '../map/geodata';
import { matchRegion } from '../map/regionMatch';
import Sheet from './Sheet';
import RegionPicker from './RegionPicker';
import ConfirmDialog from './ConfirmDialog';

// The one-time code exchange must not run twice (React StrictMode runs effects twice in development).
let callbackOnce: Promise<void> | null = null;

/** Region labels exactly as 켜켜이 shows them (and shares with Life Hub for the card picker). */
async function regionEntries(): Promise<{ entries: RegionEntry[]; groupOf: (code: string) => string } | null> {
  const set = await loadRegions();
  if (!set) return null;
  return {
    entries: set.regions.map((r) => ({ code: r.code, label: regionLabel(r) })),
    groupOf: (code) => {
      const r = set.byCode.get(code);
      return (r && provinceOf(r)?.short) || '기타';
    },
  };
}

/**
 * Saves proposals the owner already approved in a Claude card, when nothing is left to decide.
 * Returns how many were saved; a failure leaves the proposal for the owner.
 */
async function applyApproved(proposals: Proposal[], regions: RegionEntry[]): Promise<number> {
  if (!autoApplyEnabled(browserDeps())) return 0;
  const birthYear = (await repository.getSetting<number>('birth_year')) ?? null;
  let saved = 0;
  for (const p of proposals) {
    const plan = planAutoApply(p, regions, birthYear);
    if (!plan) continue;
    try {
      if (plan.kind === 'memory') {
        const now = Date.now();
        await repository.saveMemory({ ...plan.memory, id: newId(), createdAt: now, updatedAt: now, source: sourceFor(plan.key) });
      } else {
        const visit = await repository.recordVisitFromSource(plan.region, plan.visitedOn, sourceFor(plan.key));
        rememberVisitReceipt(plan.key, visit.id, browserDeps());
      }
      saved++;
    } catch {
      /* e.g. already saved from this proposal in another tab: the next sync sends that receipt */
    }
  }
  return saved;
}

let boardTimer: ReturnType<typeof setTimeout> | undefined;
let boardBusy = false;
let boardAgain = false;
/**
 * Sends the board tile list when the rules allow (see boardUpload.ts). A failure here never touches the
 * rest of the Life Hub connection: it is logged and the next change, open or timer tries again.
 */
async function pushBoard(): Promise<void> {
  if (boardBusy) {
    boardAgain = true;
    return;
  }
  boardBusy = true;
  try {
    const deps = browserDeps();
    if (!isConnected(deps) || !boardEnabled(deps)) return;
    const [memories, visits] = await Promise.all([getMemories(), getRegionVisits()]);
    const result = await uploadBoard({ visits, memories }, deps);
    clearTimeout(boardTimer);
    if (result.status === 'wait') boardTimer = setTimeout(() => void pushBoard(), result.waitMs + 1000);
    if (result.status === 'needs_scope') setLifeHubState({ boardNeedsScope: true });
  } catch (e) {
    if (e instanceof LifeHubError && e.kind === 'not_connected') setLifeHubState({ connected: false, reauth: true, proposals: [] });
    else console.error('[보드] 목록을 올리지 못했어요', e);
  } finally {
    boardBusy = false;
    if (boardAgain) {
      boardAgain = false;
      void pushBoard();
    }
  }
}

/**
 * Runs in the background while the app is open: finishes a Life Hub sign-in that just returned,
 * then sends pending receipts/rejections and refreshes proposals on start and on request.
 */
export function LifeHubAgent() {
  const { showToast, refreshArchive, memories, visits } = useApp();
  const run = useCallback(
    async (quiet: boolean) => {
      if (!isConnected(browserDeps()) || getLifeHubState().syncing) return;
      setLifeHubState({ syncing: true, error: '', errorKind: '' });
      try {
        // Read the archive directly so a record saved a moment ago is always included.
        const [memories, visits] = await Promise.all([getMemories(), getRegionVisits()]);
        const before = getLifeHubState().proposals.length;
        let r = await sync(memories, visits, browserDeps());
        let saved = 0;
        const regions = await regionEntries();
        if (regions) {
          await uploadRegionRefs(regionRefs(regions.entries, regions.groupOf), browserDeps()).catch(() => false);
          saved = await applyApproved(r.proposals, regions.entries);
          if (saved) {
            await refreshArchive();
            // Send the receipts right away; what was saved drops out of the proposals.
            const [m2, v2] = await Promise.all([getMemories(), getRegionVisits()]);
            r = await sync(m2, v2, browserDeps());
          }
        }
        setLifeHubState({ proposals: r.proposals, conflicts: r.conflicts, lastSyncedAt: Date.now(), connected: true, reauth: false });
        if (saved)
          showToast(`Claude에서 승인한 기록 ${saved}개를 켜켜이에 저장했어요.` + (r.proposals.length ? ` 확인할 제안 ${r.proposals.length}개는 설정에 있어요.` : ''));
        else if (quiet && r.proposals.length > before) showToast(`Life Hub에서 제안 ${r.proposals.length}개가 왔어요. 설정에서 볼 수 있어요.`);
      } catch (e) {
        // The result is shown in the status line (retry wait in B, 「확인 필요」 in C), not as a toast.
        if (e instanceof LifeHubError && e.kind === 'not_connected') setLifeHubState({ connected: false, reauth: true, proposals: [] });
        setLifeHubState({ error: e instanceof Error ? e.message : String(e), errorKind: e instanceof LifeHubError ? e.kind : 'server' });
      } finally {
        setLifeHubState({ syncing: false });
        void pushBoard();
      }
    },
    [showToast, refreshArchive],
  );

  // Opening the app and any change to the records: send the board list if it changed.
  useEffect(() => {
    void pushBoard();
  }, [memories, visits]);
  useEffect(() => () => clearTimeout(boardTimer), []);

  useEffect(() => {
    const onRequest = (e: Event) => void run((e as CustomEvent<{ quiet?: boolean }>).detail?.quiet ?? true);
    window.addEventListener(SYNC_EVENT, onRequest);
    void (async () => {
      if (isAuthCallback(location.search)) {
        callbackOnce ??= completeConnect(location.search, browserDeps());
        try {
          await callbackOnce;
          setLifeHubState({ connected: true, error: '', errorKind: '', reauth: false, boardNeedsScope: false });
          showToast('Life Hub에 연결했어요.');
        } catch (e) {
          setLifeHubState({ error: e instanceof Error ? e.message : String(e), errorKind: e instanceof LifeHubError ? e.kind : 'server' });
          showToast(e instanceof Error ? e.message : 'Life Hub에 연결하지 못했어요.');
        }
        history.replaceState(null, '', APP_URL + '#/settings');
      }
      await run(true);
    })();
    return () => window.removeEventListener(SYNC_EVENT, onRequest);
  }, [run, showToast]);
  return null;
}

/** Settings group: connect, sync, see proposals, disconnect. */
export function LifeHubSection() {
  const hub = useLifeHub();
  const { showToast } = useApp();
  const [open, setOpen] = useState(false);
  const [confirmOff, setConfirmOff] = useState(false);
  const [autoApply, setAutoApplyState] = useState(() => autoApplyEnabled(browserDeps()));
  const [board, setBoard] = useState(() => boardEnabled(browserDeps()));
  const canConnect = connectAvailable(location);
  const phase = hubPhase(hub);

  async function connect() {
    try {
      location.assign(await beginConnect(browserDeps()));
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Life Hub 연결을 시작하지 못했어요.');
    }
  }

  const disconnectButton = (
    <button type="button" className="btn btn--quiet" onClick={() => setConfirmOff(true)}>
      연결 해제
    </button>
  );

  return (
    <section className="group" aria-labelledby="g-lifehub">
      <h2 className="group__title" id="g-lifehub">
        Life Hub
      </h2>
      {phase === 'B' && hub.proposals.length > 0 && (
        <div className="rows">
          <button type="button" className="row" onClick={() => setOpen(true)}>
            <span className="row__label">
              Claude가 제안한 기록
              <small>검토할 제안 {hub.proposals.length}개</small>
            </span>
            <span className="row__value">{hub.proposals.length}</span>
          </button>
        </div>
      )}
      {phase === 'A' && (
        <div className="lifehub__block">
          <p className="lifehub__lede">Claude가 제안한 기록을 받습니다.</p>
          <button type="button" className="btn" disabled={!canConnect} onClick={() => void connect()}>
            Life Hub 연결
          </button>
          {!canConnect && <p className="group__note">배포된 주소에서만 연결할 수 있어요.</p>}
        </div>
      )}
      {phase === 'B' && (
        <div className="lifehub__block">
          <p className="lifehub__status" role="status">
            <span className="lifehub__dot" aria-hidden="true" />
            {statusLine(hub)}
          </p>
          <div className="lifehub__actions">
            <button type="button" className="btn btn--quiet" disabled={hub.syncing} onClick={() => requestLifeHubSync(false)}>
              지금 동기화
            </button>
            {disconnectButton}
          </div>
          <label className="lifehub__check">
            <input
              type="checkbox"
              checked={autoApply}
              onChange={(e) => {
                setAutoApply(browserDeps(), e.target.checked);
                setAutoApplyState(e.target.checked);
                if (e.target.checked) requestLifeHubSync();
              }}
            />
            <span>
              Claude에서 승인한 기록은 바로 반영
              <small>Claude 대화 카드에서 승인한 추억·방문을 앱을 열 때 저장해요. 시군구가 정해지지 않은 건 여기서 확인해요.</small>
            </span>
          </label>
          <label className="lifehub__check">
            <input
              type="checkbox"
              checked={board}
              onChange={(e) => {
                setBoardEnabled(browserDeps(), e.target.checked);
                setBoard(e.target.checked);
                if (e.target.checked) void pushBoard();
              }}
            />
            <span>
              이 기기에서 보드에 올리기
              <small>방문한 시도 격자만 올려요. 추억 제목·장소·사진은 올리지 않아요. 기기마다 기록이 달라 여러 기기에서 켜면 서로 덮어써요.</small>
            </span>
          </label>
          {board && hub.boardNeedsScope && (
            <div className="lifehub__warn">
              <p>보드에 올리려면 Life Hub에 다시 연결해 주세요. 지금 연결은 그대로 쓸 수 있어요.</p>
              <button type="button" className="btn" disabled={!canConnect} onClick={() => void connect()}>
                다시 연결
              </button>
            </div>
          )}
        </div>
      )}
      {phase === 'C' && (
        <div className="lifehub__block">
          <p className="lifehub__status" role="status">
            <span className="lifehub__dot lifehub__dot--warn" aria-hidden="true" />
            확인 필요
          </p>
          <div className="lifehub__warn">
            <p>Life Hub 연결이 끊겼습니다. 다시 연결해 주세요. 이 기기의 기록은 그대로입니다.</p>
            <button type="button" className="btn" disabled={!canConnect} onClick={() => void connect()}>
              다시 연결
            </button>
          </div>
          <div className="lifehub__actions">{disconnectButton}</div>
        </div>
      )}
      {phase === 'B' && (hub.error || hub.conflicts > 0) && (
        <p className="group__note" role="status">
          {hub.error || `${hub.conflicts}개 제안은 Life Hub와 상태가 달라요. 켜켜이에 저장된 기록은 그대로 유지돼요.`}
        </p>
      )}
      {open && <ProposalsSheet onClose={() => setOpen(false)} />}
      {confirmOff && (
        <ConfirmDialog
          message="Life Hub 연결을 해제할까요?"
          subMessage="이미 저장한 추억과 방문은 그대로 남아요."
          confirmLabel="해제"
          onCancel={() => setConfirmOff(false)}
          onConfirm={() => {
            disconnect(browserDeps());
            setLifeHubState({ connected: false, reauth: false, proposals: [], error: '', errorKind: '', boardNeedsScope: false });
            setConfirmOff(false);
            showToast('Life Hub 연결을 해제했어요.');
          }}
        />
      )}
    </section>
  );
}

type VisitDraft = {
  proposal: Extract<Proposal, { type: 'visit' }>;
  code?: string;
  label?: string;
  date: string;
  /** Region pre-selected from the proposal's region_hint, when it matched exactly one 시군구. */
  guess?: string;
};

function ProposalsSheet({ onClose }: { onClose: () => void }) {
  const hub = useLifeHub();
  const { openAddSheet, refreshArchive, showToast } = useApp();
  const [picking, setPicking] = useState<VisitDraft | null>(null);
  const [visit, setVisit] = useState<VisitDraft | null>(null);
  const [rejecting, setRejecting] = useState<Proposal | null>(null);
  const [busy, setBusy] = useState(false);
  const regionSet = useRegions();

  /** Only an exact, unambiguous 시군구 match is pre-selected; anything else stays a search. */
  function resolve(hint?: string) {
    if (!hint || !regionSet) return null;
    const match = matchRegion(hint, regionSet.regions, PROVINCES);
    return match ? { code: match.code, label: regionLabel(match) } : null;
  }

  function makeMemory(p: Extract<Proposal, { type: 'memory' }>) {
    const pre = memoryPrefill(p.payload);
    const region = resolve(p.payload.region_hint);
    onClose();
    openAddSheet({
      ...pre,
      ...(region ? { regionCode: region.code, regionLabel: region.label } : {}),
      source: sourceFor(p.key),
    });
  }

  async function saveVisit() {
    if (!visit?.code || !visit.label || busy) return;
    if (visit.date && !validDate(visit.date)) {
      showToast('방문 날짜를 확인해 주세요.');
      return;
    }
    setBusy(true);
    try {
      const saved = await repository.recordVisitFromSource(
        { code: visit.code, label: visit.label },
        visit.date || null,
        sourceFor(visit.proposal.key),
      );
      rememberVisitReceipt(visit.proposal.key, saved.id, browserDeps());
      await refreshArchive();
      setLifeHubState({ proposals: getLifeHubState().proposals.filter((p) => p.key !== visit.proposal.key) });
      showToast(saved.source?.originalId === visit.proposal.key ? `${visit.label} 방문을 기록했어요.` : `${visit.label}은 이미 방문한 곳이라 그대로 두었어요.`);
      setVisit(null);
      requestLifeHubSync();
    } catch (e) {
      showToast(e instanceof Error ? e.message : '방문을 기록하지 못했어요.');
    } finally {
      setBusy(false);
    }
  }

  function reject(p: Proposal) {
    rejectLocally(p.key, browserDeps());
    setLifeHubState({ proposals: getLifeHubState().proposals.filter((x) => x.key !== p.key) });
    setRejecting(null);
    showToast('제안을 거절했어요. 기록은 바뀌지 않았어요.');
    requestLifeHubSync();
  }

  return (
    <>
      <Sheet
        label="Life Hub 제안"
        size="tall"
        onClose={onClose}
        title="Life Hub 제안"
        right={
          <button type="button" className="text-btn" onClick={onClose}>
            닫기
          </button>
        }
      >
        <div className="sheet__body lifehub">
          <p className="field__hint">Claude가 대화에서 제안한 기록이에요. 직접 확인하고 저장한 것만 켜켜이에 남아요.</p>
          {hub.proposals.length === 0 && <p className="lifehub__empty">검토할 제안이 없어요.</p>}
          {hub.proposals.map((p) => (
            <article className="lifehub__card" key={p.key} aria-label={p.type === 'memory' ? p.payload.title : p.payload.place_text}>
              <span className="lifehub__type">
                {p.type === 'memory' ? '추억' : '방문'} · {p.source}
                {p.status === 'approved' && ' · Claude에서 승인함'}
              </span>
              {p.type === 'memory' ? (
                <>
                  <strong>{p.payload.title}</strong>
                  {(p.payload.time_text || p.payload.year) && (
                    <span>
                      {p.payload.year
                        ? `${p.payload.year}년${p.payload.month ? ` ${p.payload.month}월` : ''}${p.payload.day ? ` ${p.payload.day}일` : ''}`
                        : p.payload.time_text}
                    </span>
                  )}
                  {(p.payload.place_text || p.payload.region_hint) && (
                    <span>
                      {[p.payload.place_text, p.payload.region_hint && `(${p.payload.region_hint})`].filter(Boolean).join(' ')}
                    </span>
                  )}
                  {(p.payload.song_artist || p.payload.song_title) && (
                    <span>♪ {[p.payload.song_artist, p.payload.song_title].filter(Boolean).join(' — ')}</span>
                  )}
                  {p.payload.memo && <p>{p.payload.memo}</p>}
                  {p.payload.emotions?.length ? <span>{p.payload.emotions.join(' · ')}</span> : null}
                </>
              ) : (
                <>
                  <strong>{p.payload.place_text}</strong>
                  {p.payload.region_hint && <span>{p.payload.region_hint}</span>}
                  <span>{p.payload.visited_on ? `${p.payload.visited_on} 방문` : '방문 날짜 없음'}</span>
                  {p.payload.note && <p>{p.payload.note}</p>}
                </>
              )}
              <div className="lifehub__actions">
                {p.type === 'memory' ? (
                  <button type="button" className="btn" disabled={regionSet === undefined} onClick={() => makeMemory(p)}>
                    추억으로 만들기
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn"
                    disabled={regionSet === undefined}
                    onClick={() =>
                      setPicking({ proposal: p, date: p.payload.visited_on ?? '', guess: resolve(p.payload.region_hint)?.code })
                    }
                  >
                    지역 고르고 기록
                  </button>
                )}
                <button type="button" className="btn btn--quiet" onClick={() => setRejecting(p)}>
                  거절
                </button>
              </div>
            </article>
          ))}
        </div>
      </Sheet>
      {picking && (
        <RegionPicker
          currentCode={picking.guess ?? null}
          initialQuery={picking.guess ? undefined : (picking.proposal.payload.region_hint ?? picking.proposal.payload.place_text)}
          onClose={() => setPicking(null)}
          onSelect={(code, label) => {
            setVisit({ ...picking, code, label });
            setPicking(null);
          }}
        />
      )}
      {visit && (
        <Sheet
          label="방문 기록"
          onClose={() => setVisit(null)}
          left={
            <button type="button" className="text-btn text-btn--muted" onClick={() => setVisit(null)}>
              취소
            </button>
          }
          title="방문 기록"
          right={
            <button type="button" className="text-btn" disabled={busy} onClick={() => void saveVisit()}>
              기록
            </button>
          }
        >
          <div className="sheet__body">
            <div className="field">
              <span className="field__label">지역</span>
              <strong>{visit.label}</strong>
              <span className="field__hint">Claude가 들은 장소: {visit.proposal.payload.place_text}</span>
            </div>
            <div className="field">
              <label className="field__label" htmlFor="lifehub-visit-date">
                방문 날짜 (선택)
              </label>
              <input
                id="lifehub-visit-date"
                className="input"
                type="date"
                value={visit.date}
                onChange={(e) => setVisit({ ...visit, date: e.target.value })}
              />
            </div>
          </div>
        </Sheet>
      )}
      {rejecting && (
        <ConfirmDialog
          message="이 제안을 거절할까요?"
          subMessage="켜켜이의 기록은 바뀌지 않아요."
          confirmLabel="거절"
          destructive
          onCancel={() => setRejecting(null)}
          onConfirm={() => reject(rejecting)}
        />
      )}
    </>
  );
}
