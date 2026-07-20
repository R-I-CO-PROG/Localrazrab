"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MultiSelect } from "@/components/forms/multi-select";
import { PROJECT_CATEGORIES, ALLOWED_CATEGORIES } from "@/lib/types";
import { useProjectStore } from "@/store/project-store";
import { notify } from "@/lib/notify";

export function CreateTemplateForm() {
  const addCustomTemplate = useProjectStore((s) => s.addCustomTemplate);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [categoryPreset, setCategoryPreset] = useState("WELCOME_PACK");
  const [budget, setBudget] = useState("");
  const [quantity, setQuantity] = useState("");
  const [allowedItems, setAllowedItems] = useState<string[]>([]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !description.trim()) return;

    const budgetNum = budget.trim() ? Number(budget) : NaN;
    const quantityNum = quantity.trim() ? Number(quantity) : NaN;

    if (!Number.isFinite(budgetNum) || budgetNum < 100) {
      notify.error("Укажите бюджет на набор — от 100 ₽");
      return;
    }
    if (!Number.isFinite(quantityNum) || quantityNum < 1) {
      notify.error("Укажите тираж — от 1 шт.");
      return;
    }

    addCustomTemplate({
      name: name.trim(),
      description: description.trim(),
      categoryPreset,
      budget: Math.round(budgetNum),
      quantity: Math.round(quantityNum),
      allowedItems,
    });

    setName("");
    setDescription("");
    setCategoryPreset("WELCOME_PACK");
    setBudget("");
    setQuantity("");
    setAllowedItems([]);
    setOpen(false);
  };

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} className="gap-2">
        <Plus className="h-4 w-4" />
        Создать шаблон
      </Button>
    );
  }

  return (
    <Card className="border-primary/20">
      <CardHeader>
        <CardTitle className="text-lg">Новый шаблон задачи</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="tpl-name">Название</Label>
            <Input
              id="tpl-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Например: Welcome Pack для стартапа"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tpl-desc">Описание</Label>
            <Textarea
              id="tpl-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Опишите задачу для шаблона..."
              required
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label>Категория</Label>
              <Select value={categoryPreset} onValueChange={setCategoryPreset}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROJECT_CATEGORIES.map((cat) => (
                    <SelectItem key={cat.value} value={cat.value}>
                      {cat.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="tpl-budget">Бюджет / набор, ₽</Label>
              <Input
                id="tpl-budget"
                type="text"
                inputMode="numeric"
                value={budget}
                onChange={(e) => setBudget(e.target.value.replace(/[^\d]/g, ""))}
                placeholder="Например, 3000"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tpl-qty">Тираж</Label>
              <Input
                id="tpl-qty"
                type="text"
                inputMode="numeric"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value.replace(/[^\d]/g, ""))}
                placeholder="Например, 100"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Категории товаров</Label>
            <MultiSelect
              options={ALLOWED_CATEGORIES}
              selected={allowedItems}
              onToggle={(item) =>
                setAllowedItems((prev) =>
                  prev.includes(item) ? prev.filter((i) => i !== item) : [...prev, item]
                )
              }
            />
          </div>
          <div className="flex gap-3">
            <Button type="submit">Сохранить шаблон</Button>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Отмена
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
