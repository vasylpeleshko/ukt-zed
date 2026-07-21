import { Injectable } from '@nestjs/common';
import { NormalizedQuery, RuleHint } from '../domain/classification.types';
import { GROUP_SEMANTICS } from '../domain/search-context.builder';

interface RuleDefinition {
  patterns: RegExp[];
  hint: Omit<RuleHint, 'boost' | 'reason'> & { reason: string; boost?: number };
}

const RULES: RuleDefinition[] = [
  {
    patterns: [/мотуз|шпагат|канат|трос|cord|rope/i],
    hint: {
      groupCodes: ['56'],
      codePrefixes: ['5607', '5608'],
      reason: 'Текстильні шнурові вироби — група 56',
      boost: 0.15,
    },
  },
  {
    patterns: [/поліпропіл|polyprop|pp/i],
    hint: {
      codePrefixes: ['5607 41', '3920', '3921'],
      reason: 'Поліпропілен — упаковка або шнурові вироби',
      boost: 0.1,
    },
  },
  {
    patterns: [/молок|вершк|сир|йогур|молочн/i],
    hint: {
      groupCodes: ['04'],
      codePrefixes: ['0401', '0402', '0403', '0404', '0405', '0406'],
      reason: 'Молочні продукти — група 04',
      boost: 0.15,
    },
  },
  {
    patterns: [/свинин|ялович|курят|м'яс|м’яс|мясо/i],
    hint: {
      groupCodes: ['02'],
      codePrefixes: ['0201', '0202', '0203', '0204', '0206', '0207'],
      reason: "М'ясні продукти — група 02",
      boost: 0.15,
    },
  },
  {
    patterns: [/відруб|обвален/i],
    hint: {
      groupCodes: ['02'],
      codePrefixes: ['0201', '0202', '0203', '0204', '0206', '0207'],
      keywords: ['обвален', 'відруб'],
      reason: "М'ясні відруби — група 02, уточнити вид тварини",
      boost: 0.18,
    },
  },
  {
    patterns: [/заморож/i],
    hint: {
      keywords: ['заморож'],
      reason: 'Заморожений продукт — уточнити підпозицію за ступенем обробки',
      boost: 0.08,
    },
  },
  {
    patterns: [/короп|риба|лосось|тунец|тунець|cyprinus|fish/i],
    hint: {
      groupCodes: ['03'],
      codePrefixes: ['0301', '0302', '0303', '0304'],
      reason: 'Риба та водяні організми — група 03',
      boost: 0.15,
    },
  },
  {
    patterns: [/(?:^|\s)(?:мінеральн[аи]|питн[аи]|газован[аи])\s+вод[ауи]|(?:^|\s)вод[аи](?:\s|$)/i],
    hint: {
      groupCodes: ['22'],
      codePrefixes: ['2201', '2202'],
      reason: 'Напої — група 22',
      boost: 0.15,
    },
  },
  {
    patterns: [/газован|sparkling|carbon/i],
    hint: {
      codePrefixes: ['2201 10'],
      reason: 'Газована вода — позиція 2201',
      boost: 0.1,
    },
  },
  {
    patterns: [/кав|coffee/i],
    hint: {
      groupCodes: ['09'],
      codePrefixes: ['0901'],
      reason: 'Кава — група 09',
      boost: 0.15,
    },
  },
  {
    patterns: [/одяг|сороч|футбол|штан|куртк|dress|shirt/i],
    hint: {
      groupCodes: ['61', '62', '63'],
      reason: 'Одяг і текстильні вироби — групи 61-63',
      boost: 0.12,
    },
  },
  {
    patterns: [/пластмас|polymer|plastic/i],
    hint: {
      groupCodes: ['39'],
      reason: 'Пластмаси — група 39',
      boost: 0.12,
    },
  },
];

@Injectable()
export class RulesEngineService {
  analyze(query: NormalizedQuery): RuleHint[] {
    const text = query.normalized;
    const hints: RuleHint[] = [];

    for (const rule of RULES) {
      if (rule.patterns.some((p) => p.test(text))) {
        hints.push({
          groupCodes: rule.hint.groupCodes,
          codePrefixes: rule.hint.codePrefixes,
          keywords: rule.hint.keywords,
          boost: rule.hint.boost ?? 0.1,
          reason: rule.hint.reason,
          preferGeneric: query.isVague,
        });
      }
    }

    if (query.isVague && hints.length === 0) {
      for (const token of query.tokens) {
        for (const [groupCode, meta] of Object.entries(GROUP_SEMANTICS)) {
          if (meta.keywords.some((k) => k === token || token.startsWith(k))) {
            hints.push({
              groupCodes: [groupCode],
              preferGeneric: true,
              boost: 0.18,
              reason: `Загальний запит "${token}" — група ${groupCode}, пріоритет "інші"`,
            });
          }
        }
      }
    }

    if (query.isBroad && hints.length > 0) {
      hints.push({
        groupCodes: hints.flatMap((h) => h.groupCodes ?? []),
        boost: 0.05,
        reason: `Загальний запит "${query.tokens[0]}" — показати різні види/підкатегорії, не фіксувати один код`,
      });
    }

    return hints;
  }
}
