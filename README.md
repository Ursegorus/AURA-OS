# AURA OS — Agentic Unified Runtime Architecture

Скачали, открыли, написали «сделай лендинг для кафе» — через минуту сайт готов. Ни строчки кода писать не пришлось.

Не требует возни с Python, Node.js или терминалом — если чего-то нет, AURA скачает и поставит сама. Из коробки работает **на двух бесплатных агентах OpenCode — без ключей, регистрации и карты.** Хотите подключить Claude, Codex или Gemini — AURA ставит их CLI в один клик и прямо в карточке агента пишет, что нужно для входа (см. [«Что нужно для агентов»](#что-нужно-для-агентов)).

---

## Для кого это

**Для тех, кто не умеет программировать.** Хотите сайт, приложение, телеграм-бота — опишите словами, и AURA OS сделает. Не нужно нанимать разработчика и платить тысячи долларов.

**Для тех, кто устал переключаться между ИИ-инструментами.** Claude Code, Codex, Gemini, OpenCode, Ollama — все в одном окне. AURA OS сама решает, какой агент лучше справится с задачей, и распределяет работу.

**Для тех, кто ведёт базу знаний.** Если пользуетесь Obsidian — AURA OS читает ваши заметки и находит нужное под каждую задачу. Если Obsidian нет — создаёт свою базу с нуля, с графом связей.

---

## Как это работает

Вы пишете задачу по-русски:

> «Сделай лендинг для кафе, добавь меню, контакты и форму заказа»

AURA OS ищет релевантный контекст в вашей базе знаний, подбирает подходящий AI-движок, запускает агентов и возвращает результат. Всё сохраняется — к этому можно вернуться через неделю и продолжить.

---

## Возможности

- **Динамический харнес** — AURA сама подбирает обвязку под задачу: паттерн оркестрации (single / loop / fan-out / adversarial / tournament / …), циклы и проверки. Состояние живёт в файлах, не в контексте модели. Подробно → [docs/HARNESS.ru.md](docs/HARNESS.ru.md)
- **Ralph Loop** — агент идёт к цели шаг за шагом до готовности, с backpressure (тест-команда) и фазовой автономией
- **Агенты на выбор** — два бесплатных агента OpenCode (исполнитель + ревьюер) работают сразу без ключей; плюс Claude Code, Codex, Gemini, Kimi, Hermes, Ollama — ставятся в один клик, у каждого в карточке указано, что нужно для работы (вход/подписка/ничего)
- **База, которая помнит всё** — Obsidian или встроенная, с поиском по всем заметкам и графом связей. `CONSTRAINTS.md` автозагружается в каждый прогон
- **Магазин скиллов** — 672 готовых навыка для Hermes, установка в один клик
- **Управление с телефона** — через Telegram-бота: запустил задачу, получил результат. Важно честно: бот работает, только пока запущена AURA — нужен **включённый ПК с программой** либо установка на **VPS-сервер** для доступности 24/7
- **Автоустановка** — при первом запуске скачает Node.js и Python, поставит двух бесплатных агентов OpenCode и создаст базу знаний. Сложные агенты (с ключами) — по кнопке, когда захотите
- **Умный выбор агента** — в режиме «авто» AURA берёт наиболее подходящего под задачу по навыкам (веб-поиск / код / анализ), а не первого по списку
- **Уточнения вместо догадок** — при неоднозначности AURA задаёт прямой вопрос с вариантами и рекомендацией и только потом выполняет — никаких выдуманных данных в результате
- **Безопасность** — хуки блокируют опасные команды (`rm -rf`, форматирование, pipe-to-shell) до выполнения; в Telegram деструктивное требует подтверждения `/force`
- **История задач не теряется** — задачи и полные логи пишутся на диск и переживают перезапуск; у каждой задачи свой лог-файл
- **SOUL** — AURA подхватывает описание вас и ваших проектов (свой файл или из вашей базы знаний), чтобы агенты были заточены под вас
- **OpenRouter** — один ключ на множество моделей с оплатой криптой; «мозг» для плана/ресёрча/критики (переиспользует ключ из env/Hermes, если он уже есть)
- **Карта кода** — нативный граф зависимостей проекта: агент читает только связанные файлы (экономия токенов), без единого лишнего файла в базе

> **Модель — commodity, harness — moat.** Ценность не в модели (она у всех одна), а в обвязке вокруг неё. AURA даёт moat-слой поверх ваших BYO-моделей: умную маршрутизацию моделей, набор из 6 паттернов оркестрации и Self-Improving Loop — см. [docs/HARNESS.ru.md](docs/HARNESS.ru.md).

---

## Как начать

```bash
# Скачайте установщик для вашей системы со страницы релизов
# https://github.com/Ursegorus/AURA-OS/releases

# Или соберите из исходников
npm install
npm run dist:win    # Windows
npm run dist:linux  # Linux
# macOS — через GitHub Actions
```

После запуска AURA OS сама поставит Node.js и двух бесплатных агентов OpenCode — и вы сразу можете давать задачи, **без ключей и регистраций.** Остальные агенты — по желанию, в один клик.

---

## Что нужно для агентов

AURA честна про то, что требуется каждому агенту. Это же написано прямо в карточке агента в приложении.

| Агент | Что нужно | Стоимость |
|---|---|---|
| **OpenCode · DeepSeek (free)** | Ничего — работает сразу | Бесплатно, без ключей (лимиты, под лёгкие задачи) |
| **OpenCode · Nemotron (free)** | Ничего — работает сразу | Бесплатно, без ключей (лимиты, под лёгкие задачи) |
| **Gemini CLI** | Вход в Google-аккаунт (`gemini` → браузер) | Бесплатный тариф **сильно лимитирован**; объём — платный ключ |
| **Ollama** | Установить Ollama + `ollama pull` модели | Бесплатно, локально, нужно железо |
| **Claude Code** | Подписка Claude (Pro/Max) или API-ключ | Платно |
| **Codex CLI** | Аккаунт ChatGPT (Plus+) или ключ OpenAI | Платно |
| **Kimi Code** | API-ключ Moonshot AI | Платно |
| **Hermes** | Настройка провайдера/ключа (опционален) | Зависит от провайдера |

**Минимальный сценарий «ничего нет»:** нажмите «Установить бесплатных агентов» → AURA поставит OpenCode → получите двух рабочих агентов (исполнитель + ревьюер) на бесплатных моделях. Оркестратор в этом режиме — встроенный движок OpenCode (надёжный одиночный агент) или мультиагент AURA (planner → исполнитель → ревьюер) на выбор — всё без единого ключа.

> **Честно про бесплатные модели.** Free-модели OpenCode отлично подходят для **ответов, черновиков, планов и лёгких правок**. Но для **надёжного создания файлов и полноценных сборок** («сделай лендинг», «собери приложение») их мощности и качества инструментов часто не хватает — иногда модель отрапортует «готово», не создав файла. Для серьёзных задач подключите агента посильнее — **Claude Code**, **Codex** или **Gemini** (один клик + вход). AURA честно показывает это на карточке каждого агента.

---

## Системные требования

Windows 10/11 x64, Linux x64, macOS 12+. 500 МБ на диске.

---

## Как появилась

Первый рабочий прототип — 10 минут и один промпт в Claude Cowork на Fable 5. За неделю собрали то, что есть сейчас: Claude Code Opus 4.8 + Hermes Agent. Проект с открытым кодом (MIT).

Ставьте, тестируйте, пишите что не так. Обратная связь — в issues на GitHub.

---

## Благодарности

Проект использует идеи и код:
— [Hermes Agent](https://github.com/NousResearch/hermes-agent) — базовый движок оркестрации (Nous Research)
— [OpenCode](https://github.com/anomalyco/opencode) — бесплатный CLI-агент (Anomaly, 178k⭐)
— [Kimi K2.7 Code](https://github.com/moonshotai/Kimi-K2.7-Code) — открытая модель кодирования (Moonshot AI)
— [Second Brain Kit](https://github.com/vasin-k-i/second-brain-kit) — типовая структура базы знаний (Константин Васин)
— [SwarmVault](https://github.com/swarmclawai/swarmvault) — концепция knowledge graph (SwarmClaw AI)
— [Graphify](https://github.com/safishamsi/graphify) — граф зависимостей кода (Safi Shamsi, 71k⭐)
— [vis-network](https://github.com/visjs/vis-network) — библиотека визуализации графа (vis.js community)

[Boosty](https://boosty.to/aura_os)

---

## English

**AURA OS** — Agentic Unified Runtime Architecture. Download, type your task, get the result. No code required.

No fiddling with Python, Node.js or the terminal — AURA installs what's missing on first launch. Out of the box it runs on **two free OpenCode agents — no keys, no signup, no card.** Want Claude, Codex or Gemini? AURA installs their CLI in one click and tells you, right on the agent card, what each needs to sign in (see [What each agent needs](#what-each-agent-needs)).

### Who it's for

**For non-programmers.** Want a website, app, Telegram bot? Describe it in words — AURA OS builds it. No need to hire a developer.

**For those tired of switching AI tools.** Claude Code, Codex, Gemini, OpenCode, Ollama — all in one window. AURA OS picks the right agent for each task.

**For knowledge base users.** If you use Obsidian — AURA OS reads your vault and finds relevant context for each task. No Obsidian? It creates its own knowledge base with a graph view.

### Features

- **Dynamic harness** — AURA builds the harness for each task: the orchestration pattern (single / loop / fan-out / adversarial / tournament / …), loops and verification. State lives in files, not the model context. Details → [docs/HARNESS.ru.md](docs/HARNESS.ru.md)
- **Ralph Loop** — the agent moves toward the goal step by step until done, with backpressure (test command) and phased autonomy
- **Agents of your choice** — two free OpenCode agents (worker + reviewer) run instantly with no keys; plus Claude Code, Codex, Gemini, Kimi, Hermes, Ollama — one-click install, and each card states exactly what it needs (sign-in / subscription / nothing)
- **Knowledge base that remembers** — Obsidian or built-in, with full-text search and a connection graph. `CONSTRAINTS.md` is auto-loaded into every run
- **Skills shop** — 672 pre-built skills for Hermes, one-click install
- **Telegram control** — manage tasks from your phone, get results on the go. Honestly: the bot only works while AURA is running — you need a **PC powered on with the app**, or install AURA on a **VPS** for 24/7 availability
- **Auto-setup** — first launch downloads Node.js and Python, installs two free OpenCode agents and creates a knowledge base. Key-based agents are one click away, whenever you want
- **Smart agent selection** — in "auto" mode AURA picks the agent best suited to the task by skills (web-search / coding / analysis), not the first in the list
- **Clarify, don't guess** — on ambiguity AURA asks a direct question with options and a recommendation before running — no made-up data in the result
- **Security** — hooks block dangerous commands (`rm -rf`, disk format, pipe-to-shell) before they run; in Telegram destructive ones require `/force` confirmation
- **Task history persists** — tasks and full logs are written to disk and survive restarts; each task has its own log file
- **SOUL** — AURA loads a description of you and your projects (your own file or from your knowledge base) so agents are tailored to you
- **OpenRouter** — one key for many models with crypto payment; a "brain" for planning/research/critique (reuses an existing key from env/Hermes if present)
- **Code map** — a native project dependency graph: the agent reads only related files (token savings), without writing a single extra file to your base

> **The model is commodity, the harness is the moat.** The value isn't the model (everyone has the same one), it's the harness around it. AURA gives you a moat layer over your BYO models: smart model routing, a set of 6 orchestration patterns and a Self-Improving Loop — see [docs/HARNESS.ru.md](docs/HARNESS.ru.md).

### Quick start

```bash
# Download the installer from the releases page
# https://github.com/Ursegorus/AURA-OS/releases

# Or build from source
npm install
npm run dist:win    # Windows
npm run dist:linux  # Linux
# macOS — via GitHub Actions
```

On launch AURA installs Node.js and two free OpenCode agents — you can start giving tasks right away, **no keys or signup.** Other agents are optional, one click each.

### What each agent needs

AURA is honest about what every agent requires — the same note appears on the agent's card in the app.

| Agent | What it needs | Cost |
|---|---|---|
| **OpenCode · DeepSeek (free)** | Nothing — works instantly | Free, no keys (rate-limited, light tasks) |
| **OpenCode · Nemotron (free)** | Nothing — works instantly | Free, no keys (rate-limited, light tasks) |
| **Gemini CLI** | Google sign-in (`gemini` → browser) | Free tier is **heavily limited**; volume needs a paid key |
| **Ollama** | Install Ollama + `ollama pull` a model | Free, local, needs hardware |
| **Claude Code** | Claude subscription (Pro/Max) or API key | Paid |
| **Codex CLI** | ChatGPT account (Plus+) or OpenAI key | Paid |
| **Kimi Code** | Moonshot AI API key | Paid |
| **Hermes** | Provider/key setup (optional) | Depends on provider |

**The "I have nothing" path:** click "Install free agents" → AURA installs OpenCode → you get two working agents (worker + reviewer) on free models. The orchestrator here is either the built-in OpenCode engine (reliable single agent) or AURA's multi-agent flow (planner → worker → reviewer) — your choice, no keys.

> **Honest note on free models.** OpenCode's free models are great for **answers, drafts, plans and light edits**. But for **reliably creating files and full builds** ("make a landing page", "build an app") their capability and tool quality often fall short — sometimes the model reports "done" without actually writing a file. For serious work, connect a stronger agent — **Claude Code**, **Codex** or **Gemini** (one click + sign-in). AURA states this honestly on each agent's card.

### How it was made

The first working prototype — 10 minutes and one prompt in Claude Cowork on Fable 5. One week to build what's here: Claude Code Opus 4.8 + Hermes Agent. MIT license.

### Acknowledgments

— [Hermes Agent](https://github.com/NousResearch/hermes-agent) — orchestration engine (Nous Research)
— [OpenCode](https://github.com/anomalyco/opencode) — free CLI agent (Anomaly, 178k⭐)
— [Kimi K2.7 Code](https://github.com/moonshotai/Kimi-K2.7-Code) — open coding model (Moonshot AI)
— [Second Brain Kit](https://github.com/vasin-k-i/second-brain-kit) — knowledge base template (Konstantin Vasin)
— [SwarmVault](https://github.com/swarmclawai/swarmvault) — knowledge graph concept (SwarmClaw AI)
— [Graphify](https://github.com/safishamsi/graphify) — code dependency graph (Safi Shamsi, 71k⭐)
— [vis-network](https://github.com/visjs/vis-network) — graph visualization library (vis.js community)

### Requirements

Windows 10/11 x64, Linux x64, macOS 12+. 500 MB disk space.
