"use client";

import styles from "./catalog-manager.module.css";
import { displayCatalogImageSrc } from "@/lib/product-image";
import type { CatalogProduct } from "./useCatalogApi";

interface ProductCardProps {
  product: CatalogProduct;
  selected: boolean;
  onToggle: (sku: string) => void;
  onDragStart: (sku: string, e: React.DragEvent) => void;
}

export function ProductCard({ product, selected, onToggle, onDragStart }: ProductCardProps) {
  const siteShort = product.site.replace(/\..*/, "");
  const imageSrc = product.image ? displayCatalogImageSrc(product.image) : "";

  return (
    <div
      className={`${styles.card} ${selected ? styles.cardSel : ""}`}
      draggable
      onDragStart={(e) => onDragStart(product.sku, e)}
      onClick={(e) => {
        if ((e.target as HTMLElement).tagName === "INPUT") return;
        if ((e.target as HTMLElement).closest("a")) return;
        onToggle(product.sku);
      }}
    >
      <input
        type="checkbox"
        className={styles.chk}
        checked={selected}
        onClick={(e) => e.stopPropagation()}
        onChange={() => onToggle(product.sku)}
      />

      {imageSrc ? (
        <div className={styles.thumb}>
          <img
            src={imageSrc}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={(e) => {
              const parent = e.currentTarget.parentElement;
              if (!parent) return;
              parent.className = `${styles.thumb} ${styles.thumbEmpty}`;
              parent.textContent = "нет фото";
            }}
          />
        </div>
      ) : (
        <div className={`${styles.thumb} ${styles.thumbEmpty}`}>нет фото</div>
      )}

      {product.url ? (
        <a
          className={styles.openlink}
          href={product.url}
          target="_blank"
          rel="noopener noreferrer"
          title="Открыть на сайте поставщика"
          onClick={(e) => e.stopPropagation()}
          onDragStart={(e) => e.stopPropagation()}
        >
          ↗
        </a>
      ) : null}

      <div className={styles.body}>
        <div className={styles.nm} title={product.name}>
          {product.url ? (
            <a
              href={product.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              onDragStart={(e) => e.stopPropagation()}
            >
              {product.name}
            </a>
          ) : (
            product.name
          )}
        </div>
        <div className={styles.meta}>
          <span className={styles.pill}>{siteShort}</span>
          <span className={`${styles.price} mono`}>
            {product.priceRub ? `${Number(product.priceRub).toLocaleString("ru")} ₽` : ""}
          </span>
        </div>
        <div className={styles.meta}>
          <span className="mono">{product.sku}</span>
          <span>{product.brand}</span>
        </div>
      </div>
    </div>
  );
}
