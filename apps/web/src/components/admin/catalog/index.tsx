"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Modal, type ModalField } from "./Modal";
import { Products } from "./Products";
import { Tree } from "./Tree";
import styles from "./catalog-manager.module.css";
import {
  useCatalogApi,
  type CategoryTreeNode,
  type ProductsResponse,
  type TreeResponse,
} from "./useCatalogApi";

type ModalOkHandler = (values: Record<string, string>) => void | Promise<void>;

type ModalState = {
  title: string;
  fields: ModalField[];
  onOk: ModalOkHandler;
} | null;

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

export function CatalogManager() {
  const api = useMemo(() => useCatalogApi(), []);
  const [treeData, setTreeData] = useState<TreeResponse | null>(null);
  const [paths, setPaths] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [productsLoading, setProductsLoading] = useState(false);
  const [products, setProducts] = useState<ProductsResponse | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [treeFilter, setTreeFilter] = useState("");
  const [prodSearch, setProdSearch] = useState("");
  const [site, setSite] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [modal, setModal] = useState<ModalState>(null);
  const [exporting, setExporting] = useState(false);
  const [toast, setToast] = useState<{ msg: string; kind?: "ok" | "err" } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const debouncedSearch = useDebounced(prodSearch, 300);

  const showToast = useCallback((msg: string, kind?: "ok" | "err") => {
    setToast({ msg, kind });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  }, []);

  const loadTree = useCallback(async () => {
    const [tree, pathList] = await Promise.all([api.getTree(), api.getPaths()]);
    setTreeData(tree);
    setPaths(pathList);
  }, [api]);

  const loadProducts = useCallback(async () => {
    if (!selectedPath) return;
    setProductsLoading(true);
    try {
      const data = await api.getProducts({
        path: selectedPath,
        page,
        q: debouncedSearch,
        site,
      });
      setProducts(data);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Ошибка загрузки", "err");
    } finally {
      setProductsLoading(false);
    }
  }, [api, selectedPath, page, debouncedSearch, site, showToast]);

  const refreshAll = useCallback(async () => {
    await loadTree();
    if (selectedPath) await loadProducts();
  }, [loadTree, loadProducts, selectedPath]);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        await loadTree();
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Ошибка дерева", "err");
      } finally {
        setLoading(false);
      }
    })();
  }, [loadTree, showToast]);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  function toggleExpand(path: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  function selectCategory(path: string) {
    setSelectedPath(path);
    setPage(1);
    setSelected(new Set());
  }

  function toggleSelect(sku: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(sku)) next.delete(sku);
      else next.add(sku);
      return next;
    });
  }

  function openModal(title: string, fields: ModalField[], onOk: ModalOkHandler) {
    setModal({ title, fields, onOk });
  }

  function closeModal() {
    setModal(null);
  }

  async function handleTreeDrop(targetPath: string, e: React.DragEvent) {
    const skusRaw = e.dataTransfer.getData("text/skus");
    const fromCat = e.dataTransfer.getData("text/cat");
    try {
      if (skusRaw) {
        const list = JSON.parse(skusRaw) as string[];
        await api.post("move-products", { skus: list, target: targetPath });
        showToast(`Перемещено товаров: ${list.length}`, "ok");
        setSelected(new Set());
        await refreshAll();
      } else if (fromCat && fromCat !== targetPath) {
        const leaf = fromCat.split(" / ").pop();
        await api.post("move-category", { from: fromCat, to: `${targetPath} / ${leaf}` });
        showToast("Категория перемещена", "ok");
        await refreshAll();
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Ошибка", "err");
    }
  }

  function handleCardDragStart(sku: string, sel: Set<string>, e: React.DragEvent) {
    const skus = sel.has(sku) ? [...sel] : [sku];
    e.dataTransfer.setData("text/skus", JSON.stringify(skus));
    e.dataTransfer.effectAllowed = "move";
  }

  const stats = treeData?.stats;

  if (loading && !treeData) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        Загрузка менеджера категорий…
      </div>
    );
  }

  return (
    <div className={styles.catalogManager}>
      <header className={styles.subheader}>
        <h2 className="font-display">
          Менеджер категорий <span>· Каталог IMBA</span>
        </h2>
        {stats ? (
          <div className={styles.stats}>
            <div>
              товаров <b className="num">{stats.totalProducts.toLocaleString("ru")}</b>
            </div>
            <div>
              категорий <b className="num">{stats.categories.toLocaleString("ru")}</b>
            </div>
            <div className={styles.statsWarn}>
              требует разбора <b className="num">{stats.uncategorized.toLocaleString("ru")}</b>
            </div>
          </div>
        ) : null}
        <button
          type="button"
          className={styles.btn}
          onClick={() =>
            openModal("Новая корневая категория", [{ key: "name", label: "Имя категории", type: "text" }], async (v) => {
              if (!v.name) return;
              await api.post("create-category", { path: v.name });
              showToast("Категория создана", "ok");
              await refreshAll();
            })
          }
        >
          + Категория
        </button>
        <button
          type="button"
          className={`${styles.btn} ${styles.btnGhost} ${styles.btnDanger}`}
          onClick={() =>
            openModal("Сбросить все ручные правки?", [
              {
                key: "c",
                label: "Это вернёт авто-классификацию по умолчанию. Введите СБРОС для подтверждения.",
                type: "text",
              },
            ], async (v) => {
              if (v.c !== "СБРОС") {
                showToast("Отменено");
                return;
              }
              await api.post("snapshot", { reason: "before-reset" });
              await api.post("reset", {});
              setSelectedPath(null);
              setProducts(null);
              showToast("Правки сброшены", "ok");
              await refreshAll();
            })
          }
        >
          Сбросить правки
        </button>
        <button
          type="button"
          className={`${styles.btn} ${styles.btnPrimary}`}
          disabled={exporting}
          onClick={async () => {
            setExporting(true);
            try {
              const r = await api.post<{ productCount?: number; note?: string }>("export", {});
              const n = r.productCount ?? stats?.totalProducts ?? 0;
              showToast(`Экспорт: ${n.toLocaleString("ru")} товаров (${r.note ?? "ok"})`, "ok");
            } catch (err) {
              showToast(err instanceof Error ? err.message : "Ошибка экспорта", "err");
            } finally {
              setExporting(false);
            }
          }}
        >
          {exporting ? "Экспорт…" : "Экспорт на сайт"}
        </button>
      </header>

      <main className={styles.main}>
        <Tree
          roots={treeData?.roots ?? []}
          filter={treeFilter}
          onFilterChange={setTreeFilter}
          expanded={expanded}
          selectedPath={selectedPath}
          onToggleExpand={toggleExpand}
          onSelect={selectCategory}
          onAddChild={(parent) =>
            openModal(
              "Новая подкатегория",
              [{ key: "name", label: `Имя подкатегории в «${parent}»`, type: "text" }],
              async (v) => {
                if (!v.name) return;
                await api.post("create-category", { path: `${parent} / ${v.name}` });
                setExpanded((prev) => new Set(prev).add(parent));
                showToast("Категория создана", "ok");
                await refreshAll();
              },
            )
          }
          onRename={(node: CategoryTreeNode) =>
            openModal(
              "Переименовать категорию",
              [{ key: "name", label: "Новое имя", type: "text", value: node.name }],
              async (v) => {
                if (!v.name || v.name === node.name) return;
                await api.post("rename-category", { path: node.path, newName: v.name });
                showToast("Переименовано", "ok");
                await refreshAll();
              },
            )
          }
          onMove={(node: CategoryTreeNode) =>
            openModal(
              "Переместить категорию",
              [
                {
                  key: "to",
                  label: "Куда (родительская категория; пусто = в корень)",
                  type: "path",
                },
              ],
              async (v) => {
                const to = (v.to ? `${v.to} / ` : "") + node.name;
                await api.post("move-category", { from: node.path, to });
                showToast("Категория перемещена", "ok");
                await refreshAll();
              },
            )
          }
          onDelete={(node: CategoryTreeNode) =>
            openModal(`Удалить «${node.name}»`, [
              {
                key: "mode",
                label: "Что сделать с товарами и подкатегориями",
                type: "select",
                options: [
                  ["merge-up", "Перенести на уровень выше"],
                  ["to-uncategorized", "В «Требует категории»"],
                ],
              },
            ], async (v) => {
              await api.post("delete-category", { path: node.path, mode: v.mode });
              if (selectedPath === node.path) {
                setSelectedPath(null);
                setProducts(null);
              }
              showToast("Категория удалена", "ok");
              await refreshAll();
            })
          }
          onDrop={handleTreeDrop}
        />

        <Products
          selectedPath={selectedPath}
          data={products}
          loading={productsLoading}
          search={prodSearch}
          site={site}
          selected={selected}
          page={page}
          onSearchChange={(v) => {
            setProdSearch(v);
            setPage(1);
          }}
          onSiteChange={(v) => {
            setSite(v);
            setPage(1);
          }}
          onToggleSelect={toggleSelect}
          onSelectPage={() => {
            if (!products) return;
            setSelected((prev) => {
              const next = new Set(prev);
              for (const it of products.items) next.add(it.sku);
              return next;
            });
          }}
          onClearSelection={() => setSelected(new Set())}
          onMoveSelection={() =>
            openModal(`Переместить ${selected.size} товаров`, [
              { key: "to", label: "В какую категорию", type: "path" },
            ], async (v) => {
              if (!v.to) return;
              const list = [...selected];
              await api.post("move-products", { skus: list, target: v.to });
              showToast(`Перемещено: ${list.length}`, "ok");
              setSelected(new Set());
              await refreshAll();
            })
          }
          onPageChange={setPage}
          onCardDragStart={handleCardDragStart}
        />
      </main>

      <div
        className={`${styles.toast} ${toast ? styles.toastShow : ""} ${toast?.kind === "err" ? styles.toastErr : ""} ${toast?.kind === "ok" ? styles.toastOk : ""}`}
      >
        {toast?.msg ?? ""}
      </div>

      <Modal
        open={modal !== null}
        title={modal?.title ?? ""}
        fields={modal?.fields ?? []}
        paths={paths}
        onClose={closeModal}
        onOk={async (values) => {
          try {
            await modal?.onOk?.(values);
            closeModal();
          } catch (err) {
            showToast(err instanceof Error ? err.message : "Ошибка", "err");
          }
        }}
      />
    </div>
  );
}

export default CatalogManager;
