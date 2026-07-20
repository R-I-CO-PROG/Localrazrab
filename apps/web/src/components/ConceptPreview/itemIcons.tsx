import type { ReactNode } from "react";
import type { ConceptPreviewItem } from "./conceptPreview.types";

export type ItemIconProps = {
  type: ConceptPreviewItem;
  size?: number;
  stroke?: string;
  fill?: string;
  accent?: string;
  hero?: boolean;
  className?: string;
};

function IconShell({
  children,
  size = 40,
  stroke = "currentColor",
  fill = "none",
  hero,
  className,
}: {
  children: ReactNode;
  size?: number;
  stroke?: string;
  fill?: string;
  hero?: boolean;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 48 48"
      width={size}
      height={size}
      fill={fill}
      stroke={stroke}
      strokeWidth={hero ? 1.6 : 1.35}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {children}
    </svg>
  );
}

const SHAPES: Record<ConceptPreviewItem, ReactNode> = {
  gift_box: (
    <>
      <rect x="10" y="18" width="28" height="22" rx="2" />
      <path d="M10 24h28M24 18v22" />
      <path d="M24 18c-4-6-12-4-8 0s8 0 8 0-4-6 8 0" />
    </>
  ),
  nfc_card: (
    <>
      <rect x="12" y="14" width="24" height="20" rx="3" />
      <path d="M16 22h8M16 26h12" />
      <circle cx="32" cy="26" r="2.5" fill="currentColor" stroke="none" opacity="0.5" />
    </>
  ),
  metal_keychain: (
    <>
      <circle cx="24" cy="16" r="5" />
      <path d="M24 21v4" />
      <rect x="17" y="25" width="14" height="12" rx="2" />
      <path d="M20 29h8" />
    </>
  ),
  powerbank: (
    <>
      <rect x="14" y="12" width="20" height="28" rx="4" />
      <rect x="20" y="8" width="8" height="4" rx="1" />
      <path d="M22 22h4v8h-4z" fill="currentColor" stroke="none" opacity="0.35" />
    </>
  ),
  notebook: (
    <>
      <rect x="13" y="10" width="22" height="30" rx="2" />
      <path d="M18 10v30" />
      <path d="M22 18h10M22 24h10M22 30h7" />
    </>
  ),
  instruction_card: (
    <>
      <rect x="11" y="12" width="26" height="24" rx="2" />
      <path d="M15 18h18M15 24h14M15 30h10" />
    </>
  ),
  bottle: (
    <>
      <path d="M20 10h8v6c0 2 4 4 4 10v14H16V26c0-6 4-8 4-10v-6z" />
      <path d="M19 10h10" />
    </>
  ),
  thermos: (
    <>
      <rect x="17" y="12" width="14" height="28" rx="5" />
      <path d="M15 16h18M17 8h14v4H17z" />
      <path d="M21 22h6" />
    </>
  ),
  tote_bag: (
    <>
      <path d="M14 18h20l-2 24H16L14 18z" />
      <path d="M18 18c0-6 4-8 6-8s6 2 6 8" />
    </>
  ),
  backpack: (
    <>
      <path d="M14 20c0-4 4-8 10-8s10 4 10 8v18H14V20z" />
      <path d="M18 20v-4c0-3 3-5 6-5s6 2 6 5v4" />
      <rect x="20" y="26" width="8" height="6" rx="1" />
    </>
  ),
  sticker_pack: (
    <>
      <rect x="12" y="14" width="18" height="22" rx="2" transform="rotate(-6 21 25)" />
      <rect x="18" y="12" width="18" height="22" rx="2" />
      <circle cx="27" cy="22" r="4" />
    </>
  ),
  badge: (
    <>
      <circle cx="24" cy="24" r="12" />
      <circle cx="24" cy="24" r="6" />
      <path d="M24 36v6M18 40h12" />
    </>
  ),
  envelope: (
    <>
      <rect x="10" y="16" width="28" height="20" rx="2" />
      <path d="M10 18l14 10 14-10" />
    </>
  ),
  tube: (
    <>
      <rect x="14" y="14" width="20" height="26" rx="10" />
      <path d="M14 22h20M14 32h20" />
    </>
  ),
  pen: (
    <>
      <path d="M30 12L36 18 18 36 10 38l2-8L30 12z" />
      <path d="M28 14l6 6" />
    </>
  ),
  stylus: (
    <>
      <path d="M32 10l6 6-18 18-8 2 2-8 18-18z" />
      <circle cx="12" cy="36" r="2" fill="currentColor" stroke="none" />
    </>
  ),
  headphones: (
    <>
      <path d="M14 28v-6a10 10 0 0 1 20 0v6" />
      <rect x="10" y="26" width="6" height="12" rx="3" />
      <rect x="32" y="26" width="6" height="12" rx="3" />
    </>
  ),
  cable: (
    <>
      <path d="M12 24c0-8 8-12 12-8s12 4 12 8" />
      <rect x="8" y="22" width="6" height="8" rx="2" />
      <rect x="34" y="22" width="6" height="8" rx="2" />
    </>
  ),
  usb_drive: (
    <>
      <rect x="16" y="18" width="16" height="14" rx="2" />
      <path d="M24 18V10M21 10h6" />
      <circle cx="24" cy="25" r="3" />
    </>
  ),
  trophy: (
    <>
      <path d="M16 14h16v8c0 6-4 10-8 10s-8-4-8-10v-8z" />
      <path d="M12 16H8v2c0 3 2 5 4 5M36 16h4v2c0 3-2 5-4 5" />
      <path d="M20 32h8v4H20zM18 36h12" />
    </>
  ),
  certificate: (
    <>
      <rect x="10" y="12" width="28" height="24" rx="2" />
      <circle cx="32" cy="30" r="5" />
      <path d="M15 18h16M15 24h12" />
    </>
  ),
  pouch: (
    <>
      <path d="M14 18c0-4 4-6 10-6s10 2 10 6v20H14V18z" />
      <path d="M14 22h20" />
      <path d="M22 12c0-2 2-4 4-4s4 2 4 4" />
    </>
  ),
};

export function ConceptItemIcon({
  type,
  size = 40,
  stroke = "currentColor",
  fill = "rgba(255,255,255,0.04)",
  hero,
  className,
}: ItemIconProps) {
  return (
    <IconShell size={size} stroke={stroke} fill={fill} hero={hero} className={className}>
      {SHAPES[type]}
    </IconShell>
  );
}
