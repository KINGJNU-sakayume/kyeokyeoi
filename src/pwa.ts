/// <reference types="vite-plugin-pwa/client" />
import { registerSW } from 'virtual:pwa-register';
let available = false;
const listeners = new Set<(ready: boolean) => void>();
export const applyPwaUpdate = registerSW({
  onNeedRefresh() {
    available = true;
    listeners.forEach((fn) => fn(true));
  },
});
export function subscribePwa(fn: (ready: boolean) => void) {
  listeners.add(fn);
  fn(available);
  return () => {
    listeners.delete(fn);
  };
}
