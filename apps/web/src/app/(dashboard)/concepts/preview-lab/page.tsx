"use client";

import { ConceptPreview } from "@/components/ConceptPreview/ConceptPreview";
import type { ConceptPreviewProps } from "@/components/ConceptPreview/conceptPreview.types";

const EXAMPLES: Array<{ name: string; props: ConceptPreviewProps }> = [
  {
    name: "Ключ к будущему",
    props: {
      title: "Ключ к будущему",
      tags: ["premium", "minimalist", "mysterious"],
      items: ["nfc_card", "metal_keychain", "powerbank", "instruction_card", "gift_box"],
      heroItem: "nfc_card",
      palette: ["#111111", "#E8E2D0", "#A7FF3C", "#7B4DFF"],
      layout: "mysterious_scan",
    },
  },
  {
    name: "Оператор орбитальной станции",
    props: {
      title: "Оператор орбитальной станции",
      tags: ["tech", "futuristic", "utility"],
      items: ["badge", "thermos", "notebook", "cable", "pouch"],
      heroItem: "badge",
      palette: ["#0ea5e9", "#1e293b", "#94a3b8", "#22d3ee"],
      layout: "tech_blueprint",
    },
  },
  {
    name: "Eco Welcome Kit",
    props: {
      title: "Eco Welcome Kit",
      tags: ["eco", "calm", "natural"],
      items: ["tote_bag", "bottle", "notebook", "envelope", "sticker_pack"],
      heroItem: "tote_bag",
      palette: ["#365314", "#a3e635", "#ecfccb", "#78716c"],
      layout: "eco_craft",
    },
  },
  {
    name: "Premium Access Set",
    props: {
      title: "Premium Access Set",
      tags: ["premium", "executive", "minimal"],
      items: ["gift_box", "nfc_card", "metal_keychain", "certificate", "pouch"],
      heroItem: "gift_box",
      palette: ["#18181b", "#d4d4d8", "#a78bfa", "#fbbf24"],
      layout: "premium_grid",
    },
  },
];

/** Dev gallery for ConceptPreview (creative mode schematics) */
export default function ConceptPreviewLabPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-8 p-6">
      <div>
        <h1 className="text-2xl font-bold">Concept Preview Lab</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Детерминированные схемы набора — без AI. Только для разработки.
        </p>
      </div>
      <div className="grid gap-6 sm:grid-cols-2">
        {EXAMPLES.map((ex) => (
          <div key={ex.name} className="space-y-2">
            <p className="text-sm font-medium">{ex.name}</p>
            <div className="aspect-[4/3] overflow-hidden rounded-xl border border-border/50">
              <ConceptPreview {...ex.props} size="md" />
            </div>
          </div>
        ))}
      </div>
      <div className="grid max-w-xs gap-4">
        <p className="text-sm font-medium">Размер sm (карточка в сетке)</p>
        <div className="aspect-square overflow-hidden rounded-xl border border-border/50">
          <ConceptPreview {...EXAMPLES[0].props} size="sm" showPalette={false} />
        </div>
      </div>
    </div>
  );
}
