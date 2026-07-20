#!/usr/bin/env node
/**
 * Prisma schema → apps/web/src/data/logic/schema-tables.json
 * Also copies to Desktop logic/data for localhost:3100
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const SCHEMA = join(ROOT, 'apps', 'web', 'prisma', 'schema.prisma');
const OUT_WEB = join(ROOT, 'apps', 'web', 'src', 'data', 'logic', 'schema-tables.json');
const OUT_LOGIC = join(ROOT, '..', 'logic', 'data', 'schema-tables.json');

const GROUPS = {
  User: 'Auth',
  Session: 'Auth',
  Account: 'Auth',
  Verification: 'Auth',
  CreditLog: 'Auth',
  Product: 'Catalog',
  Request: 'Generation',
  AgentRun: 'Generation',
  Generation: 'Generation',
  VisualizationVariant: 'Generation',
  RequestItem: 'Generation',
  Asset: 'Generation',
};

function parseSchema(text) {
  const enums = new Map();
  const enumRe = /enum (\w+) \{([^}]*)\}/g;
  let m;
  while ((m = enumRe.exec(text))) {
    enums.set(
      m[1],
      m[2]
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean),
    );
  }

  const tables = [];
  const modelRe = /model (\w+) \{([\s\S]*?)\n\}/g;
  while ((m = modelRe.exec(text))) {
    const model = m[1];
    const body = m[2];
    let tableName = model;
    const fields = [];

    for (const rawLine of body.split('\n')) {
      const line = rawLine.trim();
      if (!line || line.startsWith('//')) continue;

      const mapMatch = line.match(/^@@map\("([^"]+)"\)/);
      if (mapMatch) {
        tableName = mapMatch[1];
        continue;
      }
      if (line.startsWith('@@')) continue;

      const fieldMatch = line.match(/^(\w+)\s+(\w+)(\[\])?(\?)?(.*)$/);
      if (!fieldMatch) continue;

      const [, name, type, isList, optional, rest] = fieldMatch;
      const attrs = rest.trim();
      const isRelation = !['String', 'Int', 'Float', 'Boolean', 'DateTime', 'Json'].includes(type) &&
        !enums.has(type);
      const typeLabel = `${type}${optional ? '?' : ''}${isList ? '[]' : ''}`;

      let key = '';
      if (attrs.includes('@id')) key = 'PK';
      else if (attrs.includes('@unique')) key = 'UK';
      if (attrs.includes('references:')) key = key ? `${key}, FK` : 'FK';

      let note = '';
      if (isRelation) {
        if (isList) {
          note = `1:N → ${type}`;
        } else {
          const refMatch = attrs.match(/fields:\s*\[([^\]]+)\]/);
          note = refMatch ? `FK → ${refMatch[1].trim()}` : `→ ${type}`;
        }
      } else if (enums.has(type)) {
        note = enums.get(type).join(' | ');
      }

      fields.push({
        name,
        type: typeLabel,
        key: key || undefined,
        attributes: attrs.replace(/\/\/.*$/, '').trim() || undefined,
        note: note || undefined,
      });
    }

    tables.push({
      model,
      table: tableName,
      group: GROUPS[model] ?? 'Other',
      fields,
    });
  }

  return { generatedAt: new Date().toISOString(), source: 'apps/web/prisma/schema.prisma', tables };
}

const payload = parseSchema(readFileSync(SCHEMA, 'utf8'));
writeFileSync(OUT_WEB, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

try {
  mkdirSync(dirname(OUT_LOGIC), { recursive: true });
  writeFileSync(OUT_LOGIC, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
} catch {
  // logic folder optional
}

console.log(`Wrote ${payload.tables.length} tables → ${OUT_WEB}`);
