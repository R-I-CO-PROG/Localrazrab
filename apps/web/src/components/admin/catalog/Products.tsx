"use client";

import { ProductCard } from "./ProductCard";
import { SelectionBar } from "./SelectionBar";
import { Toolbar } from "./Toolbar";
import styles from "./catalog-manager.module.css";
import type { CatalogProduct, ProductsResponse } from "./useCatalogApi";

interface ProductsProps {
  selectedPath: string | null;
  data: ProductsResponse | null;
  loading: boolean;
  search: string;
  site: string;
  selected: Set<string>;
  page: number;
  onSearchChange: (value: string) => void;
  onSiteChange: (value: string) => void;
  onToggleSelect: (sku: string) => void;
  onSelectPage: () => void;
  onClearSelection: () => void;
  onMoveSelection: () => void;
  onPageChange: (page: number) => void;
  onCardDragStart: (sku: string, selected: Set<string>, e: React.DragEvent) => void;
}

export function Products({
  selectedPath,
  data,
  loading,
  search,
  site,
  selected,
  page,
  onSearchChange,
  onSiteChange,
  onToggleSelect,
  onSelectPage,
  onClearSelection,
  onMoveSelection,
  onPageChange,
  onCardDragStart,
}: ProductsProps) {
  const crumb =
    selectedPath && data
      ? `${selectedPath.split(" / ").map((p, i, arr) => (i === arr.length - 1 ? p : p)).join(" / ")} — ${data.total.toLocaleString("ru")} товаров`
      : "Выберите категорию слева";

  const pages = data ? Math.ceil(data.total / data.pageSize) : 0;

  return (
    <section className={`${styles.col} ${styles.prodCol}`}>
      <div className={styles.breadcrumb}>
        {selectedPath && data ? (
          <>
            {selectedPath.split(" / ").map((part, i, arr) =>
              i === arr.length - 1 ? (
                <b key={part}>{part}</b>
              ) : (
                <span key={part}>{part} / </span>
              ),
            )}
            {" — "}
            {data.total.toLocaleString("ru")} товаров
          </>
        ) : (
          crumb
        )}
      </div>

      <Toolbar
        search={search}
        site={site}
        aggregated={data?.aggregated ?? false}
        onSearchChange={onSearchChange}
        onSiteChange={onSiteChange}
        onSelectPage={onSelectPage}
      />

      <SelectionBar count={selected.size} onMove={onMoveSelection} onClear={onClearSelection} />

      <div className={styles.grid}>
        {loading ? (
          <div className={styles.emptyState}>Загрузка…</div>
        ) : !selectedPath ? (
          <div className={styles.emptyState}>Выберите категорию слева</div>
        ) : !data?.items.length ? (
          <div className={styles.emptyState}>
            Здесь пока нет товаров.
            <br />
            Перетащите сюда товары или используйте «Переместить».
          </div>
        ) : (
          data.items.map((product: CatalogProduct) => (
            <ProductCard
              key={product.sku}
              product={product}
              selected={selected.has(product.sku)}
              onToggle={onToggleSelect}
              onDragStart={(sku, e) => onCardDragStart(sku, selected, e)}
            />
          ))
        )}
      </div>

      {pages > 1 ? (
        <div className={styles.pager}>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnGhost}`}
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            ‹ назад
          </button>
          <span>
            стр. {page} из {pages}
          </span>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnGhost}`}
            disabled={page >= pages}
            onClick={() => onPageChange(page + 1)}
          >
            вперёд ›
          </button>
        </div>
      ) : null}
    </section>
  );
}
