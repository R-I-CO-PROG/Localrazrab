"use client";

import { useEffect, useState } from "react";
import { Ban, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useProjectStore } from "@/store/project-store";
import { fetchBlacklist, removeFromBlacklist } from "@/lib/blacklist-client";
import { notify } from "@/lib/notify";

export function BlacklistPanel() {
  const items = useProjectStore((s) => s.blacklistItems);
  const setBlacklistItems = useProjectStore((s) => s.setBlacklistItems);
  const removeBlacklistItemLocal = useProjectStore((s) => s.removeBlacklistItemLocal);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void fetchBlacklist()
      .then(setBlacklistItems)
      .finally(() => setLoading(false));
  }, [setBlacklistItems]);

  const handleRemove = async (id: string, title: string) => {
    const ok = await removeFromBlacklist(id);
    if (!ok) {
      notify.error("Не удалось удалить из Black List");
      return;
    }
    removeBlacklistItemLocal(id);
    notify.success(`«${title}» убран из Black List`);
  };

  return (
    <Card className="border-border/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Ban className="h-5 w-5 text-primary" />
          Black List
        </CardTitle>
        <CardDescription>
          Заблокированные товары и поставщики не участвуют в подборе, КП и презентациях
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-16 animate-pulse rounded-xl bg-secondary/50" />
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Список пуст. Добавьте товар или поставщика из состава набора или каталога.
          </p>
        ) : (
          <ul className="space-y-2">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-border bg-secondary/20 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{item.title}</p>
                  <Badge variant="outline" className="mt-1 text-[10px]">
                    {item.itemType === "product" ? "Товар" : "Поставщик"}
                  </Badge>
                </div>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="shrink-0 text-destructive hover:text-destructive"
                  onClick={() => void handleRemove(item.id, item.title)}
                  title="Удалить из Black List"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export async function addProductToBlacklist(product: {
  id?: string;
  name: string;
  sourceId?: string | null;
}) {
  const { addToBlacklist } = await import("@/lib/blacklist-client");
  const itemId = product.id ?? product.name;
  const item = await addToBlacklist({
    itemType: "product",
    itemId,
    title: product.name,
  });

  if (item) {
    useProjectStore.getState().addBlacklistItemLocal(item);
    notify.success(`«${product.name}» добавлен в Black List`);
    return item;
  }

  const localItem = {
    id: `local-bl-${Date.now()}`,
    itemType: "product" as const,
    itemId,
    title: product.name,
    createdAt: new Date().toISOString(),
  };
  useProjectStore.getState().addBlacklistItemLocal(localItem);
  notify.success(`«${product.name}» добавлен в Black List (локально)`);
  return localItem;
}
