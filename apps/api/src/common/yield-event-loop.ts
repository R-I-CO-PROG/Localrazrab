/** Отдаёт управление event loop — HTTP/health остаются отзывчивыми при тяжёлых циклах. */
export function yieldEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}
