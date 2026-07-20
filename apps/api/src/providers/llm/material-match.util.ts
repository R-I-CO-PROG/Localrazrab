/**
 * Текстовый матч материала («кожа», «дерево») по имени/описанию товара — в БД нет структурного
 * поля материала. Наивный .includes(word) не ловит падежные формы («кожа» не матчит «кожи»/
 * «кожаный»/«кожаных» — разные окончания), поэтому сравниваем по СТЕМУ (корню без окончания).
 */

const ENDINGS_RE = /(ического|ическая|ическое|ические|ичного|ичная|ичное|ичные|ыми|ими|ого|его|ому|ему|ыми|ыми|ая|яя|ое|ее|ые|ие|ых|их|ой|ей|ым|им|а|я|о|е|ы|и|у|ю|ь|й)$/i;

/** Стем слова материала: срезает падежное/родовое окончание, если корень остаётся ≥3 симв. */
export function materialStem(word: string): string {
  const w = (word || '').trim().toLowerCase().replace(/ё/g, 'е');
  const m = w.match(ENDINGS_RE);
  if (m && w.length - m[0].length >= 3) return w.slice(0, -m[0].length);
  return w;
}

/** Упоминания материала в контексте мелкого элемента брендирования (нашивка/шильд/патч под
 *  лого), а НЕ материала самого товара — «сумка из пластика... шильд из эко кожи под лого» не
 *  делает сумку кожаной. Вырезаем такие предложения перед матчем, иначе товар ложно считается
 *  «уже подходящим» и настоящий своп на материал-товар не срабатывает. */
const ACCESSORY_LABEL_RE = /(нашивк\w*|шильд\w*|патч\w*|лейбл\w*|бирк\w*|контакт\w*\s+с\s+кож\w*)/i;

/** Текст (имя+описание товара) содержит материал в ЛЮБОЙ падежной форме (по стему), исключая
 *  упоминания материала в мелких элементах брендирования (нашивка/шильд/патч/лейбл/бирка). */
export function textMatchesMaterial(text: string, material: string): boolean {
  const stem = materialStem(material);
  if (!stem) return false;
  const clean = (text || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => !ACCESSORY_LABEL_RE.test(sentence))
    .join(' ');
  return clean.includes(stem);
}

/** Товар со структурным полем material (проставлено LLM-тегированием каталога) — сравниваем
 *  ПО СТЕМУ напрямую, без риска ложных срабатываний на нашивках/лейблах/чужом контексте, которым
 *  подвержен текстовый поиск. Если у товара material не проставлен (LLM не нашёл материал в
 *  тексте при тегировании — ~15% каталога), откатываемся на текстовый поиск по name+description
 *  как раньше. */
export function productMatchesMaterial(
  product: { material?: string | null; name?: string | null; description?: string | null },
  material: string,
): boolean {
  const needle = materialStem(material);
  if (!needle) return false;
  if (product.material) {
    const productStem = materialStem(product.material);
    return productStem === needle || productStem.includes(needle) || needle.includes(productStem);
  }
  return textMatchesMaterial(`${product.name || ''} ${product.description || ''}`, material);
}
