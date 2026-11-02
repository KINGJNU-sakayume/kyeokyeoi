import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const HUB = 'https://life-hub-api.213303.workers.dev';
const MEMORY_KEY = 'claude:mcp-' + 'a'.repeat(40);
const VISIT_KEY = 'claude:mcp-' + 'b'.repeat(40);
const candidate = (key: string, candidate_type: string, payload: Record<string, unknown>) => ({
  key, status: 'pending',
  candidate: { schema_version: 1, source: 'claude', source_ref: 'claude-mcp:2026-11-02', idempotency_key: key.slice(7),
    created_at: '2026-11-02T01:00:00.000Z', candidate_type, payload },
});

async function onboarded(page: Page) {
  await page.goto('favicon.svg');
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open('kkyeokyeoi-db', 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        const m = db.createObjectStore('memories', { keyPath: 'id' });
        m.createIndex('by-region', 'regionCode');
        m.createIndex('by-year', 'computedYear');
        db.createObjectStore('settings');
      };
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction('settings', 'readwrite');
        tx.objectStore('settings').put(true, 'onboarding_done');
        tx.oncomplete = () => { db.close(); resolve(); };
      };
    });
  });
}

test('not connected: Life Hub connect is shown but only enabled on the deployed address', async ({ page }) => {
  await onboarded(page);
  await page.goto('./#/settings');
  const connect = page.getByRole('button', { name: /Life Hub 연결/ });
  await expect(connect).toBeVisible();
  await expect(connect).toBeDisabled();
  await expect(page.getByText('배포된 켜켜이 주소에서만 연결할 수 있어요')).toBeVisible();
});

test('connected: proposals become a memory and a visit only after review, and receipts are sent', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const posts: Array<{ path: string; body: Record<string, string> }> = [];
  const pending = new Set([MEMORY_KEY, VISIT_KEY]);
  const all = [
    candidate(MEMORY_KEY, 'memory', { title: '가상의 콘서트', memo: '떼창이 좋았다', time_text: '10월 8일', year: 2026, month: 10, day: 8,
      place_text: '가상 종합운동장', region_hint: '경기 고양시 일산서구', song_artist: 'Synthetic Artist', emotions: ['설렘'] }),
    candidate(VISIT_KEY, 'visit', { place_text: '강릉', visited_on: '2026-10-12' }),
  ];
  await page.route(HUB + '/**', async (route) => {
    const req = route.request();
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Content-Type': 'application/json' };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const url = new URL(req.url());
    if (url.pathname === '/kyeokyeoi/v1/candidates')
      return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ candidates: all.filter((c) => pending.has(c.key)) }) });
    const body = JSON.parse(req.postData() || '{}') as Record<string, string>;
    posts.push({ path: url.pathname, body });
    pending.delete(body.key);
    return route.fulfill({ status: 200, headers: cors, body: '{}' });
  });
  await page.addInitScript(() => {
    localStorage.setItem('kyeokyeoi.lifehub.tokens.v1', JSON.stringify({
      access_token: 'at-synthetic', refresh_token: 'rt-synthetic', access_expires_at: Date.now() + 3_600_000,
    }));
  });
  await onboarded(page);
  await page.goto('./#/settings');

  const proposalsRow = page.getByRole('button', { name: /Claude가 제안한 기록/ });
  await expect(proposalsRow).toContainText('검토할 제안 2개');
  await proposalsRow.click();
  const sheet = page.getByRole('dialog', { name: 'Life Hub 제안' });
  await expect(sheet.getByText('가상의 콘서트')).toBeVisible();
  await expect(sheet.getByText('♪ Synthetic Artist')).toBeVisible();

  // Memory: opens the normal sheet, prefilled; nothing is stored until 저장.
  await sheet.getByRole('button', { name: '추억으로 만들기' }).click();
  const add = page.getByRole('dialog', { name: '새 추억' });
  await expect(add).toBeVisible();
  await expect(add.getByRole('textbox').first()).toHaveValue('가상의 콘서트');
  // Claude's resolution is pre-filled and visible for review: region, full date, artist.
  await expect(add.getByText('경기 고양시 일산서구')).toBeVisible();
  await expect(add.getByLabel('연도')).toHaveValue('2026');
  await expect(add.getByLabel('월')).toHaveValue('10');
  await expect(add.getByLabel('일')).toHaveValue('8');
  await expect(add.getByLabel('가수')).toHaveValue('Synthetic Artist');
  await add.getByRole('button', { name: '저장', exact: true }).click();
  await expect.poll(() => posts.filter((p) => p.path.endsWith('/receipts')).length).toBe(1);
  expect(posts[0].body.key).toBe(MEMORY_KEY);
  expect(posts[0].body.entity_type).toBe('memory');

  // A memory with a place did not mark any region visited.
  await page.goto('./#/map');
  await expect(page.getByText('0곳', { exact: true })).toBeVisible();

  // Visit: choose the region (search prefilled with the user's words), confirm the date, record.
  await page.goto('./#/settings');
  await page.getByRole('button', { name: /Claude가 제안한 기록/ }).click();
  const sheet2 = page.getByRole('dialog', { name: 'Life Hub 제안' });
  await sheet2.getByRole('button', { name: '지역 고르고 기록' }).click();
  const picker = page.getByRole('dialog', { name: '장소 고르기' });
  await expect(picker.getByRole('searchbox')).toHaveValue('강릉');
  await picker.getByRole('button', { name: /강릉시/ }).last().click();
  await picker.getByRole('button', { name: '고르기', exact: true }).click();
  const visit = page.getByRole('dialog', { name: '방문 기록' });
  await expect(visit.getByLabel('방문 날짜 (선택)')).toHaveValue('2026-10-12');
  await visit.getByRole('button', { name: '기록', exact: true }).click();
  await expect.poll(() => posts.filter((p) => p.path.endsWith('/receipts')).length).toBe(2);
  const visitReceipt = posts.filter((p) => p.path.endsWith('/receipts'))[1].body;
  expect(visitReceipt.key).toBe(VISIT_KEY);
  expect(visitReceipt.entity_type).toBe('visit');

  await page.goto('./#/map');
  await expect(page.getByText('1곳', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
