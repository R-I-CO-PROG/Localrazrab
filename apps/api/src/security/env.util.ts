export function isProductionEnv(): boolean {
  return process.env.NODE_ENV === 'production';
}

export function resolveDebugFlag(requested?: boolean): boolean {
  if (isProductionEnv()) return false;
  return requested ?? false;
}

export function requireProductionSecret(name: string, value: string | undefined): void {
  if (!isProductionEnv()) return;
  if (!value?.trim()) {
    throw new Error(`${name} must be set in production`);
  }
}
