import { LlmGenerationInput } from './llm.interface';
import { parseDesiredItemCount } from './parse-desired-count';

/** Ручной выбор в каталоге всегда важнее числа в тексте брифа */
export function shouldRespectUserProducts(input: LlmGenerationInput): boolean {
  return input.productNames.length > 0;
}
