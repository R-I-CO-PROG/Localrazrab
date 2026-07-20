"use client";

import styles from "./catalog-manager.module.css";

interface SelectionBarProps {
  count: number;
  onMove: () => void;
  onClear: () => void;
}

export function SelectionBar({ count, onMove, onClear }: SelectionBarProps) {
  if (count <= 0) return null;

  return (
    <div className={`${styles.selbar} ${styles.selbarShow}`}>
      <span>{count} выбрано</span>
      <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={onMove}>
        Переместить в категорию…
      </button>
      <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={onClear}>
        Снять выделение
      </button>
    </div>
  );
}
