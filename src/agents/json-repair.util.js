"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractJsonObject = extractJsonObject;
exports.repairAgentJsonText = repairAgentJsonText;
exports.truncateToLastCompleteIdeaObject = truncateToLastCompleteIdeaObject;
exports.extractIdeasByRegex = extractIdeasByRegex;
exports.extractCriticTopByRegex = extractCriticTopByRegex;
exports.parseAgentJson = parseAgentJson;
exports.parseIdeatorOutput = parseIdeatorOutput;
exports.parseCatalogIdeatorOutput = parseCatalogIdeatorOutput;
exports.parseCriticOutput = parseCriticOutput;
function extractJsonObject(text) {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenced)
        return fenced[1].trim();
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start)
        return text.slice(start, end + 1);
    return text.trim();
}
function errorPosition(err) {
    if (!(err instanceof Error))
        return null;
    const m = err.message.match(/position (\d+)/);
    return m ? Number(m[1]) : null;
}
function repairAgentJsonText(jsonText) {
    let s = jsonText.trim();
    s = s
        .replace(/,\s*([}\]])/g, '$1')
        .replace(/[\u0000-\u001F]+/g, ' ');
    s = s.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)'(\s*:)/g, '$1"$2"$3');
    s = s.replace(/"([a-zA-Z_][a-zA-Z0-9_]*)'(\s*:)/g, '"$1"$2');
    s = s.replace(/\\'(\s*:)/g, '"$1');
    s = s.replace(/:\s*'([^'\\]*(?:\\.[^'\\]*)*)'/g, ': "$1"');
    s = s.replace(/\[\s*'([^'\\]*(?:\\.[^'\\]*)*)'/g, '["$1"');
    s = s.replace(/,\s*'([^'\\]*(?:\\.[^'\\]*)*)'/g, ', "$1"');
    s = s.replace(/}\s*}\s*$/g, '}');
    return closeTruncatedJson(s);
}
function truncateToLastCompleteIdeaObject(jsonText, maxPos) {
    const text = maxPos != null && maxPos > 0 ? jsonText.slice(0, maxPos) : jsonText;
    const arrayKey = text.includes('"topIdeas"') ? '"topIdeas"' : '"ideas"';
    const arrayIdx = text.indexOf(arrayKey);
    if (arrayIdx < 0)
        return closeTruncatedJson(text);
    const lastComplete = text.lastIndexOf('},');
    if (lastComplete > arrayIdx) {
        return closeTruncatedJson(`${text.slice(0, lastComplete + 1)}]}`);
    }
    const lastBrace = text.lastIndexOf('}');
    if (lastBrace > arrayIdx) {
        const slice = text.slice(0, lastBrace + 1);
        return closeTruncatedJson(slice.includes(']') ? `${slice}}` : `${slice}]}`);
    }
    return closeTruncatedJson(text);
}
function closeTruncatedJson(s) {
    let openCurly = 0;
    let openSquare = 0;
    let inString = false;
    let escape = false;
    for (const ch of s) {
        if (escape) {
            escape = false;
            continue;
        }
        if (ch === '\\') {
            escape = true;
            continue;
        }
        if (ch === '"') {
            inString = !inString;
            continue;
        }
        if (inString)
            continue;
        if (ch === '{')
            openCurly++;
        if (ch === '}')
            openCurly--;
        if (ch === '[')
            openSquare++;
        if (ch === ']')
            openSquare--;
    }
    let out = s.replace(/,\s*$/, '').replace(/:\s*$/, '').replace(/"\s*$/, '');
    if (inString)
        out += '"';
    while (openSquare > 0) {
        out += ']';
        openSquare--;
    }
    while (openCurly > 0) {
        out += '}';
        openCurly--;
    }
    return out;
}
function extractIdeasByRegex(text) {
    const ideas = [];
    const blockRe = /"title"\s*:\s*"((?:[^"\\]|\\.)*)"\s*,\s*"description"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
    let m;
    while ((m = blockRe.exec(text)) !== null) {
        const title = m[1].replace(/\\"/g, '"').replace(/\\n/g, ' ').trim();
        const description = m[2].replace(/\\"/g, '"').replace(/\\n/g, ' ').trim();
        if (!title || !description)
            continue;
        ideas.push({
            title: title.slice(0, 80),
            description: description.slice(0, 800),
            items: [],
            styleTags: [],
            colorPalette: [],
            whyItFits: '',
        });
    }
    return ideas;
}
function extractCriticTopByRegex(text) {
    const top = [];
    const blockRe = /"title"\s*:\s*"((?:[^"\\]|\\.)*)"\s*,\s*"(?:briefFitScore|score)"\s*:\s*(\d+)\s*,\s*"conceptSummary"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
    let m;
    while ((m = blockRe.exec(text)) !== null) {
        const title = m[1].replace(/\\"/g, '"').replace(/\\n/g, ' ').trim();
        const conceptSummary = m[3].replace(/\\"/g, '"').replace(/\\n/g, ' ').trim();
        const score = Number(m[2]) || 80;
        if (!title || !conceptSummary)
            continue;
        top.push({
            title: title.slice(0, 80),
            score,
            briefFitScore: score,
            conceptSummary: conceptSummary.slice(0, 800),
            reasons: ['Соответствует брифу'],
            risks: [],
            suggestedEdits: [],
        });
    }
    return top;
}
function parseAgentJson(content) {
    const jsonText = extractJsonObject(content.trim());
    const candidates = [
        jsonText,
        repairAgentJsonText(jsonText),
        repairAgentJsonText(jsonText.replace(/'/g, '"')),
    ];
    let lastErr;
    for (let i = 0; i < candidates.length; i++) {
        const candidate = candidates[i];
        try {
            return JSON.parse(candidate);
        }
        catch (err) {
            lastErr = err;
            const pos = errorPosition(err);
            if (pos != null) {
                candidates.push(truncateToLastCompleteIdeaObject(candidate, pos));
                candidates.push(truncateToLastCompleteIdeaObject(jsonText, pos));
            }
        }
    }
    const msg = lastErr instanceof Error ? lastErr.message : String(lastErr);
    throw new Error(`JSON parse error: ${msg} (length ${jsonText.length})`);
}
function parseIdeatorOutput(content) {
    const jsonText = extractJsonObject(content.trim());
    try {
        return parseAgentJson(content);
    }
    catch (err) {
        const pos = errorPosition(err);
        const salvageCandidates = [
            truncateToLastCompleteIdeaObject(jsonText, pos ?? undefined),
            truncateToLastCompleteIdeaObject(jsonText),
            repairAgentJsonText(truncateToLastCompleteIdeaObject(jsonText, pos ?? undefined)),
        ];
        for (const candidate of salvageCandidates) {
            try {
                const parsed = JSON.parse(candidate);
                if (parsed.ideas?.length >= 12)
                    return parsed;
            }
            catch {
            }
        }
        const regexIdeas = extractIdeasByRegex(jsonText);
        if (regexIdeas.length >= 12) {
            return { ideas: regexIdeas };
        }
        throw err;
    }
}
function parseCatalogIdeatorOutput(content) {
    const jsonText = extractJsonObject(content.trim());
    try {
        return parseAgentJson(content);
    }
    catch (err) {
        const pos = errorPosition(err);
        const salvageCandidates = [
            truncateToLastCompleteIdeaObject(jsonText, pos ?? undefined),
            truncateToLastCompleteIdeaObject(jsonText),
            repairAgentJsonText(truncateToLastCompleteIdeaObject(jsonText, pos ?? undefined)),
        ];
        for (const candidate of salvageCandidates) {
            try {
                const parsed = JSON.parse(candidate);
                if (parsed.ideas?.length >= 8)
                    return parsed;
            }
            catch {
            }
        }
        throw err;
    }
}
function parseCriticOutput(content) {
    const jsonText = extractJsonObject(content.trim());
    let lastErr;
    try {
        const parsed = parseAgentJson(content);
        if (parsed.topIdeas?.length >= 5)
            return parsed;
    }
    catch (err) {
        lastErr = err;
    }
    const pos = errorPosition(lastErr);
    const salvageCandidates = [
        truncateToLastCompleteIdeaObject(jsonText, pos ?? undefined),
        truncateToLastCompleteIdeaObject(jsonText),
        repairAgentJsonText(truncateToLastCompleteIdeaObject(jsonText, pos ?? undefined)),
    ];
    for (const candidate of salvageCandidates) {
        try {
            const parsed = JSON.parse(candidate);
            if (parsed.topIdeas?.length >= 5)
                return parsed;
        }
        catch {
        }
    }
    const regexTop = extractCriticTopByRegex(jsonText);
    if (regexTop.length >= 5) {
        return { topIdeas: regexTop.slice(0, 5) };
    }
    if (lastErr)
        throw lastErr;
    throw new Error(`Critic JSON parse failed (length ${jsonText.length})`);
}
//# sourceMappingURL=json-repair.util.js.map