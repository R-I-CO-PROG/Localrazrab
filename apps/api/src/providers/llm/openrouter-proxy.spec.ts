import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  openRouterProxyDispatcher,
  isOpenRouterProxyConfigured,
  resetOpenRouterProxyForTests,
} from './openrouter-proxy.util';

/**
 * OpenRouter за Cloudflare режет IP хостера: прямой запрос → HTTP 403 «Access denied by security
 * policy». Прокси (sing-box) задан в OPENROUTER_PROXY и жив, но клиент генерации КАРТИНОК ходил
 * голым `fetch` — визуализация падала при здоровом прокси. Ещё два клиента (llm-set-builder,
 * openrouter-llm.provider) имели тот же дефект.
 *
 * Сторож ниже падает, если кто-то снова добавит вызов OpenRouter мимо `openRouterFetch`.
 */

describe('диспетчер прокси OpenRouter', () => {
  const saved = process.env.OPENROUTER_PROXY;
  beforeEach(() => resetOpenRouterProxyForTests());
  afterEach(() => {
    if (saved === undefined) delete process.env.OPENROUTER_PROXY;
    else process.env.OPENROUTER_PROXY = saved;
    resetOpenRouterProxyForTests();
  });

  it('прокси не задан → диспетчера нет, работаем напрямую', () => {
    delete process.env.OPENROUTER_PROXY;
    assert.equal(openRouterProxyDispatcher(), undefined);
    assert.equal(isOpenRouterProxyConfigured(), false);
  });

  it('прокси задан → распознаётся; диспетчер зависит от наличия undici', () => {
    process.env.OPENROUTER_PROXY = 'http://127.0.0.1:11080';
    assert.ok(isOpenRouterProxyConfigured());
    // undici — транзитивная зависимость (на сервере есть, в dev может не быть). Функция обязана
    // НЕ бросать в любом случае: с undici вернёт ProxyAgent, без — undefined (прямой fetch).
    assert.doesNotThrow(() => openRouterProxyDispatcher());
  });

  it('результат мемоизирован (одно значение на процесс)', () => {
    process.env.OPENROUTER_PROXY = 'http://127.0.0.1:11080';
    assert.equal(openRouterProxyDispatcher(), openRouterProxyDispatcher());
  });

  it('пустая строка в env не считается прокси', () => {
    process.env.OPENROUTER_PROXY = '   ';
    assert.equal(isOpenRouterProxyConfigured(), false);
    assert.equal(openRouterProxyDispatcher(), undefined);
  });
});

describe('СТОРОЖ: ни один клиент не ходит в OpenRouter мимо прокси', () => {
  const SRC = path.resolve(__dirname, '../..');

  /** Рекурсивный обход .ts, кроме тестов. */
  function walk(dir: string, out: string[] = []): string[] {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p, out);
      else if (e.name.endsWith('.ts') && !e.name.endsWith('.spec.ts')) out.push(p);
    }
    return out;
  }

  it('каждый файл с обращением к openrouter.ai использует openRouterFetch или dispatcher', () => {
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      const src = fs.readFileSync(file, 'utf8');
      // Реальный запрос к OpenRouter — это fetch НА адрес openrouter.ai. Упоминание хоста в тексте
      // ошибки (как в gemini-llm.provider, где fetch идёт на googleapis) не считается.
      let callsOpenRouter = /fetch\s*\(\s*['"]https:\/\/openrouter\.ai/i.test(src); // fetch на литерал
      if (!callsOpenRouter) {
        // fetch на переменную: засчитываем, только если ЭТА переменная присвоена адресу openrouter.ai.
        for (const m of src.matchAll(/\bfetch\s*\(\s*([A-Za-z_$][\w$]*)\b/g)) {
          const v = m[1];
          const assignedToOpenRouter = new RegExp(
            `\\b${v}\\b\\s*=\\s*[^;\\n]*openrouter\\.ai|['"]OPENROUTER_API_URL['"][^;]*openrouter\\.ai`,
            'i',
          ).test(src);
          if (assignedToOpenRouter) {
            callsOpenRouter = true;
            break;
          }
        }
      }
      if (!callsOpenRouter) continue;
      if (/openRouterFetch\s*\(/.test(src) || /dispatcher/.test(src)) continue;
      offenders.push(path.relative(SRC, file));
    }
    assert.deepEqual(
      offenders,
      [],
      `эти клиенты пойдут напрямую с IP хостера и получат 403 — используйте openRouterFetch:\n  ${offenders.join('\n  ')}`,
    );
  });
});
