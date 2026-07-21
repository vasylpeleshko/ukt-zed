# Deploy: Neon (Postgres + pgvector) + Render (API)

Безкоштовний демо-стек для цього бекенду.

| Компонент | Сервіс | План |
|---|---|---|
| API (NestJS) | [Render](https://render.com) | Free Web Service |
| PostgreSQL + pgvector | [Neon](https://neon.tech) | Free |
| LLM / embeddings | OpenAI | **платно** (окремий ключ) |

> Акаунти Render / Neon / OpenAI і push у GitHub маєш зробити ти — я підготував файли в репо (`Dockerfile`, `render.yaml`, CORS, public `/health`).

---

## 0. Передумови

- Акаунт [GitHub](https://github.com)
- Акаунт [Neon](https://neon.tech)
- Акаунт [Render](https://dashboard.render.com)
- `OPENAI_API_KEY`
- Локально: Node 22+, Docker (для локальної БД) або вже заповнена локальна Postgres

Цей проєкт **ще не був git-репозиторієм**. Перед деплоєм:

```bash
cd /Users/user/Desktop/projects/ukt-zed
git init
git add .
git commit -m "Prepare deploy: Docker, Render, Neon"
# Створи репо на GitHub, потім:
git branch -M main
git remote add origin https://github.com/<YOU>/ukt-zed.git
git push -u origin main
```

Не коміть `.env` (він уже в `.gitignore`).

---

## 1. Neon — база з pgvector

1. Create Project → регіон ближче до Render (напр. Frankfurt / EU).
2. Dashboard → **Connection string** → скопіюй **pooled** або direct URL  
   (для Prisma migrate краще **direct** / non-pooler; для runtime можна pooled з `?pgbouncer=true` якщо треба).
3. Увімкни розширення (SQL Editor у Neon):

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

Міграції також роблять `CREATE EXTENSION IF NOT EXISTS vector;`, але краще перевірити вручну один раз.

Збережи URL як `DATABASE_URL`.

---

## 2. Залити дані (локально → Neon)

API без позицій і embeddings майже марний. Запуск **з твоєї машини** проти Neon:

```bash
# у .env тимчасово постав Neon DATABASE_URL + OPENAI_API_KEY
export DATABASE_URL='postgresql://...@...neon.tech/neondb?sslmode=require'
export OPENAI_API_KEY='sk-...'

npm ci
npx prisma migrate deploy
npm run db:seed

# далі (довго + коштує OpenAI):
npm run context:enrich
npm run embeddings:generate
# або одним пайплайном, якщо PDF уже розпарсені в data/:
# npm run phase2.1
```

Перевірка:

```bash
npx prisma db execute --stdin <<< "SELECT COUNT(*) FROM uktzed_positions;"
```

Альтернатива: `pg_dump` з локального docker Postgres і `pg_restore` у Neon (швидше, якщо локальна БД вже повна).

---

## 3. Render — API

1. [Render Dashboard](https://dashboard.render.com) → **New** → **Blueprint**  
   або **New Web Service** → підключи GitHub-репо.
2. Якщо Blueprint: обери репо з `render.yaml` (сервіс `ukt-zed-api`).
3. Якщо вручну (Docker):
   - Runtime: **Docker**
   - Dockerfile path: `./Dockerfile`
   - Plan: **Free**
   - Health Check Path: `/api/v1/health`
4. Environment variables (Secrets):

| Key | Value |
|---|---|
| `DATABASE_URL` | Neon connection string |
| `OPENAI_API_KEY` | твій ключ |
| `API_KEY` | (опційно) секрет для `POST /classify` |
| `CORS_ORIGIN` | URL фронту, або порожньо для демо |

Решту дефолтів уже задає `render.yaml`.

5. Deploy → дочекайся зеленого статусу.

Перевірка:

```bash
curl https://<your-service>.onrender.com/api/v1/health
```

Класифікація:

```bash
curl -X POST https://<your-service>.onrender.com/api/v1/classify \
  -H 'Content-Type: application/json' \
  -H 'x-api-key: <API_KEY якщо задано>' \
  -d '{"product":"мотузка поліпропіленова для пакування"}'
```

---

## 4. Обмеження Free

- Render Free **засинає** після ~15 хв без запитів (cold start 30–60+ с).
- Neon Free має ліміти storage / compute.
- Генерація embeddings **не** на free web service — тільки локально / one-off job.
- OpenAI завжди окремий рахунок.

---

## 5. Файли в репо

| Файл | Навіщо |
|---|---|
| `Dockerfile` | production image, migrate on start |
| `render.yaml` | Blueprint для Render Free |
| `.dockerignore` | менший контекст збірки |
| `CORS_ORIGIN` | браузерний клієнт |
| `@Public()` на `/health` | healthcheck без API key |

Локально зібрати образ:

```bash
docker build -t ukt-zed-api .
docker run --rm -p 3000:3000 \
  -e DATABASE_URL=... \
  -e OPENAI_API_KEY=... \
  ukt-zed-api
```
