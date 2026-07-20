"use client";

import { ArrowUpDown, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LIST_SORT_LABELS, type ListSortKey } from "@/lib/list-search-sort";
import { cn } from "@/lib/utils";

interface ListToolbarProps {
  query: string;
  onQueryChange: (query: string) => void;
  sort: ListSortKey;
  onSortChange: (sort: ListSortKey) => void;
  sortOptions: ListSortKey[];
  placeholder?: string;
  filteredCount: number;
  totalCount: number;
  className?: string;
}

export function ListToolbar({
  query,
  onQueryChange,
  sort,
  onSortChange,
  sortOptions,
  placeholder = "Поиск…",
  filteredCount,
  totalCount,
  className,
}: ListToolbarProps) {
  const isFiltering = query.trim().length > 0;
  const showCount = isFiltering || filteredCount !== totalCount;

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder={placeholder}
            className="pl-9 pr-9"
          />
          {isFiltering && (
            <button
              type="button"
              onClick={() => onQueryChange("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              aria-label="Очистить поиск"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <Select value={sort} onValueChange={(value) => onSortChange(value as ListSortKey)}>
          <SelectTrigger className="w-full shrink-0 sm:w-[220px]">
            <ArrowUpDown className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {sortOptions.map((key) => (
              <SelectItem key={key} value={key}>
                {LIST_SORT_LABELS[key]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {showCount && (
        <p className="text-xs text-muted-foreground">
          {isFiltering
            ? `Найдено: ${filteredCount} из ${totalCount}`
            : `Показано: ${filteredCount}`}
        </p>
      )}
    </div>
  );
}
