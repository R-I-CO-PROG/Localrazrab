"use client";

import { notify } from "@/lib/notify";

type PasteHandler = (file: File) => void;

let activeZoneId: string | null = null;
let activeHandler: PasteHandler | null = null;
let pasteLockUntil = 0;
let listenerAttached = false;

function isTextInputTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "TEXTAREA" || tag === "INPUT" || target.isContentEditable;
}

function extractImageFile(event: ClipboardEvent): File | null {
  const items = event.clipboardData?.items;
  if (!items?.length) return null;

  for (const item of items) {
    if (!item.type.startsWith("image/")) continue;
    const blob = item.getAsFile();
    if (!blob) continue;
    return blob;
  }
  return null;
}

function handleGlobalPaste(event: ClipboardEvent) {
  const now = Date.now();
  if (now < pasteLockUntil) {
    event.preventDefault();
    return;
  }

  if (isTextInputTarget(event.target)) {
    const inZone = (event.target as HTMLElement).closest("[data-paste-zone]");
    if (!inZone) return;
  }

  const blob = extractImageFile(event);
  if (!blob) return;

  if (!activeHandler) {
    notify.info("Сначала кликните на область загрузки лого или брендбука, затем вставьте изображение");
    return;
  }

  event.preventDefault();
  event.stopImmediatePropagation();
  pasteLockUntil = now + 500;
  activeHandler(blob);
}

function ensureGlobalListener() {
  if (listenerAttached || typeof window === "undefined") return;
  window.addEventListener("paste", handleGlobalPaste, true);
  listenerAttached = true;
}

export function registerPasteZone(zoneId: string, handler: PasteHandler) {
  ensureGlobalListener();
  activeZoneId = zoneId;
  activeHandler = handler;
}

export function unregisterPasteZone(zoneId: string) {
  if (activeZoneId === zoneId) {
    activeZoneId = null;
    activeHandler = null;
  }
}

export function getActivePasteZoneId() {
  return activeZoneId;
}
