"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Ban,
  Check,
  Coins,
  Copy,
  Loader2,
  Search,
  Shield,
  ShieldCheck,
  ShieldOff,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/admin/ui/page-header";
import { Panel } from "@/components/admin/ui/panel";
import { StatCard } from "@/components/admin/ui/stat-card";
import { SERIES } from "@/components/admin/ui/chart";
import { formatNumber } from "@/lib/utils";

interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  credits: number;
  role: string;
  plan: string;
  blocked: boolean;
  blockedAt: string | null;
  createdAt: string;
}

type CreditMode = "add" | "set" | "deduct";
type RoleFilter = "all" | "ADMIN" | "USER";
type StatusFilter = "all" | "active" | "blocked";
type SortBy = "credits_desc" | "credits_asc" | "newest" | "email";

function formatDate(iso: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}

export default function AdminUsersPage() {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [search, setSearch] = useState("");
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [actionUserId, setActionUserId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const [selectedUserId, setSelectedUserId] = useState("");
  const [amount, setAmount] = useState("50");
  const [mode, setMode] = useState<CreditMode>("add");
  const [note, setNote] = useState("");

  // View controls (client-side, over the loaded list)
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortBy, setSortBy] = useState<SortBy>("credits_desc");
  const [copied, setCopied] = useState(false);

  const loadUsers = useCallback(async (query = "") => {
    setLoadingUsers(true);
    try {
      const params = new URLSearchParams();
      if (query) params.set("q", query);
      const res = await fetch(`/api/admin/users?${params}`);
      if (!res.ok) throw new Error("Не удалось загрузить пользователей");
      const data = await res.json();
      setUsers(data.users ?? []);
    } catch {
      setUsers([]);
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  useEffect(() => {
    fetch("/api/admin/check")
      .then((r) => r.json())
      .then((data) => setAllowed(!!data.isAdmin))
      .catch(() => setAllowed(false));
  }, []);

  useEffect(() => {
    if (!allowed) return;
    const timer = setTimeout(() => loadUsers(search), 300);
    return () => clearTimeout(timer);
  }, [allowed, search, loadUsers]);

  const selectedUser = users.find((u) => u.id === selectedUserId);

  // Summary over the currently loaded list
  const summary = useMemo(() => {
    const admins = users.filter((u) => u.role === "ADMIN").length;
    const blocked = users.filter((u) => u.blocked).length;
    const credits = users.reduce((s, u) => s + (u.credits || 0), 0);
    return { total: users.length, admins, blocked, credits };
  }, [users]);

  // Apply filters + sort client-side
  const visibleUsers = useMemo(() => {
    let list = users.slice();
    if (roleFilter !== "all") list = list.filter((u) => u.role === roleFilter);
    if (statusFilter === "active") list = list.filter((u) => !u.blocked);
    if (statusFilter === "blocked") list = list.filter((u) => u.blocked);
    switch (sortBy) {
      case "credits_desc":
        list.sort((a, b) => b.credits - a.credits);
        break;
      case "credits_asc":
        list.sort((a, b) => a.credits - b.credits);
        break;
      case "newest":
        list.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
        break;
      case "email":
        list.sort((a, b) => a.email.localeCompare(b.email));
        break;
    }
    return list;
  }, [users, roleFilter, statusFilter, sortBy]);

  function selectUser(user: AdminUser) {
    setSelectedUserId(user.id);
    setMessage(null);
  }

  async function copyEmail(email: string) {
    try {
      await navigator.clipboard.writeText(email);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard unavailable */
    }
  }

  async function handleCredits(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedUserId) {
      setMessage({ type: "err", text: "Выберите пользователя из списка" });
      return;
    }

    setSubmitting(true);
    setMessage(null);

    const parsed = Number(amount);
    if (!Number.isInteger(parsed)) {
      setMessage({ type: "err", text: "Укажите целое число кредитов" });
      setSubmitting(false);
      return;
    }

    try {
      const res = await fetch("/api/admin/credits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: selectedUserId,
          amount: parsed,
          mode,
          note: note.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Ошибка");

      const verb =
        mode === "deduct" ? "Списано" : mode === "set" ? "Баланс установлен" : "Начислено";
      setMessage({
        type: "ok",
        text: `${verb}: ${data.user.email} → ${formatNumber(data.user.credits)} кредитов`,
      });
      setNote("");
      loadUsers(search);
    } catch (err) {
      setMessage({
        type: "err",
        text: err instanceof Error ? err.message : "Ошибка операции с кредитами",
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function patchUser(userId: string, body: Record<string, unknown>) {
    setActionUserId(userId);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Ошибка");
      loadUsers(search);
      return data;
    } finally {
      setActionUserId(null);
    }
  }

  async function handleToggleAdmin(user: AdminUser) {
    const makeAdmin = user.role !== "ADMIN";
    const label = makeAdmin ? "назначить администратором" : "снять права администратора";
    if (!confirm(`${makeAdmin ? "Назначить" : "Снять"} ${user.email} ${label}?`)) return;

    try {
      await patchUser(user.id, {
        action: "setRole",
        role: makeAdmin ? "ADMIN" : "USER",
      });
      setMessage({
        type: "ok",
        text: makeAdmin ? `${user.email} — администратор` : `${user.email} — обычный пользователь`,
      });
    } catch (err) {
      setMessage({
        type: "err",
        text: err instanceof Error ? err.message : "Не удалось изменить роль",
      });
    }
  }

  async function handleToggleBlock(user: AdminUser) {
    const block = !user.blocked;
    if (
      !confirm(
        block
          ? `Заблокировать ${user.email}? Все сессии будут завершены.`
          : `Разблокировать ${user.email}?`
      )
    ) {
      return;
    }

    try {
      await patchUser(user.id, { action: block ? "block" : "unblock" });
      setMessage({
        type: "ok",
        text: block ? `${user.email} заблокирован` : `${user.email} разблокирован`,
      });
    } catch (err) {
      setMessage({
        type: "err",
        text: err instanceof Error ? err.message : "Не удалось изменить блокировку",
      });
    }
  }

  async function handleDelete(user: AdminUser) {
    if (
      !confirm(
        `Удалить аккаунт ${user.email}? Это необратимо. Пользователь сможет зарегистрироваться заново.`
      )
    ) {
      return;
    }

    setActionUserId(user.id);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Ошибка удаления");

      if (selectedUserId === user.id) setSelectedUserId("");
      setMessage({ type: "ok", text: `Аккаунт ${user.email} удалён` });
      loadUsers(search);
    } catch (err) {
      setMessage({
        type: "err",
        text: err instanceof Error ? err.message : "Не удалось удалить",
      });
    } finally {
      setActionUserId(null);
    }
  }

  if (allowed === null) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Проверка доступа…
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="mx-auto max-w-lg space-y-4 py-16 text-center">
        <Shield className="mx-auto h-12 w-12 text-muted-foreground" />
        <h1 className="font-display text-2xl font-semibold">Нет доступа</h1>
        <p className="text-muted-foreground">Раздел только для администратора.</p>
        <Button asChild variant="outline">
          <Link href="/settings">Назад в настройки</Link>
        </Button>
      </div>
    );
  }

  const filtersActive = roleFilter !== "all" || statusFilter !== "all";

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
      className="space-y-7"
    >
      <PageHeader
        eyebrow="Доступ и баланс"
        title="Пользователи"
        description="Кредиты, роли, блокировка и удаление аккаунтов."
      />

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="Всего" value={formatNumber(summary.total)} icon={<Users className="h-4 w-4" />} accent={SERIES.green} />
        <StatCard label="Администраторы" value={formatNumber(summary.admins)} icon={<ShieldCheck className="h-4 w-4" />} accent={SERIES.cyan} />
        <StatCard label="Заблокированы" value={formatNumber(summary.blocked)} icon={<Ban className="h-4 w-4" />} accent={SERIES.rose} />
        <StatCard label="Кредитов в сумме" value={formatNumber(summary.credits)} icon={<Coins className="h-4 w-4" />} accent={SERIES.amber} />
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        {/* ----- Registry ----- */}
        <Panel
          eyebrow="Реестр"
          title="Все пользователи"
          icon={<Users className="h-5 w-5" />}
          bodyClassName="p-0"
          actions={
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Поиск по email или имени…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          }
        >
          {/* Toolbar: filters + sort */}
          <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3 sm:px-5">
            <Filter
              value={roleFilter}
              onChange={(v) => setRoleFilter(v as RoleFilter)}
              options={[
                { v: "all", l: "Все роли" },
                { v: "ADMIN", l: "Админы" },
                { v: "USER", l: "Юзеры" },
              ]}
            />
            <Filter
              value={statusFilter}
              onChange={(v) => setStatusFilter(v as StatusFilter)}
              options={[
                { v: "all", l: "Все статусы" },
                { v: "active", l: "Активные" },
                { v: "blocked", l: "Заблок." },
              ]}
            />
            <div className="ml-auto flex items-center gap-2">
              <span className="mono hidden text-[10px] uppercase tracking-wider text-muted-foreground sm:inline">
                сортировка
              </span>
              <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortBy)}>
                <SelectTrigger className="h-9 w-[170px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="credits_desc">Кредиты ↓</SelectItem>
                  <SelectItem value="credits_asc">Кредиты ↑</SelectItem>
                  <SelectItem value="newest">Сначала новые</SelectItem>
                  <SelectItem value="email">По email</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Column header (desktop) */}
          <div className="mono hidden grid-cols-[minmax(0,1fr)_84px_104px_72px] gap-3 border-b border-border px-5 py-2 text-[10px] uppercase tracking-wider text-muted-foreground sm:grid">
            <span>Пользователь</span>
            <span>Тариф</span>
            <span className="text-right">Кредиты</span>
            <span className="text-right">Создан</span>
          </div>

          {loadingUsers ? (
            <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Загрузка…
            </div>
          ) : visibleUsers.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">
              {filtersActive || search ? "Ничего не найдено по фильтрам" : "Пользователей пока нет"}
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {visibleUsers.map((user) => {
                const isSelected = selectedUserId === user.id;
                return (
                  <li key={user.id}>
                    <button
                      type="button"
                      onClick={() => selectUser(user)}
                      className={`relative grid w-full grid-cols-1 items-center gap-2 px-5 py-3 text-left transition-colors sm:grid-cols-[minmax(0,1fr)_84px_104px_72px] sm:gap-3 ${
                        isSelected ? "bg-primary/[0.07]" : "hover:bg-secondary/40"
                      }`}
                    >
                      {isSelected && <span className="absolute inset-y-0 left-0 w-0.5 bg-primary" />}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="mono truncate text-[13px] font-medium">{user.email}</span>
                          {user.role === "ADMIN" && (
                            <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-primary" />
                          )}
                          {user.blocked && <Ban className="h-3.5 w-3.5 shrink-0 text-destructive" />}
                        </div>
                        {user.name && (
                          <span className="truncate text-xs text-muted-foreground">{user.name}</span>
                        )}
                      </div>
                      <span className="hidden sm:block">
                        <Badge variant="outline" className="text-[10px]">
                          {user.plan}
                        </Badge>
                      </span>
                      <span className="num text-left font-display text-base font-semibold text-primary sm:text-right">
                        {formatNumber(user.credits)}
                      </span>
                      <span className="mono hidden text-right text-[11px] text-muted-foreground sm:block">
                        {formatDate(user.createdAt)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        {/* ----- Action panel ----- */}
        <div className="lg:sticky lg:top-24">
          {selectedUser ? (
            <Panel
              eyebrow="Управление"
              title="Пользователь"
              icon={<Shield className="h-5 w-5" />}
              actions={
                <button
                  type="button"
                  onClick={() => setSelectedUserId("")}
                  className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                  aria-label="Снять выбор"
                >
                  <X className="h-4 w-4" />
                </button>
              }
            >
              {/* Identity */}
              <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/12 font-display text-lg font-semibold uppercase text-primary">
                  {(selectedUser.name || selectedUser.email).charAt(0)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="mono truncate text-sm font-medium">{selectedUser.email}</span>
                    <button
                      type="button"
                      onClick={() => copyEmail(selectedUser.email)}
                      className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
                      aria-label="Скопировать email"
                    >
                      {copied ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                  {selectedUser.name && (
                    <p className="text-xs text-muted-foreground">{selectedUser.name}</p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {selectedUser.role === "ADMIN" && <Badge>Администратор</Badge>}
                    {selectedUser.blocked && <Badge variant="destructive">Заблокирован</Badge>}
                    <Badge variant="outline">{selectedUser.plan}</Badge>
                  </div>
                </div>
              </div>

              <div className="mt-4 flex items-baseline justify-between rounded-xl border border-border bg-secondary/30 px-4 py-3">
                <span className="mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  Текущий баланс
                </span>
                <span className="num font-display text-2xl font-semibold text-primary">
                  {formatNumber(selectedUser.credits)}
                </span>
              </div>

              {/* Credit operation */}
              <form onSubmit={handleCredits} className="mt-5 space-y-3">
                <div className="flex flex-wrap gap-1.5">
                  {[50, 100, 500, 1000].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => {
                        setMode("add");
                        setAmount(String(preset));
                      }}
                      className="num rounded-lg border border-border bg-secondary/40 px-2.5 py-1 text-xs font-medium transition-colors hover:border-primary/40 hover:text-primary"
                    >
                      +{preset}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="admin-amount">Кол-во</Label>
                    <Input
                      id="admin-amount"
                      type="number"
                      min={mode === "set" ? 0 : 1}
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="num"
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Операция</Label>
                    <Select value={mode} onValueChange={(v) => setMode(v as CreditMode)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="add">Выдать</SelectItem>
                        <SelectItem value="deduct">Списать</SelectItem>
                        <SelectItem value="set">Установить</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="admin-note">Комментарий</Label>
                  <Input
                    id="admin-note"
                    placeholder="Бонус, коррекция, тариф…"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  <Coins className="mr-1.5 h-4 w-4" />
                  Применить к балансу
                </Button>
              </form>

              {/* Account actions */}
              <div className="mt-5 space-y-2 border-t border-border pt-4">
                <p className="mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  Аккаунт
                </p>
                <div className="grid grid-cols-1 gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="justify-start"
                    disabled={actionUserId === selectedUser.id}
                    onClick={() => void handleToggleAdmin(selectedUser)}
                  >
                    {actionUserId === selectedUser.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : selectedUser.role === "ADMIN" ? (
                      <>
                        <ShieldOff className="mr-2 h-4 w-4" />
                        Снять права администратора
                      </>
                    ) : (
                      <>
                        <Shield className="mr-2 h-4 w-4" />
                        Сделать администратором
                      </>
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="justify-start"
                    disabled={actionUserId === selectedUser.id}
                    onClick={() => void handleToggleBlock(selectedUser)}
                  >
                    {actionUserId === selectedUser.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : selectedUser.blocked ? (
                      <>
                        <ShieldCheck className="mr-2 h-4 w-4" />
                        Разблокировать
                      </>
                    ) : (
                      <>
                        <Ban className="mr-2 h-4 w-4" />
                        Заблокировать
                      </>
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="justify-start text-destructive hover:bg-destructive/10 hover:text-destructive"
                    disabled={actionUserId === selectedUser.id}
                    onClick={() => void handleDelete(selectedUser)}
                  >
                    {actionUserId === selectedUser.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Trash2 className="mr-2 h-4 w-4" />
                        Удалить аккаунт
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {message && (
                <p
                  className={`mt-4 text-sm ${
                    message.type === "ok" ? "text-primary" : "text-destructive"
                  }`}
                >
                  {message.text}
                </p>
              )}
            </Panel>
          ) : (
            <Panel eyebrow="Управление" title="Пользователь" icon={<Shield className="h-5 w-5" />}>
              <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-secondary/40 text-muted-foreground">
                  <Users className="h-6 w-6" />
                </span>
                <p className="max-w-[220px] text-sm text-muted-foreground">
                  Выберите пользователя из реестра, чтобы управлять кредитами, ролью и блокировкой
                </p>
              </div>
              {message && (
                <p
                  className={`text-center text-sm ${
                    message.type === "ok" ? "text-primary" : "text-destructive"
                  }`}
                >
                  {message.text}
                </p>
              )}
            </Panel>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function Filter({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { v: string; l: string }[];
}) {
  return (
    <div className="inline-flex items-center gap-0.5 rounded-lg border border-border bg-card/60 p-0.5">
      {options.map((o) => (
        <button
          key={o.v}
          type="button"
          onClick={() => onChange(o.v)}
          className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
            value === o.v
              ? "bg-primary/15 text-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {o.l}
        </button>
      ))}
    </div>
  );
}
