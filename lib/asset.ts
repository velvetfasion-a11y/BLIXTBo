export function asset(path: string) {
  const map = (globalThis as { __ASSETS?: Record<string, string> }).__ASSETS;
  return map?.[path] ?? path;
}
