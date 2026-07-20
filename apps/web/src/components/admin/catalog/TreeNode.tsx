"use client";

import styles from "./catalog-manager.module.css";
import type { CategoryTreeNode } from "./useCatalogApi";

interface TreeNodeProps {
  node: CategoryTreeNode;
  filter: string;
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

function matchesFilter(node: CategoryTreeNode, filter: string): boolean {
  if (!filter) return true;
  if (node.name.toLowerCase().includes(filter)) return true;
  return (node.children || []).some((c) => matchesFilter(c, filter));
}

export function TreeNode({
  node,
  filter,
  expanded,
  selectedPath,
  onToggleExpand,
  onSelect,
  onAddChild,
  onRename,
  onMove,
  onDelete,
  onDrop,
}: TreeNodeProps) {
  if (!matchesFilter(node, filter)) return null;

  const hasKids = node.children && node.children.length > 0;
  const isOpen = expanded.has(node.path) || (filter && matchesFilter(node, filter));
  const isSelected = selectedPath === node.path;
  const isUncat = node.path.startsWith("❓");

  return (
    <>
      <div
        className={`${styles.nodeRow} ${isSelected ? styles.nodeRowSelected : ""}`}
        data-path={node.path}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData("text/cat", node.path);
          e.dataTransfer.effectAllowed = "move";
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.currentTarget.classList.add(styles.nodeRowDrop);
        }}
        onDragLeave={(e) => {
          e.currentTarget.classList.remove(styles.nodeRowDrop);
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.currentTarget.classList.remove(styles.nodeRowDrop);
          onDrop(node.path, e);
        }}
        onClick={() => onSelect(node.path)}
      >
        <span
          className={`${styles.twisty} ${hasKids ? "" : styles.twistyLeaf}`}
          onClick={(e) => {
            e.stopPropagation();
            if (!hasKids) return;
            onToggleExpand(node.path);
          }}
        >
          {hasKids ? (isOpen ? "▾" : "▸") : "•"}
        </span>

        <span className={`${styles.nodeName} ${isUncat ? styles.nodeNameUncat : ""}`}>
          {node.name}
        </span>

        <span className={`${styles.count} num`}>{node.productCount.toLocaleString("ru")}</span>

        <span className={styles.nodeActions}>
          <button
            type="button"
            className={styles.mini}
            title="Подкатегория"
            onClick={(e) => {
              e.stopPropagation();
              onAddChild(node.path);
            }}
          >
            ＋
          </button>
          <button
            type="button"
            className={styles.mini}
            title="Переименовать"
            onClick={(e) => {
              e.stopPropagation();
              onRename(node);
            }}
          >
            ✎
          </button>
          <button
            type="button"
            className={styles.mini}
            title="Переместить"
            onClick={(e) => {
              e.stopPropagation();
              onMove(node);
            }}
          >
            ⇄
          </button>
          <button
            type="button"
            className={styles.mini}
            title="Удалить"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(node);
            }}
          >
            🗑
          </button>
        </span>
      </div>

      {hasKids && isOpen ? (
        <div className={styles.children}>
          {node.children.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              filter={filter}
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
      ) : null}
    </>
  );
}
