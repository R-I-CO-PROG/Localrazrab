"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";

interface NumberFieldProps {
  value: number;
  onCommit: (value: number) => void;
  min?: number;
  max?: number;
  /** Значение при пустом поле на blur (по умолчанию min или 0) */
  fallback?: number;
  id?: string;
  className?: string;
  placeholder?: string;
}

/**
 * Числовое поле с мягкой валидацией: можно полностью стереть значение
 * (временно пустая строка), ввести новое число с нуля. Приведение к числу
 * и клэмп min/max происходит на blur / Enter, а не на каждом нажатии.
 */
export function NumberField({
  value,
  onCommit,
  min,
  max,
  fallback,
  id,
  className,
  placeholder,
}: NumberFieldProps) {
  const [text, setText] = useState<string>(value != null ? String(value) : "");

  // Синхронизируемся, когда значение меняется извне (например, авто-парсинг брифа)
  useEffect(() => {
    setText(value != null ? String(value) : "");
  }, [value]);

  const commit = () => {
    const raw = text.trim();
    if (raw === "") {
      const fb = fallback ?? min ?? 0;
      onCommit(fb);
      setText(String(fb));
      return;
    }
    let n = parseInt(raw, 10);
    if (Number.isNaN(n)) n = fallback ?? min ?? 0;
    if (min != null) n = Math.max(min, n);
    if (max != null) n = Math.min(max, n);
    onCommit(n);
    setText(String(n));
  };

  return (
    <Input
      id={id}
      type="text"
      inputMode="numeric"
      className={className}
      placeholder={placeholder}
      value={text}
      onChange={(e) => {
        const v = e.target.value;
        // разрешаем пустую строку и только цифры
        if (v === "" || /^\d+$/.test(v)) setText(v);
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
    />
  );
}
