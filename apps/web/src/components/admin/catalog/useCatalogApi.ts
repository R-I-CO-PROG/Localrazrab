const API_BASE = "/api/backend/catalog";

async function parseJson<T>(res: Response): Promise<T> {
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok || data.error) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return data;
}

export interface CategoryTreeNode {
  path: string;
  name: string;
  parentPath: string | null;
  level: number;
  directCount: number;
  productCount: number;
  children: CategoryTreeNode[];
}

export interface TreeStats {
  totalProducts: number;
  categories: number;
  uncategorized: number;
}

export interface TreeResponse {
  roots: CategoryTreeNode[];
  stats: TreeStats;
  updatedAt?: string;
}

export interface CatalogProduct {
  sku: string;
  name: string;
  brand: string;
  color: string;
  site: string;
  priceRub: string;
  stock: string;
  image: string;
  url: string;
  base: string;
  effective: string;
}

export interface ProductsResponse {
  total: number;
  page: number;
  pageSize: number;
  items: CatalogProduct[];
  isLeaf: boolean;
  aggregated: boolean;
}

export function useCatalogApi() {
  return {
    async getTree(): Promise<TreeResponse> {
      const res = await fetch(`${API_BASE}/tree`, { cache: "no-store" });
      return parseJson(res);
    },

    async getPaths(): Promise<string[]> {
      const res = await fetch(`${API_BASE}/paths`, { cache: "no-store" });
      const data = await parseJson<{ paths: string[] }>(res);
      return data.paths;
    },

    async getProducts(params: {
      path: string;
      page: number;
      pageSize?: number;
      q?: string;
      site?: string;
    }): Promise<ProductsResponse> {
      const sp = new URLSearchParams({
        path: params.path,
        page: String(params.page),
        pageSize: String(params.pageSize ?? 60),
        q: params.q ?? "",
        site: params.site ?? "",
      });
      const res = await fetch(`${API_BASE}/products?${sp}`, { cache: "no-store" });
      return parseJson(res);
    },

    async search(q: string) {
      const res = await fetch(`${API_BASE}/search?q=${encodeURIComponent(q)}`, {
        cache: "no-store",
      });
      return parseJson<{ total: number; items: CatalogProduct[] }>(res);
    },

    async post<T>(path: string, body: Record<string, unknown>): Promise<T> {
      const res = await fetch(`${API_BASE}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return parseJson(res);
    },
  };
}
