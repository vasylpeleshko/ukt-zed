# UKT-ZED Classifier — Технічна документація

> **Версія:** 1.0.0  
> **Стек:** NestJS 11 · TypeScript · PostgreSQL 16 + pgvector · OpenAI · Prisma  
> **Base URL:** `http://localhost:3001/api/v1` (за замовчуванням з `.env.example`)

---

## Зміст

1. [Загальний опис системи](#1-загальний-опис-системи)
2. [Архітектура](#2-архітектура)
3. [Структура проєкту](#3-структура-проєкту)
4. [Бізнес-логіка](#4-бізнес-логіка)
5. [API Documentation](#5-api-documentation)
6. [Станові машини](#6-станові-машини-state-machines)
7. [База даних](#7-база-даних)
8. [Frontend Integration Guide](#8-frontend-integration-guide)
9. [Події системи](#9-події-системи)
10. [Конфігурація](#10-конфігурація)
11. [Безпека](#11-безпека)
12. [Background Jobs](#12-background-jobs)
13. [Error Handling](#13-error-handling)
14. [Monitoring та Observability](#14-monitoring-та-observability)
15. [Як працює система від початку до кінця](#15-як-працює-система-від-початку-до-кінця)

---

# 1. Загальний опис системи

## 1.1 Призначення проєкту

**UKT-ZED Classifier** — backend-сервіс для автоматичного визначення коду **УКТ ЗЕД** (Українська класифікація товарів зовнішньоекономічної діяльності) за текстовим описом товару.

Система поєднує:
- **Keyword search** (PostgreSQL Full-Text Search)
- **Vector search** (pgvector + OpenAI embeddings)
- **Rules engine** (regex-підказки для груп товарів)
- **LLM reranking** (OpenAI GPT, structured output)

## 1.2 Які проблеми вирішує

| Проблема | Рішення |
|----------|---------|
| Ручний пошук коду серед ~15 000 позицій тарифу | Hybrid search + LLM з обмеженим списком кандидатів |
| «Вигадування» неіснуючих кодів LLM | Validator перевіряє код проти БД і списку кандидатів |
| Загальні запити («риба», «тунець») | Окрема логіка vague/broad → `code: null` + candidates |
| Низька впевненість | `requiresReview: true` + top-N candidates для ручного вибору |
| Аудит рішень | Таблиця `classification_audit` |

## 1.3 Основні бізнес-сценарії

### BS-01: Класифікація конкретного товару
**Актор:** Митний брокер / ERP  
**Вхід:** `"мотузка поліпропіленова для пакування"`  
**Вихід:** Код `5607 41`, confidence ≥ 0.75, `requiresReview: false`

### BS-02: Загальний запит (vague)
**Актор:** Користувач без деталей  
**Вхід:** `"риба"`  
**Вихід:** `code: null`, candidates з позиціями «інші», `requiresReview: true`

### BS-03: Широкий запит (broad)
**Актор:** Користувач  
**Вхід:** `"тунець"`  
**Вихід:** `code: null`, до 7 різних видів тунця, `requiresReview: true`

### BS-04: Перевірка готовності системи
**Актор:** DevOps / Load Balancer  
**Вхід:** `GET /health`  
**Вихід:** `status: ok|degraded|down`, кількість positions/embeddings

### BS-05: Оновлення тарифних даних (offline)
**Актор:** Data engineer  
**Flow:** PDF → parse → seed → enrich → embed

### BS-06: Batch benchmark (CLI)
**Актор:** QA / Data team  
**Команда:** `npm run cli -- benchmark`

## 1.4 Основні ролі користувачів

| Роль | Доступ | Інструменти |
|------|--------|-------------|
| **Integrator (ERP/Web)** | REST API `POST /classify` | API Key (якщо налаштовано) |
| **DevOps** | Health, deploy, env | Docker Compose, migrations |
| **Data Engineer** | Offline scripts | `parse:pdf`, `data:reload` |
| **QA** | CLI benchmark, fixtures | `npm run cli`, `test/fixtures/benchmark.json` |
| **Developer** | Повний код | NestJS modules, Jest |

> **Примітка:** Система не має UI, JWT-авторизації користувачів чи RBAC. Доступ до API — через опціональний `API_KEY`.

---

# 2. Архітектура

## 2.1 Загальна схема

```mermaid
flowchart TB
    subgraph Clients
        WEB[Web / ERP / Mobile]
        CLI[CLI benchmark]
        DEVOPS[DevOps probes]
    end

    subgraph Presentation
        CTRL[ClassifyController]
        GUARD[ThrottlerGuard + ApiKeyGuard]
    end

    subgraph Application
        UC1[ClassifyProductUseCase]
        UC2[HealthCheckUseCase]
    end

    subgraph Classification
        PIPE[ClassificationPipeline]
        NORM[NormalizerService]
        RULES[RulesEngineService]
        HYBRID[HybridSearchService]
        KW[KeywordSearchService]
        VEC[VectorSearchService]
        RERANK[RerankerService]
        VALID[ValidatorService]
    end

    subgraph Domain
        TYPES[classification.types]
        PORTS[position-search / audit / embedding ports]
        UTILS[uktzed-code.utils, confidence.utils]
    end

    subgraph Infrastructure
        REPO[UktzedPositionRepository]
        LLM[OpenAiClassifierService]
        EMB[OpenAiEmbeddingService]
        AUDIT[AuditLoggerService]
        HEALTH[HealthReadService]
        PRISMA[PrismaService]
    end

    subgraph External
        PG[(PostgreSQL + pgvector)]
        OPENAI[OpenAI API]
    end

    WEB --> GUARD --> CTRL
    CLI --> UC1
    DEVOPS --> CTRL
    CTRL --> UC1 & UC2
    UC1 --> PIPE
    UC2 --> HEALTH
    PIPE --> NORM --> RULES --> HYBRID
    HYBRID --> KW & VEC
    PIPE --> RERANK --> VALID
    PIPE --> LLM
    PIPE --> AUDIT
    KW & VEC & VALID --> REPO
    VEC --> EMB
    REPO & AUDIT --> PRISMA --> PG
    LLM & EMB --> OPENAI
```

## 2.2 Опис модулів

| Модуль | Шлях | Відповідальність |
|--------|------|------------------|
| **AppModule** | `src/app.module.ts` | Root composition, throttling, controllers |
| **Presentation** | `src/presentation/` | HTTP controllers, guards, DTO |
| **Application** | `src/application/` | Use cases (thin orchestration entry) |
| **Classification** | `src/classification/` | Pipeline: normalize → search → LLM → validate |
| **Domain** | `src/domain/` | Types, ports, pure algorithms (no Nest deps) |
| **Infrastructure** | `src/infrastructure/` | Prisma, OpenAI, audit, health adapters |
| **CLI** | `src/cli/` | `classify`, `benchmark` commands |

## 2.3 Взаємодія модулів

```
HTTP Request
  → ClassifyController (Presentation)
  → ClassifyProductUseCase (Application) — trim + validation
  → ClassificationPipeline (Classification)
      → NormalizerService
      → RulesEngineService
      → HybridSearchService → KeywordSearchService + VectorSearchService
      → RerankerService
      → LlmClassifierPort → OpenAiClassifierService
      → ValidatorService
      → AuditLogPort → AuditLoggerService
  → ClassifyResult JSON
```

## 2.4 Патерни та причини вибору

| Патерн | Де використано | Чому |
|--------|----------------|------|
| **Layered Architecture** | presentation → application → classification → domain | Розділення HTTP, use cases, domain logic |
| **Hexagonal (Ports & Adapters)** | `LLM_CLASSIFIER_PORT`, `POSITION_SEARCH_PORT`, etc. | Заміна OpenAI/Prisma без зміни pipeline |
| **Pipeline / Chain of Responsibility** | `ClassificationPipeline` | Чіткі стадії обробки запиту |
| **Repository** | `UktzedPositionRepository` | Інкапсуляція raw SQL (FTS, pgvector) |
| **RAG (Retrieval-Augmented Generation)** | Search → LLM з candidates | LLM не «вигадує» коди |
| **Strategy** | `SEARCH_MODE=keyword|vector|hybrid` | Гнучкий режим пошуку |
| **Graceful Degradation** | LLM fallback, vector skip без embeddings | Resilience |

## 2.5 Dependency Graph (NestJS Modules)

```mermaid
graph TD
    AppModule --> ConfigModule
    AppModule --> ThrottlerModule
    AppModule --> InfrastructureModule
    AppModule --> ClassificationModule
    AppModule --> ApplicationModule
    AppModule --> ClassifyController

    ApplicationModule --> InfrastructureModule
    ApplicationModule --> ClassificationModule

    ClassificationModule --> InfrastructureModule

    ClassifyController --> ClassifyProductUseCase
    ClassifyController --> HealthCheckUseCase
    ClassifyProductUseCase --> ClassificationPipeline
    HealthCheckUseCase --> HEALTH_READ_PORT
```

**Правило залежностей:** `domain/` не імпортує нічого з outer layers. `classification/` залежить від domain ports, не від concrete infrastructure (через DI tokens).

## 2.6 Data Flow Diagram — Classify Request

```mermaid
sequenceDiagram
    participant C as Client
    participant API as ClassifyController
    participant UC as ClassifyProductUseCase
    participant P as ClassificationPipeline
    participant DB as PostgreSQL
    participant AI as OpenAI

    C->>API: POST /api/v1/classify
    API->>API: Throttle + ApiKey + ValidationPipe
    API->>UC: execute(product)
    UC->>P: classify(trimmed)
    P->>P: normalize + rules
    par Hybrid Search
        P->>DB: keywordSearch (FTS)
        P->>AI: embed(query)
        AI-->>P: vector
        P->>DB: vectorSearch (pgvector)
    end
    P->>P: rerank
    P->>AI: classify(product, candidates)
    AI-->>P: {code, confidence, reason}
    P->>DB: findByCode (validate)
    P->>DB: audit log (async)
    P-->>UC: ClassifyResult
    UC-->>API: ClassifyResult
    API-->>C: 201 JSON
```

---

# 3. Структура проєкту

```
ukt-zed/
├── src/                    # Runtime NestJS application
├── test/                   # Jest unit/integration tests
├── scripts/                # Offline ETL (PDF, embeddings)
├── prisma/                 # Schema, migrations, seed
├── data/                   # Generated JSON + PDFs (not in git)
├── docs/                   # Documentation
├── docker-compose.yml      # Local PostgreSQL + pgvector
└── .github/workflows/      # CI
```

## 3.1 `src/presentation/`

**Призначення:** HTTP boundary — controllers, guards, DTO.

**Що містить:**
- `api/classify.controller.ts` — endpoints
- `guards/api-key.guard.ts` — API key auth

**Дозволені залежності:** `application/`, `@nestjs/*`, `class-validator`

**Заборонено:** прямий доступ до `infrastructure/database`, Prisma

**Приклад:**
```typescript
// ✅ Correct
constructor(private readonly classifyProduct: ClassifyProductUseCase) {}

// ❌ Wrong
constructor(private readonly repo: UktzedPositionRepository) {}
```

## 3.2 `src/application/`

**Призначення:** Use cases — entry points для business operations.

**Що містить:**
- `classify-product.use-case.ts`
- `health-check.use-case.ts`
- `application.module.ts`

**Дозволені залежності:** `classification/`, `domain/`

**Правила:** Use case не містить HTTP-логіку; валідує input на рівні business rules.

## 3.3 `src/classification/`

**Призначення:** Core classification pipeline services.

**Що містить:**
- `classification.pipeline.ts` — orchestrator
- `normalizer.service.ts`, `rules-engine.service.ts`
- `keyword-search.service.ts`, `vector-search.service.ts`, `hybrid-search.service.ts`
- `reranker.service.ts`, `validator.service.ts`

**Дозволені залежності:** `domain/`, ports via `@Inject(TOKEN)`

## 3.4 `src/domain/`

**Призначення:** Pure business types, algorithms, port interfaces.

**Що містить:**
- `classification.types.ts`, `health.types.ts`
- `position-search.port.ts`, `audit-log.port.ts`, `embedding.port.ts`
- `candidate-diversifier.ts`, `search-context.builder.ts`
- `uktzed-code.utils.ts`, `confidence.utils.ts`

**Залежності:** **жодних** imports з `src/` outer layers

**Приклад — port:**
```typescript
export const POSITION_SEARCH_PORT = Symbol('POSITION_SEARCH_PORT');
export interface PositionSearchPort {
  keywordSearch(...): Promise<UktzedCandidate[]>;
}
```

## 3.5 `src/infrastructure/`

**Призначення:** Adapters — DB, OpenAI, audit, health.

**Що містить:**
- `database/` — PrismaService, UktzedPositionRepository
- `llm/` — OpenAiClassifierService
- `embeddings/` — OpenAiEmbeddingService, EmbeddingStatusService
- `logger/` — AuditLoggerService
- `health/` — HealthReadService

**Правила:** Implements domain ports; binds in `infrastructure.module.ts`

## 3.6 `scripts/`

**Призначення:** Offline data pipeline (не part of runtime API).

| Script | Команда | Опис |
|--------|---------|------|
| `parse-pdf.ts` | `npm run parse:pdf` | PDF → `data/uktzed-positions.json` |
| `prisma/seed.ts` | `npm run db:seed` | JSON → PostgreSQL |
| `enrich-context.ts` | `npm run context:enrich` | Build `search_context` |
| `generate-embeddings.ts` | `npm run embeddings:generate` | OpenAI → pgvector |
| `setup-pgvector.ts` | `npm run embeddings:setup` | HNSW index |

## 3.7 `test/`

**Призначення:** Jest tests (94 tests, 18 suites).

**Структура:**
- `*.spec.ts` — unit tests per module
- `helpers/pipeline.factory.ts` — test pipeline with mocks
- `fixtures/benchmark.json` — 40 benchmark cases

## 3.8 `prisma/`

**Призначення:** Database schema and migrations.

**Правила:**
- Використовуй `prisma migrate dev` для нових migrations
- Не використовуй `db push` у production
- `Unsupported("vector")` types — vector ops тільки через raw SQL

---

# 4. Бізнес-логіка

> **Важливо:** Runtime API **не має CRUD** для сутностей. Створення/редагування позицій тарифу — через offline pipeline.

## 4.1 Сценарій: Класифікація товару (основний)

**Trigger:** `POST /api/v1/classify`

```
1. Client надсилає { product: "..." }
2. Guards: Throttler → ApiKey (якщо API_KEY заданий)
3. ValidationPipe: trim, max 2000 chars, not empty
4. ClassifyProductUseCase.execute()
5. NormalizerService.normalize()
   - lowercase, tokenize, detect isVague / isBroad
6. RulesEngineService.analyze()
   - regex rules → RuleHint[] (groupCodes, boosts)
7. HybridSearchService.search()
   - keyword FTS + vector (parallel in hybrid mode)
8. RerankerService.rerank()
   - apply rule boosts, generic name logic
9. diversifyCandidates() для broad queries
10. OpenAiClassifierService.classify()
    - LLM обирає код ТІЛЬКИ з candidates
11. ValidatorService.validate()
    - confidence thresholds, broad → code:null
12. AuditLoggerService.log() — fire-and-forget
13. Return ClassifyResult
```

## 4.2 Сценарій: Vague query («риба»)

```
1. isVague = true (single generic token)
2. Rules → group 03, preferGeneric: true
3. Keyword search + genericInGroupSearch («інші»)
4. Reranker boosts generic tariff names
5. LLM instructed to pick «інші» if available
6. Validator: normal path (not broad)
7. Result: often requiresReview: true
```

## 4.3 Сценарій: Broad query («тунець»)

```
1. isBroad = true (single token from BROAD_PRODUCT_TERMS)
2. searchLimit=40, rerankLimit=25
3. diversifyCandidates → max 7 species
4. LLM gets diversified subset
5. Validator: ALWAYS code=null, requiresReview=true
6. candidates[] populated for manual selection
```

## 4.4 Сценарій: LLM недоступний (fallback)

```
1. OpenAI throws / timeout (30s)
2. Pipeline logs warning
3. If broad → confidence 0.5, generic reason
4. If specific → top keyword candidate, confidence ≤ 0.65
5. Validator processes fallback output normally
```

## 4.5 Сценарій: Пошук (keyword)

```
1. Tokens extracted from normalized query
2. buildTsQuery(tokens, 'and') → to_tsquery
3. PostgreSQL FTS with ts_rank + level boost
4. If < 5 results → OR fallback
5. If vague + group hints → merge generic «інші»
```

## 4.6 Сценарій: Пошук (vector)

```
1. EmbeddingStatusService.hasEmbeddings() — skip if 0
2. OpenAI embed(searchText)
3. pgvector cosine similarity: (1 - embedding <=> query)
4. Optional group/prefix filters from rules
```

## 4.7 Сценарій: Авторизація

```
1. ApiKeyGuard reads API_KEY from env
2. If API_KEY empty → allow all (dev mode)
3. If API_KEY set → require X-API-Key or Authorization: Bearer
4. Mismatch → 401 Unauthorized
```

## 4.8 Сценарій: Health check

```
1. GET /api/v1/health
2. HealthReadService.getStats()
3. ping() database
4. count positions, get embedded count (cached 5 min)
5. Resolve status: down | degraded | ok
6. Return HealthStats JSON
```

## 4.9 Offline: Завантаження тарифу

```
1. npm run parse:pdf
   → read PDFs from env or data/pdfs/
   → write data/uktzed-positions.json (~14 872 positions)
2. npm run db:seed
   → upsert batch 500, delete obsolete codes
   → refresh search_vector trigger
3. npm run context:enrich
   → build search_context from parent chain
4. npm run embeddings:generate
   → OpenAI batch embed → pgvector
```

## 4.10 Offline: Видалення застарілих кодів

```
1. seed.ts: removeObsoleteCodes()
2. DELETE FROM uktzed_positions WHERE code NOT IN (parsed codes)
3. ⚠️ Небезпечно при partial parse — немає minimum count guard
```

---

# 5. API Documentation

**Base URL:** `http://{host}:{port}/api/v1`  
**Content-Type:** `application/json`

## 5.1 POST /classify

Класифікує товар за описом.

| Параметр | Значення |
|----------|----------|
| **URL** | `/api/v1/classify` |
| **Method** | `POST` |
| **Auth** | `X-API-Key: {API_KEY}` або `Authorization: Bearer {API_KEY}` (якщо `API_KEY` заданий в env) |
| **Rate Limit** | 20 req/min (route) + 30 req/min (global) |

### Request DTO

```json
{
  "product": "мотузка поліпропіленова для пакування"
}
```

### Validation Rules

| Field | Rules |
|-------|-------|
| `product` | `@IsString()`, `@IsNotEmpty()`, `@MaxLength(2000)` |
| Extra fields | Stripped by `whitelist: true` (not rejected in prod) |

### Success Response — 201 Created

```json
{
  "code": "5607 41",
  "name": "Шпагат та мотузки...",
  "group": "56",
  "confidence": 0.87,
  "reason": "Поліпропіленова мотузка для пакування...",
  "requiresReview": false,
  "candidates": []
}
```

### Response DTO — ClassifyResult

| Field | Type | Description |
|-------|------|-------------|
| `code` | `string \| null` | UKTZED code або null для broad/review |
| `name` | `string \| null` | Назва позиції з тарифу |
| `group` | `string \| null` | 2-digit group code |
| `confidence` | `number` | 0.0–1.0 composite score |
| `reason` | `string` | Пояснення українською |
| `requiresReview` | `boolean` | true → потрібен ручний вибір |
| `candidates` | `UktzedCandidate[]` | Альтернативи (якщо review) |

### UktzedCandidate

```json
{
  "code": "0302 32",
  "name": "жовтоперий",
  "score": 0.95,
  "groupCode": "03",
  "searchContext": "УКТ ЗЕД 0302 32 група 03: ..."
}
```

### Error Responses

| Status | Cause | Body |
|--------|-------|------|
| **400** | Empty product | `{ "statusCode": 400, "message": "Опис товару не може бути порожнім" }` |
| **400** | Validation fail | `{ "statusCode": 400, "message": [...] }` |
| **401** | Invalid API key | `{ "statusCode": 401, "message": "Invalid or missing API key" }` |
| **429** | Rate limit | `{ "statusCode": 429, "message": "ThrottlerException: Too Many Requests" }` |
| **500** | Unhandled error | Nest default error JSON |

### Приклади

**cURL:**
```bash
curl -X POST http://localhost:3001/api/v1/classify \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-secret-key" \
  -d '{"product": "мотузка поліпропіленова"}'
```

**Broad query response:**
```json
{
  "code": null,
  "name": null,
  "group": null,
  "confidence": 0.52,
  "reason": "тунець без уточнення виду Запит загальний — оберіть вид і обробку...",
  "requiresReview": true,
  "candidates": [
    { "code": "0302 32", "name": "жовтоперий", "score": 1, "groupCode": "03" },
    { "code": "0302 35", "name": "синій", "score": 0.95, "groupCode": "03" }
  ]
}
```

---

## 5.2 GET /health

Статус системи для DevOps.

| Параметр | Значення |
|----------|----------|
| **URL** | `/api/v1/health` |
| **Method** | `GET` |
| **Auth** | Same as classify (⚠️ рекомендується винести health без auth) |

### Success Response — 200 OK

```json
{
  "status": "ok",
  "positionsLoaded": 14872,
  "embeddingsLoaded": 14776,
  "searchMode": "hybrid",
  "checks": {
    "database": true,
    "positions": true,
    "embeddings": true
  }
}
```

### Status Values

| status | Умова |
|--------|-------|
| `ok` | DB up, positions > 0, embeddings > 0 (if hybrid/vector) |
| `degraded` | DB up, but missing positions or embeddings |
| `down` | DB unreachable |

### Error Responses

| Status | Cause |
|--------|-------|
| **401** | Invalid API key (if configured) |
| **429** | Rate limit |

---

# 6. Станові машини (State Machines)

## 6.1 Classification Result State

```mermaid
stateDiagram-v2
    [*] --> Searching
    Searching --> NoResults: 0 candidates
    Searching --> LLMClassify: candidates found
    NoResults --> ManualReview: requiresReview=true, code=null

    LLMClassify --> BroadBlocked: isBroad=true
    LLMClassify --> Validating: isBroad=false

    BroadBlocked --> ManualReview: code=null, candidates[]

    Validating --> AutoAccepted: confidence >= 0.75
    Validating --> SoftReview: 0.45 <= confidence < 0.75
    Validating --> HardFallback: confidence < 0.45

    AutoAccepted --> [*]: code set, requiresReview=false
    SoftReview --> [*]: code set, requiresReview=true, candidates[]
    HardFallback --> ManualReview: code=null, candidates[]
    ManualReview --> [*]
```

### Переходи

| From | To | Condition |
|------|-----|-----------|
| Searching | NoResults | `llmCandidates.length === 0` |
| LLMClassify | BroadBlocked | `isBroad === true` |
| Validating | AutoAccepted | `confidence >= CONFIDENCE_AUTO_THRESHOLD (0.75)` |
| Validating | SoftReview | `confidence >= 0.45 AND < 0.75` |
| Validating | HardFallback | `confidence < 0.45` OR code not in DB |

## 6.2 Health Status State

```
down ──(DB ping ok)──► degraded ──(positions>0 AND embeddings ok)──► ok
  ▲                        │
  └────(DB ping fail)──────┘
```

## 6.3 Query Type Detection

```
Input tokens
  ├── length=0 → isVague=true
  ├── length=1 + generic term (риба, м'ясо) → isVague=true
  ├── length=1 + broad term (тунець, сир) → isBroad=true
  └── else → specific query
```

---

# 7. База даних

## 7.1 ER Diagram

```mermaid
erDiagram
    UKTZED_POSITIONS {
        uuid id PK
        string code UK
        string code_raw
        string name
        string group_code
        string parent_code
        int level
        text search_context
        vector embedding
        tsvector search_vector
        string source
        timestamp created_at
    }

    CLASSIFICATION_AUDIT {
        uuid id PK
        text product_query
        string result_code
        float confidence
        boolean requires_review
        jsonb candidates
        text reason
        int latency_ms
        timestamp created_at
    }
```

> **Foreign Keys:** Між таблицями FK **немає**. `parent_code` — logical reference, не DB constraint.

## 7.2 Таблиця `uktzed_positions`

| Поле | Тип | Опис |
|------|-----|------|
| `id` | UUID PK | Primary key |
| `code` | TEXT UNIQUE | UKTZED code (`0302 32 90 00`) |
| `code_raw` | TEXT | Raw digits from PDF |
| `name` | TEXT | Tariff position name |
| `group_code` | TEXT | 2-digit group (01–97) |
| `parent_code` | TEXT NULL | Hierarchical parent |
| `level` | INT | 2/4/6/8/10 — code depth |
| `search_context` | TEXT NULL | Enriched text for embedding |
| `embedding` | vector(1536) NULL | OpenAI embedding |
| `search_vector` | tsvector NULL | Auto-maintained FTS |
| `source` | TEXT | Default `'tariff'` |
| `created_at` | TIMESTAMP | Insert time |

### Індекси

| Index | Type | Purpose |
|-------|------|---------|
| `uktzed_positions_code_key` | UNIQUE | Lookup by code |
| `uktzed_positions_group_code_idx` | B-tree | Filter by group |
| `uktzed_positions_level_idx` | B-tree | Level filtering |
| `idx_uktzed_search_vector` | GIN | Full-text search |
| `idx_uktzed_embedding_hnsw` | HNSW | Vector similarity |

### Trigger

`uktzed_positions_search_vector_trigger` — auto-updates `search_vector` on INSERT/UPDATE.

## 7.3 Таблиця `classification_audit`

| Поле | Тип | Опис |
|------|-----|------|
| `id` | UUID PK | |
| `product_query` | TEXT | Original user input |
| `result_code` | TEXT NULL | Classified code |
| `confidence` | FLOAT NULL | |
| `requires_review` | BOOLEAN | |
| `candidates` | JSONB NULL | Alternative codes |
| `reason` | TEXT NULL | LLM/validator reason |
| `latency_ms` | INT NULL | Pipeline duration |
| `created_at` | TIMESTAMP | |

### Індекси

| Index | Purpose |
|-------|---------|
| `classification_audit_created_at_idx` | Retention queries, time-range analytics |

## 7.4 Foreign Keys

**Список FK:** немає (by design).

`parent_code` → logical self-reference to `code`, enforced in application/parser, not DB.

## 7.5 Потенційні вузькі місця

| Bottleneck | Impact | Mitigation |
|------------|--------|------------|
| HNSW vector search at scale | Latency | Tune `ef_search`, partition by group |
| GIN tsvector on 15K rows | Low now | Monitor at 100K+ |
| Sequential OpenAI calls | 500ms–2s per classify | Embedding cache |
| Audit table growth | Disk | Retention job (not implemented) |
| Batch seed transaction | Lock during reload | Smaller batches off-hours |

---

# 8. Frontend Integration Guide

## 8.1 Загальні принципи

- **Один основний endpoint:** `POST /api/v1/classify`
- **Health для readiness:** `GET /api/v1/health`
- **Немає pagination** — один product per request
- **Немає WebSocket/SSE** — request/response only
- **Retry:** лише на 429/5xx, не на 400

## 8.2 Headers

```http
Content-Type: application/json
X-API-Key: your-secret-key
```

## 8.3 UX Recommendations

| API field | UI behavior |
|-----------|-------------|
| `requiresReview: true` | Show candidate picker, highlight low confidence |
| `code: null` | Don't auto-fill; force user selection from candidates |
| `candidates[]` | Display as selectable list with code + name |
| `confidence < 0.75` | Warning badge |
| `reason` | Show as tooltip/explanation |

## 8.4 Retry Strategy

```
Attempt 1 → fail 429/503
  → wait Retry-After or exponential backoff (1s, 2s, 4s)
  → max 3 retries
  → do NOT retry 400/401
```

## 8.5 Caching

| Data | Cache? |
|------|--------|
| Classify results | Optional client cache by product hash (TTL 5–15 min) |
| Health | No cache (use for readiness probes) |
| Tariff positions | Not exposed via API |

---

## 8.6 React (fetch)

```tsx
const API_BASE = process.env.NEXT_PUBLIC_UKTZED_API ?? 'http://localhost:3001/api/v1';
const API_KEY = process.env.NEXT_PUBLIC_UKTZED_API_KEY;

export interface ClassifyResult {
  code: string | null;
  name: string | null;
  group: string | null;
  confidence: number;
  reason: string;
  requiresReview: boolean;
  candidates: Array<{ code: string; name: string; score: number; groupCode: string }>;
}

export async function classifyProduct(product: string): Promise<ClassifyResult> {
  const res = await fetch(`${API_BASE}/classify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(API_KEY ? { 'X-API-Key': API_KEY } : {}),
    },
    body: JSON.stringify({ product }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message ?? `HTTP ${res.status}`);
  }

  return res.json();
}
```

## 8.7 Next.js (Server Action)

```typescript
'use server';

export async function classifyProductAction(product: string) {
  const res = await fetch(`${process.env.UKTZED_API_URL}/api/v1/classify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': process.env.UKTZED_API_KEY!,
    },
    body: JSON.stringify({ product }),
    cache: 'no-store',
  });

  if (!res.ok) throw new Error(`Classification failed: ${res.status}`);
  return res.json();
}
```

## 8.8 React Query

```tsx
import { useMutation } from '@tanstack/react-query';
import { classifyProduct } from './api';

export function useClassifyProduct() {
  return useMutation({
    mutationFn: (product: string) => classifyProduct(product),
    retry: (count, error) => {
      if (error.message.includes('429') && count < 3) return true;
      return false;
    },
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
  });
}

// Usage
const { mutate, data, isPending, error } = useClassifyProduct();
mutate('мотузка поліпропіленова');
```

## 8.9 RTK Query

```typescript
import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';

export const uktzedApi = createApi({
  reducerPath: 'uktzedApi',
  baseQuery: fetchBaseQuery({
    baseUrl: '/api/v1',
    prepareHeaders: (headers) => {
      headers.set('X-API-Key', import.meta.env.VITE_UKTZED_API_KEY);
      return headers;
    },
  }),
  endpoints: (builder) => ({
    classify: builder.mutation<ClassifyResult, { product: string }>({
      query: (body) => ({
        url: '/classify',
        method: 'POST',
        body,
      }),
    }),
    health: builder.query<HealthStats, void>({
      query: () => '/health',
    }),
  }),
});

export const { useClassifyMutation, useHealthQuery } = uktzedApi;
```

---

# 9. Події системи

> Система **не використовує** event bus, message queue чи WebSocket. «Події» — side effects у pipeline.

```text
CLASSIFY_REQUEST_RECEIVED
 ├── ThrottlerGuard (rate check)
 ├── ApiKeyGuard (auth check)
 ├── ValidationPipe (DTO validation)
 └── ClassifyProductUseCase.execute()
      └── ClassificationPipeline.classify()
           ├── QUERY_NORMALIZED
           ├── RULES_ANALYZED → RuleHint[]
           ├── SEARCH_COMPLETED → UktzedCandidate[]
           ├── RERANK_COMPLETED
           ├── LLM_CLASSIFIED → {code, confidence, reason}
           │    └── (on failure) LLM_FALLBACK → keyword top match
           ├── VALIDATED → ClassifyResult
           └── AUDIT_LOG_WRITE (async, non-blocking)
                ├── Success → INSERT classification_audit
                └── Failure → Logger.error (does not fail request)
```

### Слухачі

| Event / Side Effect | Handler | Failure mode |
|---------------------|---------|--------------|
| Audit write | `AuditLoggerService` | Logged, request succeeds |
| LLM failure | `classifyWithFallback()` | Degraded classification |
| No embeddings | `VectorSearchService` | Returns `[]`, keyword only |

---

# 10. Конфігурація

| Variable | Type | Required | Default | Description |
|----------|------|----------|---------|-------------|
| `DATABASE_URL` | string | **Yes** | — | PostgreSQL connection string |
| `OPENAI_API_KEY` | string | **Yes*** | — | OpenAI API key (*required at startup even for keyword mode) |
| `PORT` | number | No | `3000` | HTTP port (.env.example: 3001) |
| `SEARCH_MODE` | enum | No | `hybrid` | `keyword` \| `vector` \| `hybrid` |
| `HYBRID_KEYWORD_WEIGHT` | number | No | `0.6` | Keyword weight in hybrid merge (0–1) |
| `EMBEDDING_MODEL` | string | No | `text-embedding-3-small` | OpenAI embedding model |
| `EMBEDDING_DIMENSIONS` | number | No | — | **Not used in code** (schema hardcodes 1536) |
| `EMBEDDING_MIN_LEVEL` | number | No | `4` | Min code level for embeddings |
| `CONFIDENCE_AUTO_THRESHOLD` | number | No | `0.75` | Auto-accept threshold |
| `CONFIDENCE_REVIEW_THRESHOLD` | number | No | `0.45` | Minimum to return code |
| `LLM_MODEL` | string | No | `gpt-4o-mini` | OpenAI chat model |
| `THROTTLE_TTL_MS` | number | No | `60000` | Global throttle window (ms) |
| `THROTTLE_LIMIT` | number | No | `30` | Max requests per window (global) |
| `API_KEY` | string | No | empty | If set, required on all endpoints |
| `TARIFF_PDF_GROUPS_01_49` | path | No | — | PDF path groups 01–49 |
| `TARIFF_PDF_GROUPS_50_97` | path | No | — | PDF path groups 50–97 |

### Приклад `.env`

```env
DATABASE_URL=postgresql://uktzed:uktzed@localhost:5434/uktzed
OPENAI_API_KEY=sk-...
PORT=3001
SEARCH_MODE=hybrid
API_KEY=production-secret-key
```

---

# 11. Безпека

## 11.1 Authentication

| Mechanism | Status |
|-----------|--------|
| JWT | ❌ Not implemented |
| API Key | ✅ Optional via `X-API-Key` or `Bearer` |
| Session | ❌ |

**Production recommendation:** Always set `API_KEY`. Guard allows all requests when empty (dev mode).

## 11.2 Authorization

RBAC/permissions — **not implemented**. Single API key = full access.

## 11.3 Rate Limiting

| Layer | Limit |
|-------|-------|
| Global (`ThrottlerModule`) | 30 req / 60s |
| Route (`@Throttle` on classify) | 20 req / 60s |

## 11.4 Input Validation

- `class-validator` on DTO
- `@MaxLength(2000)` on product
- `ValidationPipe`: whitelist + transform

## 11.5 SQL Injection

- Repository uses parameterized `$queryRawUnsafe` with bound params
- Scripts: some string interpolation (`MIN_LEVEL`) — low risk, offline only

## 11.6 XSS / CSRF

- JSON API only, no HTML rendering
- CSRF not applicable for pure API (no cookies)
- Frontend must sanitize display of `reason` field

## 11.7 CORS

**Not configured** in `main.ts`. Add for browser clients:

```typescript
app.enableCors({ origin: ['https://your-app.com'] });
```

## 11.8 Secrets

- Never commit `.env`
- Rotate `OPENAI_API_KEY` and `API_KEY` periodically
- Docker Compose defaults (`uktzed/uktzed`) — dev only

---

# 12. Background Jobs

> **Немає** runtime queue (Bull, SQS). Offline scripts виконуються manually/CI.

| Job | Command | When | Retry | Idempotent |
|-----|---------|------|-------|------------|
| PDF Parse | `npm run parse:pdf` | Data update | Manual | Yes (overwrites JSON) |
| DB Seed | `npm run db:seed` | After parse | Manual | Yes (upsert) |
| Enrich Context | `npm run context:enrich` | After seed | Manual | Yes |
| Generate Embeddings | `npm run embeddings:generate` | After enrich | Manual | Skips existing |
| Full Reload | `npm run data:reload` | Major update | Manual | ⚠️ All-or-nothing |

**Dead Letter Queue:** N/A  
**Cron:** Not configured — recommend k8s CronJob for periodic tariff updates

---

# 13. Error Handling

| Code | HTTP | Message | When | Frontend action |
|------|------|---------|------|-----------------|
| `EMPTY_PRODUCT` | 400 | Опис товару не може бути порожнім | Whitespace-only input | Show validation error |
| `VALIDATION_ERROR` | 400 | class-validator messages | Invalid DTO | Fix form input |
| `UNAUTHORIZED` | 401 | Invalid or missing API key | Wrong/missing API key | Check env/config |
| `TOO_MANY_REQUESTS` | 429 | ThrottlerException | Rate limit exceeded | Retry with backoff |
| `INTERNAL_ERROR` | 500 | Nest default | Unhandled exception | Show generic error, retry |
| `NO_RESULTS` | 201* | reason: Не знайдено... | *Success HTTP, business empty | Show manual search UI |
| `LLM_UNAVAILABLE` | 201* | reason contains LLM недоступний | OpenAI down | Show degraded warning |
| `REQUIRES_REVIEW` | 201* | requiresReview: true | Low confidence | Show candidate picker |

> Classification «errors» often return **201** with `code: null` — це business fallback, не HTTP error.

---

# 14. Monitoring та Observability

## 14.1 Logging

| Logger | Level | What |
|--------|-------|------|
| `ClassificationPipeline` | WARN | LLM failures |
| `AuditLoggerService` | ERROR | Audit write failures |
| NestJS default | LOG | Startup, requests |

**Format:** Nest default text. Structured JSON logging — not configured.

## 14.2 Metrics

**Not implemented.** Recommend:
- `classify_requests_total`
- `classify_latency_ms` (histogram)
- `llm_errors_total`
- `confidence_distribution`

## 14.3 Health Checks

```
GET /api/v1/health
→ { status, positionsLoaded, embeddingsLoaded, checks }
```

| Probe | Pass condition |
|-------|----------------|
| Liveness | HTTP 200 |
| Readiness | `status !== 'down'` |
| Full ready | `status === 'ok'` |

## 14.4 Tracing

**Not implemented.** Recommend OpenTelemetry for pipeline stages.

## 14.5 Failure Points

| Component | Symptom | Detection |
|-----------|---------|-----------|
| PostgreSQL down | 500 errors, health `down` | `/health` |
| OpenAI down | LLM fallback, lower confidence | Logs, reason field |
| No embeddings | Vector search skipped | health `degraded` |
| Empty tariff DB | All classify → no results | health `degraded` |
| Rate limit | 429 | Client retry |

---

# 15. Як працює система від початку до кінця

## Повний життєвий цикл запиту `POST /classify`

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. WEB/ERP надсилає POST /api/v1/classify                       │
│    Body: { "product": "мотузка поліпропіленова" }               │
│    Headers: X-API-Key, Content-Type: application/json             │
└────────────────────────────┬────────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. NestJS HTTP layer (Express adapter)                          │
│    Global prefix: api/v1                                        │
└────────────────────────────┬────────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3. GUARDS (middleware chain)                                    │
│    a) ThrottlerGuard — check rate limit (20/min route)          │
│    b) ApiKeyGuard — validate API key if configured              │
└────────────────────────────┬────────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ 4. ValidationPipe                                               │
│    Transform + whitelist DTO fields                             │
│    Reject if product empty after trim                           │
└────────────────────────────┬────────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ 5. ClassifyController.classify()                                │
│    Delegates to ClassifyProductUseCase                          │
└────────────────────────────┬────────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ 6. ClassifyProductUseCase.execute()                             │
│    trim(product), throw BadRequestException if empty            │
└────────────────────────────┬────────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ 7. ClassificationPipeline.classify()                          │
│                                                                 │
│  7a. NormalizerService                                          │
│      "  МОТУЗКА ..." → tokens, isVague, isBroad                 │
│                                                                 │
│  7b. RulesEngineService                                         │
│      regex → [{ groupCodes: ['56'], boost: 0.15 }]              │
│                                                                 │
│  7c. HybridSearchService                                        │
│      ├─ KeywordSearchService → PostgreSQL FTS (to_tsquery)      │
│      └─ VectorSearchService → OpenAI embed → pgvector HNSW      │
│      merge scores (60% keyword + 40% vector)                    │
│                                                                 │
│  7d. RerankerService — apply rule boosts                        │
│                                                                 │
│  7e. OpenAI LLM (gpt-4o-mini)                                   │
│      structured output: { code, confidence, reason }            │
│      (fallback to keyword if LLM fails)                         │
│                                                                 │
│  7f. ValidatorService                                           │
│      verify code in DB + candidates                             │
│      compute weighted confidence                                │
│      apply thresholds → requiresReview                          │
└────────────────────────────┬────────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ 8. DATABASE operations                                          │
│    READ: keywordSearch, vectorSearch, findByCode                │
│    WRITE: classification_audit (async, non-blocking)            │
└────────────────────────────┬────────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ 9. CACHE                                                        │
│    EmbeddingStatusService: in-memory count (TTL 5 min)          │
│    No query result cache                                        │
└────────────────────────────┬────────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ 10. Response formation                                          │
│     ClassifyResult JSON                                         │
│     HTTP 201 Created                                            │
└────────────────────────────┬────────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ 11. Client receives:                                          │
│     { code, name, group, confidence, reason,                    │
│       requiresReview, candidates }                              │
└─────────────────────────────────────────────────────────────────┘
```

---

## Quick Start (for new developers)

```bash
# 1. Infrastructure
docker compose up -d

# 2. Dependencies
npm install

# 3. Environment
cp .env.example .env
# Edit OPENAI_API_KEY, DATABASE_URL

# 4. Database
npm run db:migrate:deploy
npm run data:reload   # ~15-30 min first time

# 5. Run
npm run start:dev

# 6. Test
curl http://localhost:3001/api/v1/health
curl -X POST http://localhost:3001/api/v1/classify \
  -H "Content-Type: application/json" \
  -d '{"product": "мотузка поліпропіленова"}'
```

---

## Related Documents

| Document | Path |
|----------|------|
| Architecture (original) | `README.md` |
| Benchmark fixtures | `test/fixtures/benchmark.json` |
| CI pipeline | `.github/workflows/ci.yml` |

---

*Документація згенерована на основі codebase v1.0.0. При зміні API оновлюйте цей файл разом з PR.*
