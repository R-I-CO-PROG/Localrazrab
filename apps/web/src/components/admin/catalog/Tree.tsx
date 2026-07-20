"use client";

import styles from "./catalog-manager.module.css";
import { TreeNode } from "./TreeNode";
import type { CategoryTreeNode } from "./useCatalogApi";

interface TreeProps {
  roots: CategoryTreeNode[];
  filter: string;
  onFilterChange: (value: string) => void;
  expanded: Set<string>;
  selectedPath: string | null;
  onToggleExpand: (path: string) => void;
  onSelect: (path: string) => void;
  onAddChild: (path: string) => void;
  onRename: (node: CategoryTreeNode) => void;
  onMove: (node: CategoryTreeNode) => void;
  onDelete: (node: CategoryTreeNode) => void;
  onDrop: (targetPath: string, e: React.DragEvent) => void;
}

export function Tree({
  roots,
  filter,
  onFilterChange,
  expanded,
  selectedPath,
  onToggleExpand,
  onSelect,
  onAddChild,
  onRename,
  onMove,
  onDelete,
  onDrop,
}: TreeProps) {
  return (
    <section className={`${styles.col} ${styles.treeCol}`}>
      <div className={styles.treeHead}>
        <input
          type="search"
          className={styles.input}
          placeholder="Фильтр категорий…"
          value={filter}
          onChange={(e) => onFilterChange(e.target.value)}
        />
      </div>
      <div className={styles.tree}>
        {roots.map((root) => (
          <TreeNode
            key={root.path}
            node={root}
            filter={filter.trim().toLowerCase()}
            expanded={expanded}
            selectedPath={selectedPath}
            onToggleExpand={onToggleExpand}
            onSelect={onSelect}
            onAddChild={onAddChild}
            onRename={onRename}
            onMove={onMove}
            onDelete={onDelete}
            onDrop={onDrop}
          />
        ))}
      </div>
    </section>
  );
}
