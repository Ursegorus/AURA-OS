# AURA OS

**Agentic Unified Runtime Architecture** — a desktop orchestration layer that turns
separate AI CLI agents (Claude Code, Codex, Gemini, Hermes, Ollama, any custom CLI)
into a single managed team. You describe a task; AURA decomposes it into subtasks,
routes them to agents by skill, runs them in parallel, cross-reviews the results,
and stores everything in a shared Obsidian memory.

Since **v1.0.1**, AURA OS can use **Hermes Agent as its AI engine** — instead of the
built-in orchestrator, the entire `PLAN → EXECUTE → REVIEW` pipeline is handled by
Hermes, which brings skills, memory, MCP, cron, and multi-agent orchestration to
AURA OS.

It ships as a **true standalone desktop application** (Electron — its own window, not
a browser tab) for **Windows, Linux, and macOS**, and includes a built-in **Telegram
remote terminal** so you can drive the machine from your phone while the app is running.

> 🇷🇺 Русская версия — ниже, в разделе [Русский](#русский).

---

## Features

- **Multi-agent orchestration** — `PLAN → EXECUTE → REVIEW/FIX → MEMORY` pipeline.
  Two engines: built-in (legacy) or **Hermes Agent** (recommended, v1.0.1+).
- **Hermes AI engine** — when enabled, Hermes Agent handles planning, agent routing,
  review, and fixes. Hermes skills (`aura-os-orchestrator`, `claude-code`, `codex`,
  `opencode`) are pre-loaded. View and manage skills, cron jobs, and MCP servers
  directly from AURA OS UI.
- **Auto-detection** of installed agent CLIs (`claude`, `codex`, `gemini`, `hermes`, `ollama`) plus custom agents.
- **Shared memory** backed by an Obsidian vault (markdown notes + rolling index).
  Two-way sync with Hermes session memory.
- **Telegram remote terminal** — a zero-dependency bot that stays online for the
  whole lifetime of the app. Send shell commands, run AURA tasks, list agents — all
  from Telegram. Restricted to an explicit chat-ID allowlist.
- **Cross-platform** — Windows (NSIS installer + portable `.exe`), Linux
  (AppImage + `.deb`), and macOS (`.dmg`).
- **RU / EN** interface.

## Hermes AI engine

> Requires [Hermes Agent](https://hermes-agent.nousresearch.com) installed.

Enable in **Settings → Hermes AI engine**. When on, AURA OS delegates task
orchestration to Hermes Agent:

1. AURA sends your task to `hermes -p aura-os chat -q "..."` with the
   `aura-os-orchestrator` skill pre-loaded.
2. Hermes plans, spawns CLI agents (Claude Code, Codex, Gemini, Ollama) via
   `delegate_task`, reviews results, and fixes issues.
3. The output is streamed to AURA OS UI and saved to Obsidian memory.
4. Hermes memory is also synced (task summary sent to Hermes on completion).

The **Hermes** tab in AURA OS lets you inspect installed skills, scheduled cron
jobs, and configured MCP servers — all driven by `hermes skills list`,
`hermes cron list`, and `hermes mcp list`.

A profile `aura-os` is auto-created by Hermes during first run. No manual setup
needed.

## Telegram remote terminal

The bot is **off by default**. To enable it:

1. Create a bot with [@BotFather](https://t.me/BotFather) and copy the token.
2. In AURA OS open **Settings → Telegram terminal**, paste the token, enable it.
3. Send your bot any message, then send `/id` to learn your numeric chat ID.
4. Add that chat ID to **Allowed chat IDs** and save.

**Security:** the bot answers **only** chat IDs on the allowlist. An empty allowlist
means nobody is authorised — the bot still runs but rejects every message (and tells
the sender their own chat ID so you can add it). Commands run with the privileges of
the AURA OS process, so only add chat IDs you fully trust.

Bot commands:

| Command | Action |
| --- | --- |
| _(any text)_ | Run it as a shell command (PowerShell on Windows, bash on Linux). The working directory persists between messages. |
| `/pwd` | Show the current working directory |
| `/cd <path>` | Change the working directory |
| `/kill` | Terminate the command currently running |
| `/aura <task>` | Launch an AURA orchestrator task; the result is sent back to the chat |
| `/agents` | List agents and their availability |
| `/id` | Show your chat ID |
| `/help` | Show help |

## Install (end users)

Download the latest build from the [Releases](../../releases) page:

| Platform | Files |
|----------|-------|
| **Windows** | `AURA-OS-Setup-<version>.exe` (installer) • `AURA-OS-<version>-portable.exe` |
| **Linux** | `AURA-OS-<version>.AppImage` (`chmod +x` then run) • `.deb` package |
| **macOS** | `AURA-OS-<version>.dmg` |

### Requirements

- Windows 10/11 x64, modern x64 Linux desktop, or macOS 12+.
- At least one agent CLI installed and on `PATH`:
  - Claude Code — `npm install -g @anthropic-ai/claude-code`
  - Codex CLI — `npm install -g @openai/codex`
  - Gemini CLI — `npm install -g @google/gemini-cli`
  - Ollama — <https://ollama.com> (local models, offline)
- **Hermes Agent** (optional, for AI engine mode) — see [install guide](https://hermes-agent.nousresearch.com/docs/category/getting-started).
- Obsidian (optional) — set the vault path in Settings to enable shared memory.

## Develop & build

```bash
npm install          # install Electron + electron-builder
npm start            # run the app in dev mode

npm run dist:win     # build Windows installer + portable (on Windows)
npm run dist:linux   # build AppImage + .deb (on Linux)
# macOS — use the CI or run on macOS:
npx electron-builder --mac --publish never
npm run pack         # unpacked build for quick testing
```

Build artifacts land in `dist/`. Cross-building Linux packages on Windows requires
Docker; the simplest path is the bundled GitHub Actions workflow (see below).

### Automated releases

Push a tag like `v1.0.1` → GitHub Actions builds on `windows-latest`, `ubuntu-latest`,
and `macos-latest`, then attaches all installers to a GitHub Release. Pushes to `main`
also build artifacts (without publishing a release).

## Project layout

```
main.js              Electron main process (windows, IPC, lifecycle)
preload.js           Secure context bridge (window.aura.*)
src/agents.js        Agent registry, detection, process runner
src/orchestrator.js  Orchestrator (Legacy) + HermesEngine (AI engine)
src/memory.js        Obsidian-backed shared memory
src/telegram.js      Telegram remote terminal (zero-dep long polling)
renderer/            Dark UI (HTML/CSS/JS), RU/EN i18n
.github/workflows/   CI: build Windows, Linux, macOS on push/tag
build/               Icons for electron-builder
docs/                Documentation & marketing
```

## Support

AURA OS is free and open-source (MIT). If it saves you time, you can support
development:

[![Boosty](https://img.shields.io/badge/Boosty-Support-f15f2c)](https://boosty.to/aura_os)

[**→ Support on Boosty**](https://boosty.to/aura_os)

---

## Русский

**AURA OS (Agentic Unified Runtime Architecture)** — настольное приложение-оркестратор,
которое превращает разрозненные ИИ-агенты (Claude Code, Codex, Gemini, Hermes, Ollama
и любой свой CLI) в единую управляемую команду. Вы описываете задачу — система
раскладывает её на подзадачи, распределяет по агентам с учётом навыков, запускает
параллельно, организует перекрёстную проверку и сохраняет всё в общую память Obsidian.

Начиная с **v1.0.1** AURA OS может использовать **Hermes Agent как AI-движок** —
весь конвейер ПЛАН→ИСПОЛНЕНИЕ→РЕВЬЮ обрабатывает Hermes.

Это **настоящее отдельное desktop-приложение** (Electron — собственное окно, а не
вкладка браузера) для **Windows, Linux и macOS**, со встроенным **Telegram-терминалом**.

### Возможности

- Мультиагентный конвейер `ПЛАН → ИСПОЛНЕНИЕ → РЕВЬЮ/ФИКС → ПАМЯТЬ`.
- **Hermes AI engine** — опционально, оркестрация через Hermes Agent (skills,
  memory, MCP, cron). Вкладка Hermes в UI: просмотр навыков, задач cron и MCP.
- Автообнаружение установленных CLI-агентов и подключение своих.
- Общая память на базе Obsidian (markdown-заметки + сводный индекс).
- **Telegram-терминал** — бот без внешних зависимостей, работает всё время, пока
  открыто приложение. Выполняет shell-команды, запускает задачи AURA, показывает
  агентов. Отвечает только разрешённым chat ID.
- Кросс-платформенность: Windows (NSIS + portable), Linux (AppImage + deb), macOS (dmg).
- Интерфейс RU / EN.

### Установка

Скачайте сборку со страницы [Releases](https://github.com/Ursegorus/AURA-OS/releases):

- **Windows:** установщик `.exe` или portable-версия.
- **Linux:** AppImage (chmod +x) или .deb.
- **macOS:** .dmg.
- Требуется хотя бы один CLI-агент в PATH (claude / codex / gemini / ollama).
- Hermes Agent — опционально, для режима AI engine.
- Obsidian — опционально, для общей памяти.

### Сборка из исходников

```bash
npm install
npm start            # запуск в режиме разработки
npm run dist:win     # сборка под Windows (на Windows)
npm run dist:linux   # сборка под Linux (на Linux)
```

### Поддержать проект

[![Boosty](https://img.shields.io/badge/Boosty-Поддержать-f15f2c)](https://boosty.to/aura_os)

[**→ Поддержать на Boosty**](https://boosty.to/aura_os)

## License

MIT — see [LICENSE](LICENSE).
