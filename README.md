# AURA OS

**Agentic Unified Runtime Architecture** — a desktop orchestration layer that turns
separate AI CLI agents (Claude Code, Codex, Gemini, Hermes, Ollama, any custom CLI)
into a single managed team. You describe a task; AURA decomposes it into subtasks,
routes them to agents by skill, runs them in parallel, cross-reviews the results,
and stores everything in a shared Obsidian memory.

It ships as a **true standalone desktop application** (Electron — its own window, not
a browser tab) for **Windows and Linux**, and includes a built-in **Telegram remote
terminal** so you can drive the machine from your phone while the app is running.

> 🇷🇺 Русская версия — ниже, в разделе [Русский](#русский).

---

## Features

- **Multi-agent orchestration** — `PLAN → EXECUTE → REVIEW/FIX → MEMORY` pipeline.
- **Auto-detection** of installed agent CLIs (`claude`, `codex`, `gemini`, `hermes`, `ollama`) plus custom agents.
- **Shared memory** backed by an Obsidian vault (markdown notes + rolling index).
- **Telegram remote terminal** — a zero-dependency bot that stays online for the
  whole lifetime of the app. Send shell commands, run AURA tasks, list agents — all
  from Telegram. Restricted to an explicit chat-ID allowlist.
- **Cross-platform** — Windows (NSIS installer + portable `.exe`) and Linux
  (AppImage + `.deb`).
- **RU / EN** interface.

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
| *(any text)* | Run it as a shell command (PowerShell on Windows, bash on Linux). The working directory persists between messages. |
| `/pwd` | Show the current working directory |
| `/cd <path>` | Change the working directory |
| `/kill` | Terminate the command currently running |
| `/aura <task>` | Launch an AURA orchestrator task; the result is sent back to the chat |
| `/agents` | List agents and their availability |
| `/id` | Show your chat ID |
| `/help` | Show help |

## Install (end users)

Download the latest build from the [Releases](../../releases) page:

- **Windows:** `AURA-OS-Setup-<version>.exe` (installer) or `AURA-OS-<version>-portable.exe`.
- **Linux:** `AURA-OS-<version>.AppImage` (`chmod +x` then run) or the `.deb` package.

### Requirements

- Windows 10/11 x64, or a modern x64 Linux desktop.
- At least one agent CLI installed and on `PATH`:
  - Claude Code — `npm install -g @anthropic-ai/claude-code`
  - Codex CLI — `npm install -g @openai/codex`
  - Gemini CLI — `npm install -g @google/gemini-cli`
  - Ollama — <https://ollama.com> (local models, offline)
- Obsidian (optional) — set the vault path in Settings to enable shared memory.

## Develop & build

```bash
npm install        # install Electron + electron-builder
npm start          # run the app in dev mode

npm run dist:win   # build Windows installer + portable (run on Windows)
npm run dist:linux # build AppImage + .deb (run on Linux)
npm run pack       # unpacked build for quick testing
```

Build artifacts land in `dist/`. Cross-building Linux packages on Windows requires
Docker; the simplest path is the bundled GitHub Actions workflow (see below), which
builds Windows and Linux artifacts on their native runners.

### Automated releases

Pushing a tag like `v1.0.0` triggers `.github/workflows/release.yml`, which builds on
`windows-latest` and `ubuntu-latest` and attaches the installers to a GitHub Release.

## Project layout

```
main.js          Electron main process (windows, IPC, lifecycle)
preload.js       Secure context bridge (window.aura.*)
src/agents.js    Agent registry, detection, process runner
src/orchestrator.js  PLAN → EXECUTE → REVIEW/FIX → MEMORY pipeline
src/memory.js    Obsidian-backed shared memory
src/telegram.js  Telegram remote terminal (zero-dependency long polling)
renderer/        Dark UI (HTML/CSS/JS), RU/EN i18n
build/           Icons for electron-builder
docs/            Documentation & marketing (converted from PDF)
```

## Support

AURA OS is free and open-source (MIT). If it saves you time, you can support
development — and get early access to the upcoming **Pro** version:

[![Boosty](https://img.shields.io/badge/Boosty-Support-f15f2c)](https://boosty.to/aura_os)

- **☕ Support** — a thank-you in the changelog.
- **⭐ Early backer** — your name in this README + priority on the Pro waitlist.
- **🔥 Pro pre-order** — a Pro licence at ~40% off the future price; you get your
  activation key the moment Pro ships.

[**→ Support on Boosty**](https://boosty.to/aura_os)

---

## Русский

**AURA OS (Agentic Unified Runtime Architecture)** — настольное приложение-оркестратор,
которое превращает разрозненные ИИ-агенты (Claude Code, Codex, Gemini, Hermes, Ollama
и любой свой CLI) в единую управляемую команду. Вы описываете задачу — система
раскладывает её на подзадачи, распределяет по агентам с учётом навыков, запускает
параллельно, организует перекрёстную проверку и сохраняет всё в общую память Obsidian.

Это **настоящее отдельное desktop-приложение** (Electron — собственное окно, а не
вкладка браузера) для **Windows и Linux**, со встроенным **Telegram-терминалом** для
удалённого управления компьютером, пока приложение запущено.

### Возможности

- Мультиагентный конвейер `ПЛАН → ИСПОЛНЕНИЕ → РЕВЬЮ/ФИКС → ПАМЯТЬ`.
- Автообнаружение установленных CLI-агентов и подключение своих.
- Общая память на базе Obsidian (markdown-заметки + сводный индекс).
- **Telegram-терминал** — бот без внешних зависимостей, работает всё время, пока
  открыто приложение. Выполняет shell-команды, запускает задачи AURA, показывает
  агентов. Отвечает только разрешённым chat ID.
- Кросс-платформенность: Windows (установщик NSIS + portable) и Linux (AppImage + deb).
- Интерфейс RU / EN.

### Telegram-терминал

Бот **выключен по умолчанию**. Чтобы включить:

1. Создайте бота у [@BotFather](https://t.me/BotFather), скопируйте токен.
2. В AURA OS откройте **Настройки → Telegram-терминал**, вставьте токен, включите.
3. Напишите боту любое сообщение, затем `/id` — узнаете свой chat ID.
4. Добавьте chat ID в поле «Разрешённые chat ID» и сохраните.

**Безопасность:** бот отвечает **только** chat ID из списка. Пустой список = доступа нет
ни у кого (бот работает, но отклоняет все сообщения и подсказывает отправителю его
chat ID). Команды выполняются с правами процесса AURA OS — добавляйте только доверенные
chat ID.

### Установка

Скачайте сборку со страницы [Releases](../../releases):

- **Windows:** `AURA-OS-Setup-<версия>.exe` (установщик) или portable-версия.
- **Linux:** `AURA-OS-<версия>.AppImage` или пакет `.deb`.

Требуется хотя бы один установленный CLI-агент в `PATH` (claude / codex / gemini /
ollama). Obsidian — опционально, для общей памяти.

### Сборка из исходников

```bash
npm install
npm start            # запуск в режиме разработки
npm run dist:win     # сборка под Windows (на Windows)
npm run dist:linux   # сборка под Linux (на Linux)
```

Готовые установщики появятся в папке `dist/`. Linux-сборку проще всего получить через
встроенный GitHub Actions workflow — он собирает Windows и Linux на нативных раннерах.

### Поддержать проект

AURA OS — бесплатный проект с открытым кодом (MIT). Если он экономит вам время,
вы можете поддержать разработку и получить ранний доступ к версии **Pro**:

[![Boosty](https://img.shields.io/badge/Boosty-Поддержать-f15f2c)](https://boosty.to/aura_os)

- **☕ Поддержать** — благодарность в changelog.
- **⭐ Ранний сторонник** — ваше имя в README + приоритет в вейтлисте Pro.
- **🔥 Предзаказ Pro** — лицензия Pro со скидкой ~40% от будущей цены; ключ активации
  придёт сразу, как только выйдет Pro.

[**→ Поддержать на Boosty**](https://boosty.to/aura_os)

## License

MIT — see [LICENSE](LICENSE).
