"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { LogicSchemaTablesData } from "@/lib/logic/types";

const GROUPS = ["All", "Auth", "Catalog", "Generation"] as const;

export function LogicSchemaTables({ data }: { data: LogicSchemaTablesData }) {
  const [group, setGroup] = useState<(typeof GROUPS)[number]>("All");
  const [model, setModel] = useState<string>("all");

  const filtered = useMemo(() => {
    let list = data.tables;
    if (group !== "All") list = list.filter((t) => t.group === group);
    if (model !== "all") list = list.filter((t) => t.model === model);
    return list;
  }, [data.tables, group, model]);

  const modelOptions = useMemo(() => {
    const base = group === "All" ? data.tables : data.tables.filter((t) => t.group === group);
    return base.map((t) => t.model);
  }, [data.tables, group]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Select
          value={group}
          onValueChange={(v) => {
            setGroup(v as (typeof GROUPS)[number]);
            setModel("all");
          }}
        >
          <SelectTrigger className="sm:w-44">
            <SelectValue placeholder="Группа" />
          </SelectTrigger>
          <SelectContent>
            {GROUPS.map((g) => (
              <SelectItem key={g} value={g}>
                {g === "All" ? "Все группы" : g}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={model} onValueChange={setModel}>
          <SelectTrigger className="sm:w-52">
            <SelectValue placeholder="Таблица" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все таблицы</SelectItem>
            {modelOptions.map((m) => (
              <SelectItem key={m} value={m}>
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <p className="text-xs text-muted-foreground">
        {filtered.length} таблиц · источник: <code>{data.source}</code>
        {data.generatedAt && ` · ${new Date(data.generatedAt).toLocaleString("ru-RU")}`}
      </p>

      <div className="space-y-4">
        {filtered.map((table) => (
          <Card key={table.model}>
            <CardHeader className="pb-2">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-base">
                  <code>{table.model}</code>
                </CardTitle>
                <Badge variant="secondary" className="text-[10px]">
                  {table.group}
                </Badge>
                {table.table !== table.model && (
                  <Badge variant="outline" className="font-mono text-[10px]">
                    PG: {table.table}
                  </Badge>
                )}
              </div>
              <CardDescription>Prisma model → PostgreSQL table</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="pb-2 pr-3 font-medium">Поле</th>
                    <th className="pb-2 pr-3 font-medium">Тип</th>
                    <th className="pb-2 pr-3 font-medium">Ключ</th>
                    <th className="pb-2 pr-3 font-medium">Атрибуты</th>
                    <th className="pb-2 font-medium">Примечание</th>
                  </tr>
                </thead>
                <tbody>
                  {table.fields.map((field) => (
                    <tr key={field.name} className="border-b border-border/40 align-top">
                      <td className="py-2 pr-3">
                        <code className="text-xs">{field.name}</code>
                      </td>
                      <td className="py-2 pr-3 text-xs text-muted-foreground">{field.type}</td>
                      <td className="py-2 pr-3">
                        {field.key && (
                          <Badge variant="outline" className="font-mono text-[10px]">
                            {field.key}
                          </Badge>
                        )}
                      </td>
                      <td className="py-2 pr-3 max-w-[220px] truncate text-[11px] text-muted-foreground">
                        {field.attributes}
                      </td>
                      <td className="py-2 text-xs text-muted-foreground">{field.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
