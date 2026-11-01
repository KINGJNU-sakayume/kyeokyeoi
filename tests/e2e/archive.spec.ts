import { Buffer } from 'node:buffer';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
async function seed(page: Page, count = 0) {
  // The SVG is a same-origin page without app code or a service worker registration.
  await page.goto('favicon.svg');
  await page.evaluate(async (count) => {
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open('kkyeokyeoi-db', 2);
      req.onupgradeneeded = () => {
        const db = req.result;
        const m = db.createObjectStore('memories', { keyPath: 'id' });
        m.createIndex('by-region', 'regionCode');
        m.createIndex('by-year', 'computedYear');
        const p = db.createObjectStore('photos', { keyPath: 'id' });
        p.createIndex('by-memory', 'memoryId');
        db.createObjectStore('settings');
      };
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction(['settings', 'memories'], 'readwrite');
        tx.objectStore('settings').put(true, 'onboarding_done');
        for (let i = 0; i < count; i++)
          tx.objectStore('memories').put({
            id: `old-${i}`,
            title: `사진 없는 기억 ${i}`,
            memo: `본문 내용 ${i}`,
            regionCode: i === 0 ? '39010' : null,
            regionLabel: i === 0 ? '제주 제주시' : null,
            timeType: i % 2 ? 'free' : 'year',
            timeValue: i % 2 ? { freeText: '어릴 때 어느 날' } : { year: 2001 },
            computedYear: i % 2 ? null : 2001,
            emotions: [],
            song: null,
            photoIds: [],
            isFirst: i === 2,
            isPublic: false,
            createdAt: i,
            updatedAt: i,
          });
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
      };
    });
  }, count);
  await page.goto('./');
  await expect(page.getByRole('heading', { name: '켜켜이', exact: true })).toBeVisible();
}
async function selectRegion(page: Page, query: string, label: string) {
  await page.getByRole('button', { name: '지역 찾기', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: '장소 고르기' });
  await sheet.getByRole('searchbox').fill(query);
  await sheet.getByRole('button', { name: label, exact: false }).last().click();
  await sheet.getByRole('button', { name: '고르기', exact: true }).click();
}
test('new user can skip birth year and see four navigation tabs', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: /나중에/ }).click();
  for (const name of ['지도', '시간', '기억', '컬렉션'])
    await expect(
      page.getByRole('navigation').getByRole('button', { name, exact: true }),
    ).toBeVisible();
  await expect(page.getByRole('navigation').getByRole('button', { name: '설정' })).toHaveCount(0);
});
test('v2 upgrades, does not infer visits, and searches 120 photo-less memories', async ({
  page,
}) => {
  await seed(page, 120);
  await expect(page.getByText('0곳', { exact: true })).toBeVisible();
  await page.getByRole('navigation').getByRole('button', { name: '기억', exact: true }).click();
  await expect(page.getByText('기억 120개', { exact: true })).toBeVisible();
  await page.getByRole('searchbox', { name: '기억 검색' }).fill('본문 내용 119');
  await expect(page.getByRole('button', { name: /사진 없는 기억 119/ })).toBeVisible();
  await page.getByRole('button', { name: /사진 없는 기억 119/ }).click();
  await expect(
    page.getByRole('heading', { name: '사진 없는 기억 119', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.detail img')).toHaveCount(0);
  await expect(page.getByText('어릴 때 어느 날', { exact: true })).toBeVisible();
});
test('all 251 regions have exact selection paths, including small districts and offshore islands', async ({
  page,
}) => {
  await seed(page);
  await expect(page.locator('.map__region')).toHaveCount(251);
  for (const [query, label] of [
    ['수원시 영통구', '수원시 영통구'],
    ['서울 종로구', '종로구'],
    ['울릉', '울릉군'],
    ['제주시', '제주시'],
  ]) {
    await selectRegion(page, query, label);
    await expect(
      page.getByRole('complementary', { name: '지역 정보' }).getByRole('heading'),
    ).toContainText(label);
    await expect(page.locator('.map__selected')).toHaveCount(1);
  }
});
test('visits-only marking/cancel, bulk registration, and zero-memory persistence', async ({
  page,
}) => {
  await seed(page);
  await selectRegion(page, '제주시', '제주시');
  await page.getByRole('button', { name: '방문 표시', exact: true }).click();
  await expect(page.getByText('1곳', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '방문 표시 해제', exact: true }).click();
  await expect(page.getByText('0곳', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '여러 곳 표시', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: '여러 지역 방문 표시' });
  await sheet.getByRole('searchbox').fill('서울');
  await sheet.getByRole('checkbox').nth(0).check();
  await sheet.getByRole('checkbox').nth(1).check();
  await sheet.getByRole('button', { name: '선택한 곳 방문 표시', exact: true }).click();
  await expect(page.getByText('2곳', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('2곳', { exact: true })).toBeVisible();
});
test('memory details retain historical URL and map zoom/selection on browser back', async ({
  page,
}) => {
  await seed(page, 1);
  await selectRegion(page, '제주시', '제주시');
  await page.getByRole('button', { name: '확대', exact: true }).click();
  const view = await page.locator('.map__svg').getAttribute('viewBox');
  const expand = page.getByRole('button', { name: '기억 펼치기' });
  if (await expand.isVisible()) await expand.click();
  await page.getByRole('button', { name: /사진 없는 기억 0/ }).click();
  await expect(page).toHaveURL(/#\/memory\/old-0$/);
  await page.goBack();
  await expect(page.locator('.map__svg')).toHaveAttribute('viewBox', view!);
  await expect(
    page.getByRole('complementary', { name: '지역 정보' }).getByRole('heading'),
  ).toHaveText('제주 제주시');
  await page.goto('./#/memory/old-0');
  await expect(page.getByRole('heading', { name: '사진 없는 기억 0' })).toBeVisible();
});
test('memory entry needs only title and does not change visits', async ({ page }) => {
  await seed(page);
  await page.getByRole('button', { name: '기억 쓰기', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: '새 추억' });
  await sheet.getByRole('textbox', { name: '제목', exact: true }).fill('제목만 있는 기억');
  await expect(sheet.getByText('사진', { exact: true })).toBeHidden();
  await sheet.getByRole('button', { name: '저장', exact: true }).click();
  await expect(page.getByText('0곳', { exact: true })).toBeVisible();
  await page.getByRole('navigation').getByRole('button', { name: '기억', exact: true }).click();
  await expect(page.getByRole('button', { name: '제목만 있는 기억', exact: true })).toBeVisible();
});
test('manual collections overlap and custom life periods support unknown times', async ({
  page,
}) => {
  await seed(page, 3);
  await page.getByRole('navigation').getByRole('button', { name: '컬렉션' }).click();
  for (const name of ['여름들', '친구들']) {
    await page.getByRole('button', { name: '컬렉션 만들기', exact: true }).click();
    const editor = page.getByRole('dialog', { name: '컬렉션 편집' });
    await editor.getByRole('textbox', { name: '이름', exact: true }).fill(name);
    await editor.getByRole('checkbox').nth(1).check();
    await editor.getByRole('button', { name: '저장', exact: true }).click();
  }
  await page.getByRole('button', { name: /여름들/ }).click();
  await expect(page.getByRole('button', { name: /사진 없는 기억 1/ })).toBeVisible();
  await page.getByRole('navigation').getByRole('button', { name: '시간', exact: true }).click();
  await page.getByRole('button', { name: '시기 만들기', exact: true }).click();
  const editor = page.getByRole('dialog', { name: '인생 시기 편집' });
  await editor.getByRole('textbox', { name: '이름', exact: true }).fill('여름방학');
  await editor.getByRole('checkbox').nth(1).check();
  await editor.getByRole('button', { name: '저장', exact: true }).click();
  await page.locator('summary').filter({ hasText: '여름방학' }).click();
  await expect(page.getByRole('button', { name: /사진 없는 기억 1/ }).first()).toBeVisible();
});
test('app shell, all regional boundaries and local records open offline', async ({
  page,
  context,
}) => {
  await seed(page, 1);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect(page.locator('.map__region')).toHaveCount(251);
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('.map__region')).toHaveCount(251);
  await page.goto('./#/memory/old-0');
  await expect(page.getByRole('heading', { name: '사진 없는 기억 0' })).toBeVisible();
});
test('layout stays within viewport and overview dots follow real regions', async ({
  page,
}, testInfo) => {
  await seed(page);
  await expect(page.locator('.map__dots path')).toHaveCount(251);
  const size = await page.evaluate(() => ({
    viewport: innerWidth,
    page: document.documentElement.scrollWidth,
  }));
  expect(size.page).toBeLessThanOrEqual(size.viewport);
  const mapBox = await page.locator('.map').boundingBox();
  expect(mapBox!.height).toBeGreaterThan(350);
  if (testInfo.project.name === 'desktop') expect(mapBox!.width).toBeGreaterThan(700);
});
test('blocked legacy tabs show recovery guidance; current tabs close on upgrade', async ({
  page,
  context,
}) => {
  const old = await context.newPage();
  await old.goto('favicon.svg');
  await old.evaluate(async () => {
    await new Promise<void>((resolve) => {
      const req = indexedDB.open('kkyeokyeoi-db', 2);
      req.onupgradeneeded = () => {
        const db = req.result;
        const m = db.createObjectStore('memories', { keyPath: 'id' });
        m.createIndex('by-region', 'regionCode');
        m.createIndex('by-year', 'computedYear');
        const p = db.createObjectStore('photos', { keyPath: 'id' });
        p.createIndex('by-memory', 'memoryId');
        db.createObjectStore('settings');
      };
      req.onsuccess = () => {
        (window as Window & { legacy?: IDBDatabase }).legacy = req.result;
        const tx = req.result.transaction('settings', 'readwrite');
        tx.objectStore('settings').put(true, 'onboarding_done');
        tx.oncomplete = () => resolve();
      };
    });
  });
  await page.goto('./');
  await expect(page.getByText(/다른 탭이 저장소를 사용 중/)).toBeVisible();
  await old.evaluate(() => (window as Window & { legacy?: IDBDatabase }).legacy!.close());
  await expect(page.getByRole('heading', { name: '켜켜이' })).toBeVisible();
  const versionError = await old.evaluate(
    async () =>
      new Promise<string>((resolve) => {
        const req = indexedDB.open('kkyeokyeoi-db', 2);
        req.onerror = () => resolve(req.error!.name);
      }),
  );
  expect(versionError).toBe('VersionError');
  await page.evaluate(
    async () =>
      new Promise<void>((resolve) => {
        const req = indexedDB.open('kkyeokyeoi-db', 4);
        req.onsuccess = () => {
          req.result.close();
          resolve();
        };
      }),
  );
  await expect(page.getByText(/다른 탭에서 저장소를 갱신/)).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: '켜켜이' })).toBeVisible();
  await old.close();
});
test('backup UI reports repeated v2 imports, missing photo references and conflicts', async ({
  page,
}) => {
  await seed(page, 1);
  const memories = await page.evaluate(
    async () =>
      new Promise<Record<string, unknown>[]>((resolve) => {
        const req = indexedDB.open('kkyeokyeoi-db');
        req.onsuccess = () => {
          const db = req.result;
          const get = db.transaction('memories').objectStore('memories').getAll();
          get.onsuccess = () => {
            db.close();
            resolve(get.result);
          };
        };
      }),
  );
  const backup = {
    app: 'kyeokyeoi',
    version: 2,
    settings: { birth_year: 2000 },
    memories: [{ ...memories[0], id: 'incoming', photoIds: ['missing'], title: '들여온 기억' }],
    photos: {},
  };
  await page.getByRole('button', { name: '설정 열기' }).click();
  for (let i = 0; i < 2; i++) {
    await page.locator('input[type=file]').setInputFiles({
      name: 'legacy-backup.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(backup)),
    });
    await expect(page.locator('.backup-report')).toContainText(
      i ? '기존 1개 유지' : '누락 사진 1개',
    );
  }
  backup.memories[0].title = '충돌하는 수정';
  await page.locator('input[type=file]').setInputFiles({
    name: 'conflict.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(backup)),
  });
  await expect(page.locator('.backup-report')).toContainText('충돌 1개');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: /백업 파일 내려받기/ }).click();
  await download;
  await expect(page.locator('.backup-report')).toContainText('임시 저장소 복원 검증 완료');
  await page.getByRole('navigation').getByRole('button', { name: '기억', exact: true }).click();
  await expect(page.getByRole('button', { name: /들여온 기억/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /충돌하는 수정/ })).toHaveCount(0);
});
test('pan and mobile pinch change map position without accidental selection', async ({
  page,
}, testInfo) => {
  await seed(page);
  await page.getByRole('button', { name: '확대', exact: true }).click();
  const svg = page.locator('.map__svg');
  const before = await svg.getAttribute('viewBox');
  const box = (await svg.boundingBox())!;
  const x = box.x + box.width / 2,
    y = box.y + box.height / 2;
  if (testInfo.project.name === 'mobile') {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [
        { x: x - 30, y, id: 0 },
        { x: x + 30, y, id: 1 },
      ],
    });
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        { x: x - 70, y, id: 0 },
        { x: x + 70, y, id: 1 },
      ],
    });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else {
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 60, y + 40, { steps: 6 });
    await page.mouse.up();
  }
  await expect(svg).not.toHaveAttribute('viewBox', before!);
  await expect(page.getByRole('complementary', { name: '지역 정보' })).toHaveCount(0);
});
test('deleting a memory keeps confirmed visits and returns to the selected region', async ({
  page,
}) => {
  await seed(page, 1);
  await selectRegion(page, '제주시', '제주시');
  await page.getByRole('button', { name: '방문 표시', exact: true }).click();
  const expand = page.getByRole('button', { name: '기억 펼치기' });
  if (await expand.isVisible()) await expand.click();
  await page.getByRole('button', { name: /사진 없는 기억 0/ }).click();
  await page.getByRole('button', { name: '지우기', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: '지우기', exact: true }).click();
  await expect(page.getByText('1곳', { exact: true })).toBeVisible();
  await expect(page.getByText(/방문 확인됨 · 연결된 기억 0개/)).toBeVisible();
});
test('version-independent recovery page exports a backup verified by the app', async ({ page }) => {
  await seed(page, 1);
  await page.goto('recovery.html');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '원본 백업 내려받기' }).click();
  const download = await downloadPromise;
  const path = (await download.path())!;
  await expect(page.getByRole('status')).toContainText('DB v3 원본 백업');
  await page.goto('./#/settings');
  await page.getByRole('button', { name: /백업 파일 복원 시험/ }).click({ noWaitAfter: true });
  // The file chooser is intentionally replaced with a fixture input in browser automation.
  await page.locator('input[type=file]').setInputFiles(path);
  await expect(page.locator('.backup-report')).toContainText('임시 저장소 복원 검증 완료');
});
