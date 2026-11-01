import { cp, readdir, rm } from 'node:fs/promises';
// docs/ also contains source documentation. A build must never delete it.
for (const name of await readdir('docs')) if (!name.endsWith('.md')) await rm(`docs/${name}`, { recursive: true, force: true });
await cp('dist', 'docs', { recursive: true });
