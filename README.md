# УКТ ЗЕД Classifier — Архітектурний документ

> **Статус:** Approved. Реалізація розпочата.
>
> AI-система для автоматичного визначення коду [УКТ ЗЕД](https://zakon.rada.gov.ua/laws/show/2697-IX) (Українська класифікація товарів зовнішньоекономічної діяльності) за текстовим описом товару.

---

## Зміст

1. [Постановка задачі](#1-постановка-задачі)
2. [Джерела даних](#2-джерела-даних)
3. [Загальна архітектура системи](#3-загальна-архітектура-системи)
4. [Підходи до вирішення задачі](#4-підходи-до-вирішення-задачі)
5. [Embeddings та юридична специфіка УКТ ЗЕД](#5-embeddings-та-юридична-специфіка-укт-зед)
6. [Чи починати без embeddings](#6-чи-починати-без-embeddings)
7. [Очікувана точність та складність підтримки](#7-очікувана-точність-та-складність-підтримки)
8. [Глосарій](#8-глосарій)
9. [Рекомендована архітектура MVP](#9-рекомендована-архітектура-mvp)
10. [Технологічний стек](#10-технологічний-стек)
11. [Структура проєкту](#11-структура-проєкту)
12. [API та інтерфейси](#12-api-та-інтерфейси)
13. [Ризики та обмеження](#13-ризики-та-обмеження)
14. [Roadmap після MVP](#14-roadmap-після-mvp)
15. [Відкриті питання для затвердження](#15-відкриті-питання-для-затвердження)

---

## 1. Постановка задачі

### Вхід

Текстовий опис товару від користувача або зовнішньої системи:

```
"мотузка поліпропіленова для пакування"
"свинина заморожена без кісток"
"мінеральна вода газована"
```

### Вихід

Повний код УКТ ЗЕД (10 знаків) з поясненням та оцінкою впевненості:

```json
{
  "code": "5607 41 00 00",
  "name": "Шпагат та мотузки для пакування",
  "group": "56",
  "confidence": 0.87,
  "reason": "Поліпропіленова мотузка для пакування відповідає позиції 5607 41 — шпагат і мотузки з поліетилену або поліпропілену для пакування.",
  "candidates": []
}
```

### Ключові вимоги

| Вимога | Опис |
|---|---|
| **Точність** | Код має існувати в офіційному тарифі — система не повинна «вигадувати» коди |
| **Пояснюваність** | Кожна відповідь містить `reason` — чому обрано саме цей код |
| **Fallback** | При низькій впевненості — повернути top-N кандидатів для ручного вибору |
| **Аудит** | Логування запитів для аналізу помилок і покращення |
| **Розширюваність** | Можливість додати vector search без переписування pipeline |

### Що НЕ входить в MVP

- Автоматичне оновлення тарифу з zakon.rada.gov.ua
- UI / веб-інтерфейс
- Batch-обробка тисяч позицій одночасно
- Інтеграція з ERP/CRM (лише REST API як точка підключення)

---

## 2. Джерела даних

### Офіційні PDF (Митний тариф України, № 2697-IX)

| Файл | Діапазон | Зміст |
|---|---|---|
| **PDF 1** — Групи 01–49 | ~375 стор. | Повні коди позицій для груп 01–49 + зміст усіх 97 груп |
| **PDF 2** — Групи 50–97 | ~376 стор. | Повні коди позицій для груп 50–97 |

**Приклад структури в PDF:**

```
Група 56
Вата, повсть і неткані матеріали; спеціальна пряжа; шпагати, мотузки...

5607  Шпагат, мотузки, канати або троси, з jute або інших...
5607 41 00 00  Шпагат та мотузки для пакування
5607 49 11 00  Плетені або в обплетенні...
```

**Рівні деталізації кодів:**

| Рівень | Формат | Приклад | Кількість (орієнтовно) |
|---|---|---|---|
| Група | 2 цифри | `56` | 97 |
| Позиція | 4 цифри | `5607` | ~1 200 |
| Підпозиція | 6 цифр | `560741` | ~5 000 |
| Повний код | 10 цифр | `5607 41 00 00` | ~10 000+ |

### Додаткові джерела

- Посилання на офіційний класифікатор (zakon.rada.gov.ua) — для верифікації та майбутнього оновлення
- 97 груп — як довідковий рівень для pre-filtering (зменшення search space)

### Стратегія імпорту даних

```
PDF 1 + PDF 2
      ↓
  parse-pdf.ts (one-time / on tariff update)
      ↓
  PostgreSQL: uktzed_positions
      ↓
  tsvector index (FTS) + optional pgvector
```

> **Рішення:** PostgreSQL як єдине сховище замість JSON-in-memory — дані занадто великі для keyword search у RAM, а FTS + GIN index дає швидкий і масштабований пошук.

---

## 3. Загальна архітектура системи

### High-level diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        Presentation Layer                        │
│              REST API (NestJS)  │  CLI (nest-commander)         │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                      Application Layer                           │
│                   ClassifyProductUseCase                         │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                    Classification Pipeline                       │
│                                                                  │
│  1. Normalizer ──→ 2. Rules Engine ──→ 3. Keyword Search (FTS)  │
│                           │                      │               │
│                           │         4. Vector Search (optional)  │
│                           │                      │               │
│                           └──────────┬───────────┘               │
│                                      ↓                           │
│                            5. Reranker / Merge                   │
│                                      ↓                           │
│                            6. LLM Classifier                     │
│                                      ↓                           │
│                            7. Validator                          │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                     Infrastructure Layer                         │
│   PostgreSQL (FTS + pgvector)  │  OpenAI SDK  │  Logger/Audit   │
└─────────────────────────────────────────────────────────────────┘
```

### Тип архітектури

**Layered modular monolith** на NestJS:

- Один deployable unit (не microservices)
- Чітке розділення шарів: presentation → application → domain → infrastructure
- Pipeline-кроки — окремі injectable services (легко тестувати і замінювати)
- Не onion/hexagonal — достатня складність для MVP без over-engineering

### Потік даних (приклад)

```
Input: "мотузка поліпропіленова"

1. Normalizer
   → tokens: ["мотузка", "поліпропіленова"]
   → normalized: "мотузка поліпропіленова"

2. Rules Engine
   → detected material: "поліпропілен" → hint group 39 or 56
   → detected product type: "мотузка" → hint positions 5607*

3. Keyword Search (PostgreSQL FTS)
   → top-20 candidates:
     5607 41 00 00 — Шпагат та мotузки для пакування (score: 0.91)
     5607 49 11 00 — Плетені або в обплетенні (score: 0.72)
     5608 11 20 10 — З нейлону або поліамідів (score: 0.45)

4. Vector Search (optional, Phase 2)
   → semantic matches merged with keyword results

5. Reranker
   → merged + deduplicated top-10

6. LLM Classifier
   → structured JSON: { code: "5607 41 00 00", confidence: 0.87, reason: "..." }

7. Validator
   → code exists in DB ✓
   → confidence >= threshold ✓
   → return result
```

---

## 4. Підходи до вирішення задачі

### 4.1 Тільки Keyword Search

```
Product → PostgreSQL FTS → top-1 result
```

**Як працює:** Full-text search по назвах позицій УКТ ЗЕД. Повертає найближчий match за ts_rank.

| Переваги | Недоліки |
|---|---|
| Швидко, без LLM | Не розуміє синоніми ("канат" ≠ "мотузка" без synonyms) |
| Детермінований результат | Погано на неоднозначних товарах |
| Нульова вартість API | Не враховує контекст (матеріал, призначення) |
| Простий debug | Юридичні нюанси класифікації ігноруються |

**Очікувана точність:** 40–60% top-1, 70–80% top-5

**Коли достатньо:** Exact match запити ("5607", "шпагат поліпропіленовий")

---

### 4.2 Тільки RAG (Keyword Retrieval + LLM)

```
Product → Keyword Search → top-K candidates → LLM → code
```

**Як працює:** Retrieval-Augmented Generation — спочатку знаходимо релевантні позиції з бази, потім LLM вибирає найточніший код з отриманого контексту.

| Переваги | Недоліки |
|---|---|
| AI враховує контекст і нюанси | Залежність від якості retrieval |
| Пояснення (reason) | Вартість LLM на кожен запит |
| Контрольований output (коди з бази) | Latency 1–3 сек |
| Не hallucinate codes (з validator) | Prompt engineering потребує ітерацій |

**Очікувана точність:** 65–80% top-1, 85–92% top-5

**Коли достатньо:** MVP — основний рекомендований підхід

---

### 4.3 RAG + Embeddings (Vector Search)

```
Product → Embedding → pgvector similarity → top-K → LLM → code
```

**Як працює:** Кожна позиція УКТ ЗЕД перетворюється на vector (embedding). Запит користувача теж embeddиться. Cosine similarity знаходить семантично близькі позиції.

| Переваги | Недоліки |
|---|---|
| Розуміє синоніми ("H2O" → вода) | Embeddings можуть змішувати юридично різні категорії |
| Краще на описових запитах | Додаткова інфра (pgvector, embedding API) |
| Масштабується на великі бази | Rebuild при оновленні тарифу |
| | Складніше debug ("чому цей vector?") |

**Очікувана точність:** 70–85% top-1, 88–95% top-5

**Коли достатньо:** Phase 2 — якщо keyword RAG не дає потрібної точності

---

### 4.4 Hybrid Search (Keyword + Vector)

```
Product → FTS (top-20) + Vector (top-20) → Merge/Rerank → top-10 → LLM
```

**Як працює:** Паралельний keyword і vector search, результати об'єднуються з weighted scoring (наприклад, 0.6 × FTS + 0.4 × vector).

| Переваги | Недоліки |
|---|---|
| Найкращий recall | Найскладніша реалізація |
| Keyword ловить exact match, vector — synonyms | Потребує tuning weights |
| Стійкий до різних типів запитів | Два index'и для підтримки |

**Очікувана точність:** 75–88% top-1, 90–96% top-5

**Коли достатньо:** Production — коли точність критична (митниця, compliance)

---

### 4.5 Rules Engine + Search + LLM

```
Product → Rules (hints) → Search (filtered) → LLM → code
```

**Як працює:** Детерміновані правила аналізують опис товару і генерують hints (група, матеріал, призначення). Search працює в обмеженому просторі. LLM приймає фінальне рішення.

**Приклад rules:**

```
IF contains("молоко") → hint group 04
IF contains("поліпропілен") AND contains("мотузка") → hint positions 5607*
IF contains("заморожен") AND contains("м'ясо") → hint group 02, filter by "заморожен"
```

| Переваги | Недоліки |
|---|---|
| Юридична логіка класифікації | Rules потребують domain expertise |
| Зменшує search space → точніший LLM | Правила треба оновлювати |
| Пояснюваність на кожному кроці | Over-fitting на відомих кейсах |
| Працює без LLM для простих cases | |

**Очікувана точність:** 75–90% top-1 (з якісними rules)

**Коли достатньо:** Рекомендовано як частина MVP pipeline

---

### Порівняльна таблиця

| Підхід | Top-1 Accuracy | Latency | Вартість/запит | Складність | Підтримка |
|---|---|---|---|---|---|
| Keyword only | 40–60% | <50ms | $0 | ★☆☆ | ★☆☆ |
| RAG (keyword) | 65–80% | 1–3s | ~$0.001 | ★★☆ | ★★☆ |
| RAG + embeddings | 70–85% | 1–3s | ~$0.002 | ★★★ | ★★★ |
| Hybrid search | 75–88% | 1–3s | ~$0.002 | ★★★★ | ★★★★ |
| Rules + Search + LLM | 75–90% | 1–3s | ~$0.001 | ★★★ | ★★★ |

---

## 5. Embeddings та юридична специфіка УКТ ЗЕД

### Чому embeddings можуть допомогти

- **Синоніми:** "канат" ≈ "мотузка" ≈ "шпагат" — vector search знайде близькі позиції
- **Описові запити:** "штука для пакування палет" → semantically близько до "шпагат для пакування"
- **Мультимовність:** "rope" → мотузка (якщо embedding model multilingual)

### Чому embeddings можуть погіршити результат

УКТ ЗЕД — це **юридична**, а не семантична класифікація. Правила інтерпретації (6 General Rules) визначають код на основі:

1. **Формальних критеріїв:** матеріал, ступінь обробки, призначення
2. **Специфічних виключень:** "до цієї групи не включаються..."
3. **Композиції:** "класифікується за матеріалом, що домінує за масою"
4. **Ступеня обробки:** "невибілений" vs "вибілений" — різні коди

**Проблема:** Embeddings вимірюють **семантичну близькість**, а не **юридичну належність**.

| Запит | Semantic (embedding) | Юридична класифікація |
|---|---|---|
| "поліетиленова плівка" | близько до "пластмаса" (група 39) | може бути 3920, 3921 або 5603 — залежить від форми |
| "м'ясо свинини" | близько до "свинина" (0203) | 0203 vs 0204 vs 0210 — залежить від ступеня обробки |
| "вода мінеральна" | близько до "напої" (22) | 2201 vs 2202 — залежить від газованості |

**Vector search може повернути семантично близькі, але юридично неправильні коди.**

### Висновок

> Embeddings — корисний **recall booster** (знайти більше кандидатів), але **не заміна** rules engine і LLM reasoning. Фінальне рішення завжди приймає LLM з structured context + validator.

---

## 6. Чи починати без embeddings

### Рекомендація: **Так, починати без embeddings**

| Аргумент | Пояснення |
|---|---|
| **Швидший MVP** | PostgreSQL FTS достатньо для 10k позицій |
| **Менше moving parts** | Один search index замість двох |
| **Легший debug** | FTS score зрозумілий; vector — black box |
| **Юридична специфіка** | Rules + LLM краще справляються з формальними критеріями |
| **Простий upgrade path** | pgvector додається без зміни pipeline |

### Коли додавати embeddings (Phase 2)

- Keyword RAG дає < 70% top-1 accuracy на test set
- Багато запитів з нестандартними описами / synonyms
- Потрібна multilingual support

### Архітектура з upgrade path

```
Phase 1 (MVP):
  Rules → FTS → LLM → Validator

Phase 2:
  Rules → FTS + pgvector → Reranker → LLM → Validator
                ↑
         toggle via config: SEARCH_MODE=hybrid
```

Pipeline не змінюється — додається ще один search provider.

---

## 7. Очікувана точність та складність підтримки

### Метрики для оцінки

| Метрика | Опис |
|---|---|
| **Top-1 Accuracy** | % запитів, де перший код — правильний |
| **Top-5 Accuracy** | % запитів, де правильний код є в top-5 |
| **Confidence Calibration** | Чи відповідає confidence реальній точності |
| **Fallback Rate** | % запитів з confidence < threshold |

### Test set

Для оцінки потрібен benchmark:

- 50–100 пар `(опис товару, правильний код)` з реальних кейсів
- Покриття різних груп (харчові, текстиль, метали, машини)
- Включити edge cases (неоднозначні, composite products)

### Очікування по фазах

| Фаза | Top-1 | Top-5 | Fallback Rate |
|---|---|---|---|
| MVP (Rules + FTS + LLM) | 65–75% | 85–90% | 15–25% |
| + Embeddings | 72–82% | 88–93% | 10–18% |
| + Reranker + fine-tuned rules | 78–88% | 92–96% | 5–12% |

> **Важливо:** 100% accuracy недосяжна — УКТ ЗЕД класифікація часто потребує expert review. Система — **assistant**, не заміна митного брокера.

---

## 8. Глосарій

### RAG (Retrieval-Augmented Generation)

Підхід, при якому AI **спочатку шукає** релевантну інформацію у зовнішній базі, **потім генерує** відповідь на її основі.

```
Retrieval → Augmentation → Generation
(пошук)     (контекст       (відповідь
             в prompt)       AI)
```

**У нашому проєкті:** знаходимо top-K позицій УКТ ЗЕД → додаємо в prompt → LLM вибирає код.

### Embeddings

Числове представлення тексту у вигляді vector (масив float, зазвich 1536 dimensions). Semantically схожі тексти мають близькі vectors.

```
"мотузка"     → [0.12, -0.34, 0.56, ...]
"шпагат"      → [0.11, -0.33, 0.55, ...]  ← близько
"молоко"      → [-0.45, 0.78, -0.12, ...] ← далеко
```

Генеруються через API (OpenAI `text-embedding-3-small`).

### Vector Search

Пошук найближчих vectors у базі за cosine similarity або L2 distance. Реалізується через **pgvector** extension в PostgreSQL.

```sql
SELECT code, name, 1 - (embedding <=> query_embedding) AS similarity
FROM uktzed_positions
ORDER BY embedding <=> query_embedding
LIMIT 10;
```

### Hybrid Search

Комбінація keyword search (FTS) і vector search з weighted merge:

```
final_score = α × fts_score + (1 - α) × vector_similarity
```

Typical α = 0.5–0.7 (keyword-heavy для юридичних текстів).

### Reranking

Пересортовування результатів search перед передачею в LLM. Може бути:

- **Rule-based:** boost candidates matching rules hints
- **Cross-encoder:** ML model, що оцінює relevance пари (query, document)
- **LLM-based:** дорого, але точно

```
Search results (20) → Reranker → top-10 → LLM
```

### Confidence Score

Оцінка впевненості системи в результаті (0.0–1.0):

| Джерело | Вага |
|---|---|
| FTS score (normalized) | 30% |
| LLM self-reported confidence | 40% |
| Rules match strength | 20% |
| Candidate score gap (top1 - top2) | 10% |

**Пороги:**

| Confidence | Дія |
|---|---|
| ≥ 0.80 | Автоматична відповідь |
| 0.50–0.79 | Відповідь + warning |
| < 0.50 | Fallback: top-3 candidates, без auto-code |

---

## 9. Рекомендована архітектура MVP

### Pipeline

```
Product Description
        ↓
   1. Normalizer
   (lowercase, tokenize, clean)
        ↓
   2. Rules Engine
   (material, group hints, exclusions)
        ↓
   3. Keyword Search
   (PostgreSQL FTS, top-20)
        ↓
   4. [SKIP in MVP] Vector Search
        ↓
   5. Reranker
   (rules boost + FTS score merge, top-10)
        ↓
   6. LLM Classifier
   (structured output: code + reason + confidence)
        ↓
   7. Validator
   (code exists, confidence threshold)
        ↓
   Response: { code, name, confidence, reason, candidates? }
```

### Чому саме цей pipeline

| Крок | Чому включено в MVP |
|---|---|
| **Normalizer** | Стандартизація вводу — must have |
| **Rules Engine** | Юридична специфіка УКТ ЗЕД — ключова перевага над naive RAG |
| **Keyword Search (FTS)** | Достатньо для 10k позицій, zero ML infra |
| **Vector Search** | Відкладено — додається через config toggle |
| **Reranker** | Rules boost — простий, без ML model |
| **LLM** | Reasoning по формальних критеріях — must have |
| **Validator** | Захист від hallucination — must have |

### Що НЕ включаємо в MVP

- pgvector / embeddings
- Cross-encoder reranker
- Web UI
- Auto-update з zakon.rada.gov.ua
- Batch processing

---

## 10. Технологічний стек

### Рекомендований stack

| Компонент | Технологія | Обґрунтування |
|---|---|---|
| Runtime | Node.js 20 LTS | Стабільний, async I/O |
| Language | TypeScript 5 | Type safety для domain models |
| Framework | NestJS | DI, modules, guards — enterprise-ready structure |
| Database | PostgreSQL 16 | FTS (tsvector) + pgvector (Phase 2) в одній БД |
| Search | PostgreSQL FTS (GIN index) | Built-in, без Elasticsearch |
| Vector [Phase 2] | pgvector extension | Нативна інтеграція з PostgreSQL |
| LLM | OpenAI GPT-4o-mini | Structured output, cost-effective |
| Embeddings [Phase 2] | text-embedding-3-small | Дешевий, multilingual |
| Validation | Zod | Runtime schema validation |
| CLI | nest-commander | Інтеграція з NestJS DI |
| API | REST (NestJS controllers) | Простий контракт для інтеграцій |
| Testing | Jest + Vitest | Unit + integration tests |
| Containerization | Docker Compose | PostgreSQL + app |

### Чому NestJS, а не Express

| NestJS | Express |
|---|---|
| Модульна архітектура out of the box | Потрібно будувати самому |
| DI для pipeline services | Manual wiring |
| Guards, pipes, interceptors | Middleware manually |
| Краще для test assignment demo | Занадто minimal для pipeline |

### Чому PostgreSQL, а не JSON in-memory

| PostgreSQL | JSON file |
|---|---|
| FTS з GIN index — швидкий search по 10k+ records | Linear scan — повільно |
| pgvector upgrade без зміни infra | Потрібна нова infra |
| Audit log, query history | Окреме рішення |
| Production-ready | Prototype-only |

### Чому GPT-4o-mini

- Structured JSON output (response_format)
- Достатньо для classification reasoning
- ~$0.001/запит vs ~$0.01 для GPT-4o
- Upgrade path до GPT-4o для складних cases

---

## 11. Структура проєкту

```
ukt-zed/
├── README.md                          ← цей документ
├── docker-compose.yml                 ← PostgreSQL + pgvector
├── .env.example
├── package.json
├── tsconfig.json
├── nest-cli.json
│
├── prisma/                            ← ORM + migrations
│   ├── schema.prisma
│   └── migrations/
│
├── scripts/
│   └── import-tariff.ts               ← PDF → PostgreSQL (one-time)
│
├── data/                              ← source files (gitignored або lfs)
│   ├── tariff-groups-01-49.pdf
│   └── tariff-groups-50-97.pdf
│
├── src/
│   ├── main.ts                        ← NestJS bootstrap
│   ├── app.module.ts
│   │
│   ├── domain/                        ← entities, types, interfaces
│   │   ├── uktzed-position.entity.ts
│   │   ├── classify-result.interface.ts
│   │   └── classification-rule.interface.ts
│   │
│   ├── infrastructure/
│   │   ├── database/
│   │   │   ├── prisma.service.ts
│   │   │   └── uktzed-position.repository.ts
│   │   ├── llm/
│   │   │   └── openai-classifier.service.ts
│   │   └── logger/
│   │       └── audit-logger.service.ts
│   │
│   ├── classification/                ← pipeline services
│   │   ├── classification.module.ts
│   │   ├── normalizer.service.ts
│   │   ├── rules-engine.service.ts
│   │   ├── keyword-search.service.ts
│   │   ├── vector-search.service.ts   ← Phase 2 (stub in MVP)
│   │   ├── reranker.service.ts
│   │   ├── llm-classifier.service.ts
│   │   ├── validator.service.ts
│   │   └── classification.pipeline.ts ← orchestrator
│   │
│   ├── application/
│   │   └── classify-product.use-case.ts
│   │
│   └── presentation/
│       ├── api/
│       │   ├── classify.controller.ts
│       │   └── dto/
│       │       ├── classify-request.dto.ts
│       │       └── classify-response.dto.ts
│       └── cli/
│           └── classify.command.ts
│
└── test/
    ├── classification/
    │   ├── rules-engine.spec.ts
    │   ├── keyword-search.spec.ts
    │   └── pipeline.spec.ts
    └── fixtures/
        └── benchmark.json             ← test pairs (product, expected code)
```

---

## 12. API та інтерфейси

### REST API

#### `POST /api/v1/classify`

**Request:**

```json
{
  "product": "мотузка поліпропіленова для пакування"
}
```

**Response (high confidence):**

```json
{
  "code": "5607 41 00 00",
  "name": "Шпагат та мотузки для пакування",
  "group": "56",
  "confidence": 0.87,
  "reason": "Поліпропіленова мотузка для пакування відповідає позиції 5607 41.",
  "candidates": []
}
```

**Response (low confidence — fallback):**

```json
{
  "code": null,
  "confidence": 0.42,
  "reason": "Недостатньо впевненості для автоматичної класифікації.",
  "candidates": [
    { "code": "5607 41 00 00", "name": "Шпагат та мотузки для пакування", "score": 0.42 },
    { "code": "5607 49 11 00", "name": "Плетені або в обплетенні", "score": 0.38 },
    { "code": "5608 19 11 00", "name": "Сітки з шпагату", "score": 0.31 }
  ]
}
```

#### `GET /api/v1/health`

```json
{
  "status": "ok",
  "positionsLoaded": 10247,
  "searchMode": "keyword"
}
```

### CLI

```bash
# Класифікація одного товару
npm run cli -- classify "мотузка поліпропіленова"

# Benchmark на test set
npm run cli -- benchmark --file test/fixtures/benchmark.json

# Імпорт тарифу з PDF
npm run cli -- import-tariff --pdf data/tariff-groups-01-49.pdf
```

---

## 13. Ризики та обмеження

| Ризик | Імовірність | Мітигація |
|---|---|---|
| PDF parsing втрачає структуру | Висока | Manual review sample + fallback to official API |
| LLM hallucinate code | Середня | Validator: code must exist in DB |
| Низька accuracy на edge cases | Висока | Fallback + candidates; disclaimer in API |
| Тариф оновлюється (новий закон) | Низька | Re-import script + versioned data |
| Latency > 5s | Низька | Cache frequent queries; async for batch |
| Вартість LLM при scale | Середня | Cache + GPT-4o-mini; skip LLM for exact FTS match |

### Disclaimer

> Система є **assistant tool** для класифікації товарів. Фінальне рішення щодо коду УКТ ЗЕД приймає кваліфікований фахівець. Результат не є юридично binding.

---

## 14. Roadmap після MVP

| Phase | Що додаємо | Trigger |
|---|---|---|
| **MVP** | Rules + FTS + LLM + CLI + API | — |
| **Phase 2** | pgvector embeddings + hybrid search | Accuracy < 70% top-1 |
| **Phase 3** | Cross-encoder reranker | Accuracy plateau |
| **Phase 4** | Web UI + query history dashboard | User request |
| **Phase 5** | Auto-sync з zakon.rada.gov.ua | Tariff update |
| **Phase 6** | Fine-tuned rules from audit log | Enough production data |

---

## 15. Затверджені рішення

| Питання | Рішення |
|---|---|
| **Рівень коду** | Повний 10-значний (`0204 50 79 00`); при confidence < 0.45 — candidates без auto-code |
| **Confidence threshold** | ≥ 0.75 — auto; 0.45–0.74 — code + `requiresReview: true`; < 0.45 — hard fallback (candidates only) |
| **LLM provider** | OpenAI GPT-4o-mini через `LlmClassifierPort` interface |
| **PostgreSQL** | Docker Compose локально (postgres:16 + pgvector) |
| **PDF parsing** | Автоматичний parser + JSON seed в repo для стабільного MVP |
| **Benchmark test set** | 30–50 пар (товар, код), створити з PDF |
| **Мова запитів** | Тільки українська в MVP |

---

## Резюме

**Рекомендований MVP:**

> **Layered modular monolith** на NestJS + PostgreSQL з pipeline:
> **Normalizer → Rules Engine → PostgreSQL FTS → Reranker → LLM → Validator**
>
> Без embeddings на старті. Vector search (pgvector) — Phase 2 через config toggle.
>
> Очікувана точність: **65–75% top-1**, **85–90% top-5**.
>
> Система повертає повний код УКТ ЗЕД (`XXXX XX XX XX`) з поясненням та confidence score.

---

*Документ затверджено. Реалізація MVP розпочата — див. секцію «Quick Start» нижче.*

---

## Quick Start

```bash
# 1. Запустити PostgreSQL
docker compose up -d

# 2. Налаштувати env
cp .env.example .env
# Додати OPENAI_API_KEY

# 3. Міграція та seed (11316 позицій з PDF)
npx prisma db push
npm run db:seed

# 4. Запуск API
npm run start:dev

# 5. CLI класифікація
npm run cli -- classify --product "мотузка поліпропіленова"

# 6. Benchmark
npm run cli -- benchmark
```

### Re-import з PDF

```bash
npm run parse:pdf    # PDF → data/uktzed-positions.json
npm run db:seed      # JSON → PostgreSQL
```
