import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { zodResponseFormat } from 'openai/helpers/zod';
import { z } from 'zod';
import {
  LlmClassifierPort,
  LlmClassificationOutput,
  RuleHint,
  UktzedCandidate,
} from '../../domain/classification.types';

const LlmOutputSchema = z.object({
  code: z.string(),
  confidence: z.number().min(0).max(1),
  reason: z.string(),
});

const OPENAI_TIMEOUT_MS = 30_000;

@Injectable()
export class OpenAiClassifierService implements LlmClassifierPort {
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(private readonly config: ConfigService) {
    this.client = new OpenAI({
      apiKey: this.config.getOrThrow<string>('OPENAI_API_KEY'),
      timeout: OPENAI_TIMEOUT_MS,
    });
    this.model = this.config.get<string>('LLM_MODEL', 'gpt-4o-mini');
  }

  async classify(
    product: string,
    candidates: UktzedCandidate[],
    hints: RuleHint[],
    options?: { isVague?: boolean; isBroad?: boolean },
  ): Promise<LlmClassificationOutput> {
    const candidateList = candidates
      .map((c) => {
        const context = c.searchContext
          ? `\n    контекст: ${c.searchContext.slice(0, 300)}`
          : '';
        return `- ${c.code}: ${c.name} (група ${c.groupCode})${context}`;
      })
      .join('\n');

    const hintList =
      hints.length > 0
        ? hints.map((h) => `- ${h.reason}`).join('\n')
        : 'Немає додаткових hints';

    const vagueRule = options?.isVague
      ? `\nВАЖЛИВО: опис товару ЗАГАЛЬНИЙ (без деталей). Якщо в кандидатах є позиція "інші" в потрібній групі — обирай її, а не конкретний рід/вид. Встанови requiresReview через lower confidence (0.5-0.65).`
      : '';

    const broadRule = options?.isBroad
      ? `\nВАЖЛИВО: запит занадто ЗАГАЛЬНИЙ для одного коду (наприклад, лише "тунець" без виду чи обробки). Не намагайся вгадати найпоширеніший вид. Поверни найбезпечніший код зі списку, але confidence 0.45-0.55 і поясни, що потрібно уточнити вид та обробку (свіжий/морожений/консерви).`
      : '';

    const completion = await this.client.chat.completions.parse({
      model: this.model,
      messages: [
        {
          role: 'system',
          content: `Ти експерт з класифікації товарів за УКТ ЗЕД (Україна).
Обери найточніший код ТІЛЬКИ з наданого списку кандидатів.
Не вигадуй коди, яких немає в списку.
Поверни код у тому форматі, як він є в списку кандидатів.
Поясни вибір українською, посилаючись на матеріал, призначення або ступінь обробки.${vagueRule}${broadRule}`,
        },
        {
          role: 'user',
          content: `Товар: "${product}"

Hints від rules engine:
${hintList}

Кандидати:
${candidateList}`,
        },
      ],
      response_format: zodResponseFormat(LlmOutputSchema, 'classification'),
    });

    const parsed = completion.choices[0]?.message?.parsed;
    if (!parsed) {
      throw new Error('LLM returned empty classification');
    }

    return parsed;
  }
}
