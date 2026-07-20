export const CREDITS_UPDATED_EVENT = "mercai:credits-updated";

export function notifyCreditsUpdated(creditsRemaining: number) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(CREDITS_UPDATED_EVENT, { detail: { creditsRemaining } })
  );
}
