/* ULT Concept AI — static demo app shell */
const NAV = [
  { href: "generate.html", label: "AI Генерация", icon: "sparkles" },
  { href: "concepts.html", label: "Мои проекты", icon: "layers" },
  { href: "visualizations.html", label: "Визуализации", icon: "image" },
  { href: "proposals.html", label: "КП и презентации", icon: "file" },
  { href: "brandbooks.html", label: "Брендбук и лого", icon: "book" },
  { href: "templates.html", label: "Шаблоны задач", icon: "template" },
  { href: "favorites.html", label: "Избранное", icon: "heart" },
  { href: "settings.html", label: "Настройки", icon: "settings" },
];

const ICONS = {
  sparkles: '<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/>',
  layers: '<path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z"/><path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12"/><path d="M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17"/>',
  image: '<rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
  file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>',
  book: '<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20"/>',
  template: '<rect width="18" height="7" x="3" y="3" rx="1"/><rect width="9" height="7" x="3" y="14" rx="1"/><rect width="5" height="7" x="16" y="14" rx="1"/>',
  heart: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
  settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
  zap: '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>',
  menu: '<line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
};

function svg(name) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ""}</svg>`;
}

function showToast(msg) {
  let t = document.getElementById("toast");
  if (!t) {
    t = document.createElement("div");
    t.id = "toast";
    t.className = "toast";
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 3200);
}

function demoBanner() {
  return `<div class="demo-banner">⚡ <strong>Демо-режим</strong> — данные и изображения заглушки. Генерация и API отключены.</div>`;
}

function renderShell(activeHref, content) {
  const navHtml = NAV.map((item) => {
    const active = activeHref === item.href || activeHref.startsWith(item.href.replace(".html", ""));
    return `<a href="${item.href}" class="nav-link${active ? " active" : ""}">${svg(item.icon)}<span>${item.label}</span></a>`;
  }).join("");

  document.body.innerHTML = `
    <div class="app-shell">
      <div class="sidebar-overlay" id="sidebar-overlay"></div>
      <aside class="sidebar" id="sidebar">
        <a href="index.html" class="sidebar-brand">
          <div class="sidebar-logo">${svg("zap")}</div>
          <div class="sidebar-brand-text">
            <h1>${DEMO.appName}</h1>
            <p>Concept Generator</p>
          </div>
        </a>
        <nav class="sidebar-nav">${navHtml}</nav>
        <div class="sidebar-footer">
          <div class="pro-banner">
            <strong>Pro · Business</strong>
            ${DEMO.stats.creditsRemaining} кредитов осталось
          </div>
        </div>
      </aside>
      <div class="main-area">
        <header class="top-header">
          <div class="header-left">
            <button type="button" class="menu-btn" id="menu-btn" aria-label="Меню">${svg("menu")}</button>
          </div>
          <div class="header-right">
            <button type="button" class="icon-btn" id="theme-btn" aria-label="Тема">${svg("sun")}</button>
            <div class="user-chip">
              <div class="avatar">${DEMO.user.name.charAt(0)}</div>
              <span>${DEMO.user.name}</span>
            </div>
          </div>
        </header>
        <main class="page-content">${content}</main>
      </div>
    </div>`;

  bindShellEvents();
}

function bindShellEvents() {
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("sidebar-overlay");
  document.getElementById("menu-btn")?.addEventListener("click", () => {
    sidebar?.classList.toggle("mobile-open");
    overlay?.classList.toggle("show");
  });
  overlay?.addEventListener("click", () => {
    sidebar?.classList.remove("mobile-open");
    overlay?.classList.remove("show");
  });
  document.getElementById("theme-btn")?.addEventListener("click", () => {
    document.documentElement.classList.toggle("dark");
    const dark = document.documentElement.classList.contains("dark");
    document.getElementById("theme-btn").innerHTML = svg(dark ? "sun" : "moon");
  });
  document.querySelectorAll("[data-demo-action]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      showToast("Демо-режим: действие недоступно без сервера API");
    });
  });
}

function conceptCardHtml(c) {
  const photos = c.items.map((it) => it.image).filter(Boolean);
  const thumb = photos.length
    ? `<div class="thumb-grid">${photos.map((src) => `<img src="${src}" alt="">`).join("")}</div>`
    : `<div class="empty-state" style="padding:3rem"><p>Нет превью</p></div>`;
  const vizBadge = c.hasVisualization ? `<span class="badge badge-primary badge-float">Есть визуализация</span>` : "";
  return `
    <a href="concept-detail.html?id=${c.id}" class="card concept-card">
      <div class="thumb">${vizBadge}${thumb}</div>
      <div class="card-body">
        <div class="row" style="display:flex;justify-content:space-between;gap:0.5rem">
          <div>
            <h3 style="font-weight:600">${c.name}</h3>
            <p class="price">${formatCurrency(c.totalCost)}</p>
          </div>
          <span class="badge badge-secondary">${c.items.length} товаров</span>
        </div>
        <div class="tags">${c.tags.slice(0, 3).map((t) => `<span class="badge badge-outline">${t}</span>`).join("")}</div>
        <p class="desc">${c.description}</p>
      </div>
    </a>`;
}

const PAGES = {
  home() {
    const stats = [
      { label: "Всего проектов", value: formatNumber(DEMO.stats.totalProjects), icon: "layers" },
      { label: "Сгенерировано концепций", value: formatNumber(DEMO.stats.totalConcepts), icon: "sparkles" },
      { label: "Средний бюджет", value: formatCurrency(DEMO.stats.averageBudget), icon: "file" },
      { label: "Использовано кредитов", value: formatNumber(DEMO.stats.creditsUsed), icon: "heart" },
    ];
    return `
      ${demoBanner()}
      <div class="page-header flex">
        <div>
          <h1 class="page-title">Добро пожаловать в <span class="gradient-text">${DEMO.appName}</span></h1>
          <p class="page-subtitle">Создавайте концепции корпоративного мерча с помощью искусственного интеллекта</p>
        </div>
        <a href="generate.html" class="btn btn-primary btn-lg">${svg("sparkles")} Новая генерация</a>
      </div>
      <div class="grid-4" style="margin-bottom:2rem">
        ${stats.map((s) => `
          <div class="card stat-card">
            <div class="card-body">
              <div><p class="stat-label">${s.label}</p><p class="stat-value">${s.value}</p></div>
              <div class="stat-icon">${svg(s.icon)}</div>
            </div>
          </div>`).join("")}
      </div>
      <h2 style="font-size:1.25rem;font-weight:600;margin-bottom:1rem">Недавние проекты</h2>
      <div class="grid-3">
        ${DEMO.projects.map((p) => `
          <a href="concepts-results.html" class="card project-card">
            <div class="card-body">
              <div class="row">
                <h3 style="font-weight:600">${p.title}</h3>
                <span class="badge badge-${p.status === "completed" ? "primary" : "outline"}">${p.status === "completed" ? "Готов" : "Черновик"}</span>
              </div>
              <p class="meta">${p.category} · ${formatCurrency(p.budget)} · ${p.quantity} шт.</p>
              <p class="meta">${p.conceptsCount} концепций · ${formatDate(p.createdAt)}</p>
            </div>
          </a>`).join("")}
      </div>`;
  },

  generate() {
    const b = DEMO.brief;
    return `
      ${demoBanner()}
      <div class="page-header">
        <h1 class="page-title">AI Генерация</h1>
        <p class="page-subtitle">Опишите задачу — AI подберёт набор из каталога или создаст концепцию</p>
      </div>
      <div class="grid-2">
        <div class="card">
          <div class="card-body form-grid">
            <div class="mode-switcher">
              <button type="button" class="mode-btn active">Каталог</button>
              <button type="button" class="mode-btn" data-demo-action>Творчество</button>
            </div>
            <div class="form-group">
              <label>Описание задачи</label>
              <textarea class="textarea" readonly>${b.description}</textarea>
            </div>
            <div class="form-row-2">
              <div class="form-group">
                <label>Категория</label>
                <input class="input" readonly value="${b.category}">
              </div>
              <div class="form-group">
                <label>Товаров в наборе</label>
                <input class="input" readonly value="${b.setItemCount}">
              </div>
            </div>
            <div class="form-row-2">
              <div class="form-group">
                <label>Бюджет на единицу, ₽</label>
                <input class="input" readonly value="${b.budget}">
              </div>
              <div class="form-group">
                <label>Тираж</label>
                <input class="input" readonly value="${b.quantity}">
              </div>
            </div>
            <div class="form-group">
              <label>Цвета бренда</label>
              <div class="color-swatches">
                ${b.colors.map((c) => `<span class="color-swatch" style="background:${c}"></span>`).join("")}
              </div>
            </div>
            <button type="button" class="btn btn-primary btn-lg" data-demo-action>${svg("sparkles")} Сгенерировать 5 концепций</button>
            <p class="hint">В демо нажмите «Посмотреть результаты» справа →</p>
          </div>
        </div>
        <div class="card">
          <div class="card-header"><h2 class="card-title">Быстрый просмотр</h2></div>
          <div class="card-body">
            <p style="color:var(--muted-foreground);margin-bottom:1rem;font-size:0.875rem">Пример уже сгенерированного проекта с 5 концепциями из каталога.</p>
            <a href="concepts-results.html" class="btn btn-outline" style="width:100%;margin-bottom:0.75rem">Посмотреть результаты</a>
            <a href="concept-detail.html?id=concept-1" class="btn btn-secondary" style="width:100%">Открыть набор «Синий и фиолетовый»</a>
          </div>
        </div>
      </div>`;
  },

  concepts() {
    return `
      ${demoBanner()}
      <div class="page-header flex">
        <div>
          <h1 class="page-title">Мои проекты</h1>
          <p class="page-subtitle">${DEMO.projects.length} проектов</p>
        </div>
        <a href="generate.html" class="btn btn-primary">${svg("sparkles")} Новый проект</a>
      </div>
      <div class="grid-3">
        ${DEMO.projects.map((p) => `
          <a href="concepts-results.html" class="card project-card">
            <div class="card-body">
              <div class="row">
                <h3 style="font-weight:600">${p.title}</h3>
                <span class="badge badge-secondary">${p.generationMode === "catalog" ? "Каталог" : "Творчество"}</span>
              </div>
              <p class="meta">${p.category}</p>
              <p class="meta">${formatCurrency(p.budget)} · ${p.quantity} шт. · ${p.conceptsCount} концепций</p>
              <p class="meta">${formatDate(p.createdAt)}</p>
            </div>
          </a>`).join("")}
      </div>`;
  },

  results() {
    return `
      ${demoBanner()}
      <div class="page-header flex">
        <div>
          <h1 class="page-title">Результаты генерации</h1>
          <p class="page-subtitle">${DEMO.concepts.length} концепций от AI-агентов · Welcome IT · Q2</p>
          <p class="page-subtitle" style="font-size:0.875rem;margin-top:0.25rem">Выберите концепцию — на следующем шаге создайте финальную визуализацию</p>
        </div>
        <div class="btn-group">
          <a href="generate.html" class="btn btn-outline">← Назад</a>
          <button type="button" class="btn btn-secondary" data-demo-action>Перегенерировать</button>
        </div>
      </div>
      <div class="grid-3">${DEMO.concepts.map(conceptCardHtml).join("")}</div>`;
  },

  detail() {
    const params = new URLSearchParams(window.location.search);
    const concept = getConceptById(params.get("id") || "concept-1");
    const viz = concept.hasVisualization ? DEMO.visualizations.find((v) => v.conceptId === concept.id) : null;
    const visual = viz
      ? `<img src="${viz.imageUrl}" alt="${concept.name}">`
      : `<div class="thumb-grid" style="height:100%;padding:1rem">${concept.items.map((it) => `<img src="${it.image}" alt="">`).join("")}</div>`;

    return `
      ${demoBanner()}
      <div class="page-header flex">
        <div>
          <a href="concepts-results.html" class="btn btn-outline btn-sm" style="margin-bottom:0.75rem">← К результатам</a>
          <h1 class="page-title">${concept.name}</h1>
          <p class="page-subtitle">${formatCurrency(concept.totalCost)} · ${concept.tags.join(" · ")}</p>
        </div>
        <button type="button" class="btn btn-primary" data-demo-action>${svg("sparkles")} Создать AI-фото</button>
      </div>
      <div class="detail-layout">
        <div>
          <div class="detail-visual">
            ${viz ? `<span class="badge badge-primary badge-float">AI-визуализация</span>` : ""}
            ${visual}
          </div>
        </div>
        <div class="detail-sidebar">
          <div class="card">
            <div class="card-header"><h2 class="card-title">Описание набора</h2></div>
            <div class="card-body"><p style="font-size:0.875rem;color:var(--muted-foreground)">${concept.description}</p></div>
          </div>
          <div class="card">
            <div class="card-header"><h2 class="card-title">Состав набора · ${concept.items.length} товаров</h2></div>
            <div class="card-body product-list">
              ${concept.items.map((it) => `
                <div class="product-row">
                  <img src="${it.image}" alt="">
                  <div style="flex:1">
                    <div class="name">${it.name}</div>
                    ${it.variant ? `<div class="variant">${it.variant}${it.stock ? ` · Остаток: ${formatNumber(it.stock)} шт.` : ""}</div>` : `<div class="variant">${formatCurrency(it.price)}</div>`}
                  </div>
                </div>`).join("")}
            </div>
          </div>
        </div>
      </div>`;
  },

  visualizations() {
    return `
      ${demoBanner()}
      <div class="page-header">
        <h1 class="page-title">Визуализации</h1>
        <p class="page-subtitle">Созданные AI-изображения наборов · ${DEMO.visualizations.length}</p>
      </div>
      ${DEMO.visualizations.length ? `
        <div class="grid-3">
          ${DEMO.visualizations.map((v) => `
            <a href="concept-detail.html?id=${v.conceptId}" class="card">
              <div class="thumb" style="aspect-ratio:1"><img src="${v.imageUrl}" alt="${v.conceptName}" style="width:100%;height:100%;object-fit:cover"></div>
              <div class="card-body">
                <h3 style="font-weight:600">${v.conceptName}</h3>
                <p class="meta">${formatDate(v.createdAt)}</p>
              </div>
            </a>`).join("")}
        </div>` : `<div class="card empty-state"><p>Нет визуализаций</p></div>`}`;
  },

  proposals() {
    return `${demoBanner()}<div class="page-header"><h1 class="page-title">КП и презентации</h1></div><div class="card empty-state"><p>Раздел в разработке</p><p style="margin-top:0.5rem;font-size:0.875rem">Здесь будут коммерческие предложения и презентации</p></div>`;
  },

  brandbooks() {
    return `${demoBanner()}<div class="page-header"><h1 class="page-title">Брендбук и лого</h1><p class="page-subtitle">Загруженные файлы бренда (демо)</p></div>
      <div class="grid-2">
        <div class="card"><div class="card-body"><h3 style="font-weight:600;margin-bottom:0.5rem">Логотип</h3><div style="height:120px;background:var(--secondary);border-radius:0.75rem;display:flex;align-items:center;justify-content:center;color:var(--muted-foreground)">LOGO · заглушка</div></div></div>
        <div class="card"><div class="card-body"><h3 style="font-weight:600;margin-bottom:0.5rem">Брендбук PDF</h3><div style="height:120px;background:var(--secondary);border-radius:0.75rem;display:flex;align-items:center;justify-content:center;color:var(--muted-foreground)">brandbook-demo.pdf</div></div></div>
      </div>`;
  },

  templates() {
    return `${demoBanner()}<div class="page-header flex"><div><h1 class="page-title">Шаблоны задач</h1><p class="page-subtitle">${DEMO.templates.length} шаблонов</p></div><button class="btn btn-primary btn-sm" data-demo-action>+ Создать</button></div>
      <div class="grid-3">${DEMO.templates.map((t) => `
        <div class="card"><div class="card-body"><span class="badge badge-outline">${t.category}</span><h3 style="font-weight:600;margin:0.5rem 0">${t.name}</h3><p style="font-size:0.875rem;color:var(--muted-foreground)">${t.description}</p><button class="btn btn-outline btn-sm" style="margin-top:1rem" data-demo-action>Использовать</button></div></div>`).join("")}</div>`;
  },

  favorites() {
    return `${demoBanner()}<div class="page-header"><h1 class="page-title">Избранное</h1></div><div class="card empty-state"><p>Добавьте концепции в избранное на странице результатов</p><a href="concepts-results.html" class="btn btn-outline" style="margin-top:1rem">К концепциям</a></div>`;
  },

  settings() {
    return `${demoBanner()}<div class="page-header"><h1 class="page-title">Настройки</h1></div>
      <div class="card" style="max-width:480px"><div class="card-body form-grid">
        <div class="form-group"><label>Имя</label><input class="input" readonly value="${DEMO.user.name}"></div>
        <div class="form-group"><label>Тариф</label><input class="input" readonly value="${DEMO.user.plan}"></div>
        <div class="form-group"><label>Кредиты</label><input class="input" readonly value="${DEMO.stats.creditsRemaining} из 50"></div>
        <button class="btn btn-outline" data-demo-action>Сохранить</button>
      </div></div>`;
  },
};

const PAGE_MAP = {
  "index.html": "home",
  "generate.html": "generate",
  "concepts.html": "concepts",
  "concepts-results.html": "results",
  "concept-detail.html": "detail",
  "visualizations.html": "visualizations",
  "proposals.html": "proposals",
  "brandbooks.html": "brandbooks",
  "templates.html": "templates",
  "favorites.html": "favorites",
  "settings.html": "settings",
};

function init() {
  const page = document.documentElement.dataset.page;
  const file = page || location.pathname.split("/").pop() || "index.html";
  const renderer = PAGES[PAGE_MAP[file] || "home"];
  if (renderer) renderShell(file, renderer());
}

document.addEventListener("DOMContentLoaded", init);
