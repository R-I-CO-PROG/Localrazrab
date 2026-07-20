"use client";

import styles from "./catalog-manager.module.css";

const SITES = [
  "art24.by",
  "midoceanbrands.ru",
  "oceangifts.ru",
  "topcatalog.ru",
  "oasiscatalog.com",
];

interface ToolbarProps {
  search: string;
  site: string;
  aggregated: boolean;
  onSearchChange: (value: string) => void;
  onSiteChange: (value: string) => void;
  onSelectPage: () => void;
}

export function Toolbar({
  search,
  site,
  aggregated,
  onSearchChange,
  onSiteChange,
  onSelectPage,
}: ToolbarProps) {
  return (
    <div className={styles.prodToolbar}>
      <input
        type="search"
        className={styles.input}
        style={{ flex: 1, minWidth: 200 }}
        placeholder="Поиск товара (имя, SKU, бренд)…"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
      />
      <select className={styles.select} value={site} onChange={(e) => onSiteChange(e.target.value)}>
        <option value="">Все источники</option>
        {SITES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      {aggregated ? <span className={styles.hint}>показ из всех подкатегорий</span> : null}
      <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={onSelectPage}>
        Выделить страницу
      </button>
    </div>
  );
}
