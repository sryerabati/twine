import { vi } from "vitest";

export const push = vi.fn();
export const replace = vi.fn();
export const refresh = vi.fn();
let pathname = "/";

export function setPathname(nextPathname: string) {
  pathname = nextPathname;
}

export function usePathname() {
  return pathname;
}

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
