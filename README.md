# AURA OS — Agentic Unified Runtime Architecture

Скачали, открыли, написали «сделай лендинг для кафе» — через минуту сайт готов. Ни строчки кода писать не пришлось.

Не требует установки Python, Node.js, ключей API или работы в терминале. Если чего-то нет — программа скачает и поставит сама.

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

- **6 встроенных AI-агентов** — Hermes, Claude Code, OpenCode, Codex, Kimi Code, Ollama. OpenCode работает без ключей и регистрации
- **База, которая помнит всё** — Obsidian или встроенная, с поиском по всем заметкам и графом связей
- **Магазин скиллов** — 672 готовых навыка для Hermes, установка в один клик
- **Управление с телефона** — через Telegram бота: запустил задачу, получил результат, не открывая компьютер
- **Автоустановка** — при первом запуске скачает Node.js и Python, настроит агентов, создаст базу знаний

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

После запуска AURA OS сама установит всё необходимое. Никаких консолей, ключей и регистраций.

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
— [AI Free](https://github.com/Staks-sor/ai-free) — бесплатный API через браузер (Staks-sor)
— [vis-network](https://github.com/visjs/vis-network) — библиотека визуализации графа (vis.js community)

[Boosty](https://boosty.to/aura_os)

---

## English

**AURA OS** — Agentic Unified Runtime Architecture. Download, type your task, get the result. No code required.

No need to install Python, Node.js, API keys or work in a terminal. If something is missing — AURA OS will download and install it on first launch.

### Who it's for

**For non-programmers.** Want a website, app, Telegram bot? Describe it in words — AURA OS builds it. No need to hire a developer.

**For those tired of switching AI tools.** Claude Code, Codex, Gemini, OpenCode, Ollama — all in one window. AURA OS picks the right agent for each task.

**For knowledge base users.** If you use Obsidian — AURA OS reads your vault and finds relevant context for each task. No Obsidian? It creates its own knowledge base with a graph view.

### Features

- **6 built-in AI agents** — Hermes, Claude Code, OpenCode, Codex, Kimi Code, Ollama. OpenCode works without keys or signup
- **Knowledge base that remembers** — Obsidian or built-in, with full-text search and a connection graph
- **Skills shop** — 672 pre-built skills for Hermes, one-click install
- **Telegram control** — manage tasks from your phone, get results on the go
- **Auto-setup** — first launch downloads Node.js and Python, configures agents, creates a knowledge base

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

### How it was made

The first working prototype — 10 minutes and one prompt in Claude Cowork on Fable 5. One week to build what's here: Claude Code Opus 4.8 + Hermes Agent. MIT license.

### Acknowledgments

— [Hermes Agent](https://github.com/NousResearch/hermes-agent) — orchestration engine (Nous Research)
— [OpenCode](https://github.com/anomalyco/opencode) — free CLI agent (Anomaly, 178k⭐)
— [Kimi K2.7 Code](https://github.com/moonshotai/Kimi-K2.7-Code) — open coding model (Moonshot AI)
— [Second Brain Kit](https://github.com/vasin-k-i/second-brain-kit) — knowledge base template (Konstantin Vasin)
— [SwarmVault](https://github.com/swarmclawai/swarmvault) — knowledge graph concept (SwarmClaw AI)
— [Graphify](https://github.com/safishamsi/graphify) — code dependency graph (Safi Shamsi, 71k⭐)
— [AI Free](https://github.com/Staks-sor/ai-free) — free browser-based API (Staks-sor)
— [vis-network](https://github.com/visjs/vis-network) — graph visualization library (vis.js community)

### Requirements

Windows 10/11 x64, Linux x64, macOS 12+. 500 MB disk space.
