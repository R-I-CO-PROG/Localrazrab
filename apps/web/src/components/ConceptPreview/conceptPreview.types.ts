export type ConceptPreviewItem =
  | "gift_box"
  | "nfc_card"
  | "metal_keychain"
  | "powerbank"
  | "notebook"
  | "instruction_card"
  | "bottle"
  | "thermos"
  | "tote_bag"
  | "backpack"
  | "sticker_pack"
  | "badge"
  | "envelope"
  | "tube"
  | "pen"
  | "stylus"
  | "headphones"
  | "cable"
  | "usb_drive"
  | "trophy"
  | "certificate"
  | "pouch";

export type ConceptPreviewLayout =
  | "premium_grid"
  | "minimal_flatlay"
  | "mysterious_scan"
  | "tech_blueprint"
  | "eco_craft";

export type ConceptPreviewProps = {
  title?: string;
  tags?: string[];
  palette?: string[];
  items?: ConceptPreviewItem[];
  heroItem?: ConceptPreviewItem;
  layout?: ConceptPreviewLayout;
  selected?: boolean;
  size?: "sm" | "md";
  className?: string;
  /** Subtle “Схема концепции” chip */
  showLabel?: boolean;
  /** Palette strip under composition */
  showPalette?: boolean;
};

export type ItemPlacement = {
  x: number;
  y: number;
  scale: number;
  rotation?: number;
};
