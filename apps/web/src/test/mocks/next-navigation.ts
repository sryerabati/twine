import { vi } from "vitest";

export const push = vi.fn();
export const replace = vi.fn();
export const refresh = vi.fn();

export function useRouter() {
  return {
    push,
    replace,
    refresh,
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
  };
}
