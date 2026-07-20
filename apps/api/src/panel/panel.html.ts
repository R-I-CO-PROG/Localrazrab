export const PANEL_HTML = /* html */ `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Mercai — локальная панель пайплайна</title>
<style>
  :root {
    --bg: #0f1115; --panel: #171a21; --border: #262b36; --text: #e6e8ec; --muted: #8b93a3;
    --accent: #6d8dff; --accent2: #4ade80; --danger: #f87171; --warn: #fbbf24;
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--text); font: 14px/1.5 -apple-system, Segoe UI, Roboto, sans-serif; }
  header { padding: 16px 24px; border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 12px; }
  header h1 { font-size: 16px; margin: 0; font-weight: 600; }
  header .dot { width: 9px; height: 9px; border-radius: 50%; background: var(--muted); }
  header .dot.ok { background: var(--accent2); }
  header .dot.err { background: var(--danger); }
  main { max-width: 1100px; margin: 0 auto; padding: 24px; display: grid; gap: 20px; }
  .card { background: var(--panel); border: 1px solid var(--border); border-radius: 10px; padding: 18px; }
  .card h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--muted); margin: 0 0 14px; }
  label { display: block; font-size: 12px; color: var(--muted); margin-bottom: 4px; }
  textarea, input, select { width: 100%; background: #0c0e13; border: 1px solid var(--border); color: var(--text);
    border-radius: 6px; padding: 8px 10px; font: inherit; }
  textarea { resize: vertical; min-height: 80px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; }
  .field { margin-bottom: 0; }
  .row { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
  button { background: var(--accent); color: #06070a; border: none; border-radius: 6px; padding: 9px 16px;
    font: inherit; font-weight: 600; cursor: pointer; }
  button.secondary { background: #262b36; color: var(--text); }
  button.ghost { background: transparent; color: var(--muted); border: 1px solid var(--border); }
  button:disabled { opacity: 0.5; cursor: not-allowed; }
  button:hover:not(:disabled) { filter: brightness(1.1); }
  .status-line { display: flex; align-items: center; gap: 10px; font-size: 13px; color: var(--muted); }
  .spinner { width: 14px; height: 14px; border: 2px solid var(--border); border-top-color: var(--accent);
    border-radius: 50%; animation: spin 0.8s linear infinite; display: none; }
  .spinner.on { display: inline-block; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 600; }
  .badge.step { background: #1e2536; color: var(--accent); }
  .badge.ok { background: #0f2e1c; color: var(--accent2); }
  .badge.err { background: #3a1414; color: var(--danger); }
  .ideas { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px; }
  .idea { border: 1px solid var(--border); border-radius: 8px; padding: 12px; cursor: pointer; background: #12151c; }
  .idea:hover { border-color: var(--accent); }
  .idea.chosen { border-color: var(--accent2); background: #0f1c15; }
  .idea .score { float: right; color: var(--accent2); font-weight: 700; }
  .idea h3 { margin: 0 0 6px; font-size: 14px; }
  .idea p { margin: 4px 0; color: var(--muted); font-size: 12.5px; }
  .idea ul { margin: 6px 0 0; padding-left: 18px; font-size: 12px; color: var(--muted); }
  .idea-products { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
  .idea-product { width: 76px; font-size: 10.5px; text-align: center; }
  .idea-product img { width: 76px; height: 76px; object-fit: contain; background: #fff; border-radius: 6px; }
  .idea-product-name { color: var(--muted); margin-top: 3px; overflow: hidden; text-overflow: ellipsis;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
  .idea-product-price { color: var(--accent2); font-weight: 600; }
  pre { background: #0c0e13; border: 1px solid var(--border); border-radius: 6px; padding: 12px;
    overflow: auto; max-height: 420px; font-size: 12px; white-space: pre-wrap; word-break: break-word; }
  details summary { cursor: pointer; color: var(--muted); font-size: 12px; margin-bottom: 8px; }
  .hint { color: var(--muted); font-size: 11.5px; margin-top: 4px; }
  .products { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px; }
  .product { border: 1px solid var(--border); border-radius: 8px; padding: 10px; background: #12151c; font-size: 12.5px; }
  .product img { width: 100%; height: 100px; object-fit: contain; background: #fff; border-radius: 4px; margin-bottom: 6px; }
  .toolbar { display: flex; justify-content: space-between; align-items: center; }
</style>
</head>
<body>
<header>
  <div id="apiDot" class="dot"></div>
  <h1>Mercai — локальная панель пайплайна подбора</h1>
</header>
<main>

  <section class="card">
    <h2>1. Ключ и подключение</h2>
    <div class="grid">
      <div class="field">
        <label>x-api-key (из apps/api/.env → API_SECRET_KEY)</label>
        <input id="apiKey" value="local-dev-secret-change-me" />
      </div>
    </div>
  </section>

  <section class="card">
    <h2>2. Бриф и переменные</h2>
    <div class="field" style="margin-bottom:12px">
      <label>Промт / бриф клиента</label>
      <textarea id="userPrompt" placeholder="Например: корпоративные новогодние подарки для клиентов, 50 штук, бюджет 2000-3000 рублей за набор, тёплые цвета, термос и плед обязательно"></textarea>
    </div>
    <div class="row" style="margin-bottom:16px">
      <button id="btnParse" class="secondary">Распарсить бриф → заполнить поля</button>
      <span class="hint">Локальный парсер (regex), без LLM — быстро проверить какие поля из текста выделяются</span>
    </div>
    <div class="grid">
      <div class="field"><label>Категория</label><input id="category" /></div>
      <div class="field"><label>Кол-во комплектов (quantity)</label><input id="quantity" type="number" min="1" max="1000000" /></div>
      <div class="field"><label>Бюджет от</label><input id="budgetMin" type="number" min="0" max="50000000" /></div>
      <div class="field"><label>Бюджет до</label><input id="budgetMax" type="number" min="0" max="50000000" /></div>
      <div class="field"><label>Товаров в наборе: от</label><input id="minProductsPerSet" type="number" min="1" max="50" /></div>
      <div class="field"><label>Товаров в наборе: до</label><input id="maxProductsPerSet" type="number" min="1" max="50" /></div>
      <div class="field"><label>Кол-во концепций (conceptCount)</label><input id="conceptCount" type="number" min="1" max="10" value="5" /></div>
      <div class="field"><label>Кол-во визуализаций</label><input id="visualizationCount" type="number" min="1" max="5" value="1" /></div>
      <div class="field"><label>Стиль подбора (aiStyle)</label>
        <select id="aiStyle"><option value="creative">creative (LLM с нуля)</option><option value="catalog">catalog (из каталога)</option></select>
      </div>
      <div class="field"><label>Режим генерации (mode)</label>
        <select id="mode"><option value="mockup">mockup (без затрат на картинки)</option><option value="ai">ai (реальная генерация фото)</option></select>
      </div>
    </div>
    <div class="grid" style="margin-top:12px">
      <div class="field"><label>Цвета (через запятую, hex)</label><input id="colors" placeholder="#D4A574, #92400E" /></div>
      <div class="field"><label>Разрешённые категории/товары (через запятую)</label><input id="allowedItems" /></div>
      <div class="field"><label>Запрещённые (через запятую)</label><input id="forbiddenItems" /></div>
    </div>
    <div class="field" style="margin-top:12px"><label>Заметки (notes)</label><textarea id="notes" style="min-height:50px"></textarea></div>
  </section>

  <section class="card">
    <h2>3. Запуск</h2>
    <div class="row">
      <button id="btnRun">Создать заявку и запустить подбор</button>
      <button id="btnRetry" class="ghost" disabled>Повторить (retry)</button>
      <span id="requestIdLabel" class="hint"></span>
    </div>
    <div class="status-line" style="margin-top:12px">
      <span class="spinner" id="spinner"></span>
      <span id="statusBadge" class="badge step">idle</span>
      <span id="statusText"></span>
    </div>
  </section>

  <section class="card" id="ideasCard" style="display:none">
    <h2>4. Концепции (Ideator → Critic)</h2>
    <div class="ideas" id="ideasList"></div>
    <div class="row" style="margin-top:14px">
      <button id="btnGenerate" disabled>Выбрать концепцию и запустить генерацию</button>
      <span id="chosenLabel" class="hint"></span>
    </div>
  </section>

  <section class="card" id="resultCard" style="display:none">
    <h2>5. Результат</h2>
    <div id="productsWrap" class="products"></div>
  </section>

  <section class="card">
    <div class="toolbar"><h2 style="margin:0">Отладка: сырой ответ API</h2></div>
    <details>
      <summary>Показать / скрыть</summary>
      <pre id="rawOutput">—</pre>
    </details>
  </section>

</main>

<script>
const $ = (id) => document.getElementById(id);
let currentRequestId = null;
let pollTimer = null;
let chosenIdeaTitle = null;

function apiKey() { return $('apiKey').value.trim(); }

async function api(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey() },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) {
    const err = new Error((data && data.message) ? JSON.stringify(data.message) : res.statusText);
    err.data = data;
    throw err;
  }
  return data;
}

function setRaw(data) {
  $('rawOutput').textContent = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
}

function setStatus(badgeText, badgeClass, text, spinning) {
  const b = $('statusBadge');
  b.textContent = badgeText;
  b.className = 'badge ' + badgeClass;
  $('statusText').textContent = text || '';
  $('spinner').classList.toggle('on', !!spinning);
}

async function checkHealth() {
  try {
    await fetch('/health');
    $('apiDot').className = 'dot ok';
  } catch {
    $('apiDot').className = 'dot err';
  }
}
checkHealth();
setInterval(checkHealth, 15000);

function splitCsv(v) {
  return v.split(',').map((s) => s.trim()).filter(Boolean);
}

$('btnParse').addEventListener('click', async () => {
  const userPrompt = $('userPrompt').value.trim();
  if (userPrompt.length < 8) { alert('Введите бриф (минимум 8 символов)'); return; }
  try {
    setStatus('parsing', 'step', 'Парсим бриф локальным парсером…', true);
    const data = await api('POST', '/requests/parse-brief', { userPrompt });
    setRaw(data);
    if (data.category) $('category').value = data.category;
    if (data.quantity != null) $('quantity').value = data.quantity;
    if (data.budgetMin != null) $('budgetMin').value = data.budgetMin;
    if (data.budgetMax != null) $('budgetMax').value = data.budgetMax;
    if (data.colors) $('colors').value = data.colors.join(', ');
    if (data.allowedItems) $('allowedItems').value = data.allowedItems.join(', ');
    if (data.forbiddenItems) $('forbiddenItems').value = data.forbiddenItems.join(', ');
    setStatus('parsed', 'ok', 'Поля заполнены (source: ' + (data.source || '?') + ')', false);
  } catch (e) {
    setStatus('error', 'err', e.message, false);
    setRaw(e.data || String(e));
  }
});

function collectFields() {
  // Пусто ИЛИ вне min/max инпута (например, стрелкой вниз довели 1 до 0) — не шлём поле вовсе,
  // пусть бэкенд возьмёт своё значение по умолчанию, а не 400 "must not be less than 1".
  const num = (id) => {
    const el = $(id);
    const v = el.value;
    if (v === '') return undefined;
    const n = Number(v);
    if (Number.isNaN(n)) return undefined;
    if (el.min !== '' && n < Number(el.min)) return undefined;
    if (el.max !== '' && n > Number(el.max)) return undefined;
    return n;
  };
  return {
    userPrompt: $('userPrompt').value.trim() || undefined,
    category: $('category').value.trim() || undefined,
    quantity: num('quantity'),
    budgetMin: num('budgetMin'),
    budgetMax: num('budgetMax'),
    minProductsPerSet: num('minProductsPerSet'),
    maxProductsPerSet: num('maxProductsPerSet'),
    conceptCount: num('conceptCount'),
    visualizationCount: num('visualizationCount'),
    colors: splitCsv($('colors').value),
    allowedItems: splitCsv($('allowedItems').value),
    forbiddenItems: splitCsv($('forbiddenItems').value),
    notes: $('notes').value.trim() || undefined,
  };
}

$('btnRun').addEventListener('click', async () => {
  $('ideasCard').style.display = 'none';
  $('resultCard').style.display = 'none';
  $('btnGenerate').disabled = true;
  chosenIdeaTitle = null;
  try {
    setStatus('creating', 'step', 'Создаём заявку…', true);
    const fields = collectFields();
    if (!fields.userPrompt) { alert('Заполните бриф'); setStatus('idle', 'step', '', false); return; }
    const created = await api('POST', '/requests', { userPrompt: fields.userPrompt });
    currentRequestId = created.id;
    $('requestIdLabel').textContent = 'requestId: ' + currentRequestId;

    setStatus('updating', 'step', 'Заполняем параметры…', true);
    await api('PATCH', '/requests/' + currentRequestId, fields);

    setStatus('queued', 'step', 'Запускаем agent-run (Ideator → Critic)…', true);
    const aiStyle = $('aiStyle').value;
    await api('POST', '/requests/' + currentRequestId + '/agent-run', { aiStyle });

    $('btnRetry').disabled = false;
    pollAgentRun();
  } catch (e) {
    setStatus('error', 'err', e.message, false);
    setRaw(e.data || String(e));
  }
});

$('btnRetry').addEventListener('click', async () => {
  if (!currentRequestId) return;
  try {
    setStatus('retrying', 'step', 'Повторный запуск…', true);
    await api('POST', '/requests/' + currentRequestId + '/agent-run/retry', {});
    pollAgentRun();
  } catch (e) {
    setStatus('error', 'err', e.message, false);
    setRaw(e.data || String(e));
  }
});

function pollAgentRun() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(async () => {
    try {
      const run = await api('GET', '/requests/' + currentRequestId + '/agent-run');
      setRaw(run);
      setStatus(run.status, run.status === 'failed' ? 'err' : (run.status === 'awaiting_idea_selection' ? 'ok' : 'step'),
        'Шаг: ' + (run.currentStep || '—'), run.status === 'running' || run.status === 'queued');

      if (run.status === 'awaiting_idea_selection' || run.status === 'idea_selected') {
        clearInterval(pollTimer);
        renderIdeas(run);
      } else if (run.status === 'failed') {
        clearInterval(pollTimer);
        setStatus('failed', 'err', run.error || 'Ошибка пайплайна', false);
      }
    } catch (e) {
      clearInterval(pollTimer);
      setStatus('error', 'err', e.message, false);
      setRaw(e.data || String(e));
    }
  }, 3000);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderIdeas(run) {
  // conceptsOutput — единственный источник реальных товаров (catalogProducts с фото/ценой/id);
  // criticOutput.topIdeas — единственный источник reasons/risks от критика. Обе структуры
  // существуют независимо (см. agent-run.processor.ts) и собираются здесь по title.
  const concepts = run.conceptsOutput || [];
  const critiqued = new Map(((run.criticOutput && run.criticOutput.topIdeas) || []).map((t) => [t.title, t]));
  const ideas = concepts.length ? concepts : [...critiqued.values()];

  const list = $('ideasList');
  list.innerHTML = '';
  ideas.forEach((idea) => {
    const critic = critiqued.get(idea.title);
    const reasons = ((critic && critic.reasons) || idea.reasons || []).map((r) => '<li>' + r + '</li>').join('');
    const products = idea.catalogProducts || [];
    const productsHtml = products.length
      ? '<div class="idea-products">' +
        products
          .map(
            (p) =>
              '<div class="idea-product" title="' + escapeHtml(p.name || '') + '">' +
              (p.imageUrl || p.image
                ? '<img src="' + (p.imageUrl || p.image) + '" onerror="this.style.display=\\'none\\'" />'
                : '') +
              '<div class="idea-product-name">' + escapeHtml(p.name || '') + '</div>' +
              '<div class="idea-product-price">' + (p.price != null ? Math.round(p.price) + ' ₽' : '') + '</div>' +
              '</div>',
          )
          .join('') +
        '</div>'
      : '<p class="hint">Товары не подобраны (пустой catalogProducts) — только текстовая идея.</p>';

    const div = document.createElement('div');
    div.className = 'idea';
    div.innerHTML =
      '<span class="score">' + (idea.score ?? (critic && critic.score) ?? '') + '</span>' +
      '<h3>' + (idea.title || 'Без названия') + '</h3>' +
      '<p>' + (idea.narrative || idea.description || (critic && critic.conceptSummary) || idea.whyItFits || '') + '</p>' +
      (reasons ? '<ul>' + reasons + '</ul>' : '') +
      productsHtml;
    div.addEventListener('click', () => {
      document.querySelectorAll('.idea.chosen').forEach((el) => el.classList.remove('chosen'));
      div.classList.add('chosen');
      chosenIdeaTitle = idea.title;
      $('chosenLabel').textContent = 'Выбрано: ' + chosenIdeaTitle;
      $('btnGenerate').disabled = false;
    });
    list.appendChild(div);
  });
  $('ideasCard').style.display = ideas.length ? 'block' : 'none';
}

$('btnGenerate').addEventListener('click', async () => {
  if (!currentRequestId || !chosenIdeaTitle) return;
  try {
    setStatus('selecting', 'step', 'Фиксируем выбранную концепцию…', true);
    await api('POST', '/requests/' + currentRequestId + '/agent-run/select', { chosenIdeaTitle });

    setStatus('generating', 'step', 'Запускаем генерацию (подбор товаров + визуализация)…', true);
    const mode = $('mode').value;
    const aiStyle = $('aiStyle').value;
    await api('POST', '/requests/' + currentRequestId + '/generate', { mode, aiStyle, chosenIdeaTitle });

    pollGeneration();
  } catch (e) {
    setStatus('error', 'err', e.message, false);
    setRaw(e.data || String(e));
  }
});

function pollGeneration() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(async () => {
    try {
      const req = await api('GET', '/requests/' + currentRequestId);
      setRaw(req);
      const status = req.status;
      setStatus(status, status === 'ready' ? 'ok' : (status === 'error' ? 'err' : 'step'),
        req.generationProgress ? JSON.stringify(req.generationProgress) : '', status === 'generating');

      if (status === 'ready' || status === 'error') {
        clearInterval(pollTimer);
        if (status === 'ready') renderProducts(req);
      }
    } catch (e) {
      clearInterval(pollTimer);
      setStatus('error', 'err', e.message, false);
      setRaw(e.data || String(e));
    }
  }, 3000);
}

function renderProducts(req) {
  const wrap = $('productsWrap');
  wrap.innerHTML = '';
  const items = req.items || [];
  items.forEach((it) => {
    const p = it.product || it;
    const div = document.createElement('div');
    div.className = 'product';
    const img = p.imageUrl || p.imageThumbnailUrl || '';
    div.innerHTML =
      (img ? '<img src="' + img + '" onerror="this.style.display=\\'none\\'" />' : '') +
      '<div>' + (p.name || p.title || it.productId || '') + '</div>' +
      '<div style="color:var(--muted)">' + (p.priceMinor ? (p.priceMinor / 100) + ' ₽' : '') + '</div>';
    wrap.appendChild(div);
  });
  if (req.generation && req.generation.mockupUrl) {
    const div = document.createElement('div');
    div.className = 'product';
    div.style.gridColumn = '1 / -1';
    div.innerHTML = '<img src="' + req.generation.mockupUrl + '" style="height:auto;max-height:360px" />';
    wrap.prepend(div);
  }
  $('resultCard').style.display = 'block';
}
</script>
</body>
</html>
`;
