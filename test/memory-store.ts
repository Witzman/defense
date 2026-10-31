import type { SaveData, Store } from "../server/store.ts";

/** In-memory Store for HTTP tests; the real one is covered in store.test.ts. */
export function memoryStore(): Store & { up: boolean } {
  const slots = new Map<string, SaveData>();
  return {
    up: true,
    async migrate() {},
    async load(slot) {
      return slots.get(slot) ?? null;
    },
    async save(slot, data) {
      slots.set(slot, structuredClone(data));
    },
    async healthy() {
      return this.up;
    },
  };
}
