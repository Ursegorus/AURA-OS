# AURA OS — Agentic Unified Runtime Architecture

Скачайте программу, напишите, что нужно сделать — и она выполнит задачу с помощью ИИ.

Не требует установки Python, Node.js, ключей API и работы в терминале.
AURA OS сама установит Node.js и Python при первом запуске — полноценными установщиками (MSI/EXE). Всё будет доступно в системе.

---

## Примеры

«Сделай лендинг для кафе „У Маши“ с меню и контактами» → AURA OS найдёт примеры в интернете, напишет код и покажет результат.

«Напиши пост для Telegram о запуске нового продукта» → AURA OS прочитает ваши заметки, найдёт контекст и напишет текст.

«Проверь код в папке /project на ошибки» → AURA OS запустит агентов, найдёт баги и предложит исправления.

---

## Как начать

1. Скачайте установщик для вашей системы
2. Запустите — откроется окно
3. Напишите задачу — получите результат

[Скачать для Windows](https://github.com/Ursegorus/AURA-OS/releases) · [для Linux](https://github.com/Ursegorus/AURA-OS/releases) · [для macOS](https://github.com/Ursegorus/AURA-OS/releases)

После запуска AURA OS сама установит всё необходимое.

---

## Для разработчиков

**Четыре движка оркестрации.** AURA OS объединяет Claude Code, Codex, Gemini, OpenCode, Kimi Code и Ollama. Задачи автоматически распределяются между агентами.

**База знаний.** Поиск по .md файлам через ripgrep. Агенты находят контекст перед выполнением задачи. Работает с Obsidian и без него.

**Граф связей.** Визуализация связей между заметками. Встроен в AURA OS.

**Магазин скиллов.** 672 навыка для Hermes Agent. Установка в один клик.

**Telegram-терминал.** Управление AURA OS с телефона.

**Установщики.**
```bash
npm install
npm run dist:win    # Windows
npm run dist:linux  # Linux
```

**Системные требования.** Windows 10/11, Linux x64, macOS 12+. 500 МБ на диске.

---

## Благодарности

| Проект | Автор |
|--------|-------|
| [Hermes Agent](https://github.com/NousResearch/hermes-agent) | Nous Research |
| [OpenCode](https://github.com/anomalyco/opencode) | Anomaly |
| [Kimi K2.7 Code](https://github.com/moonshotai/Kimi-K2.7-Code) | Moonshot AI |
| [Second Brain Kit](https://github.com/vasin-k-i/second-brain-kit) | Константин Васин |
| [SwarmVault](https://github.com/swarmclawai/swarmvault) | SwarmClaw AI |
| [Graphify](https://github.com/safishamsi/graphify) | Safi Shamsi |
| [AI Free](https://github.com/Staks-sor/ai-free) | Staks-sor |
| [vis-network](https://github.com/visjs/vis-network) | vis.js community |

---

AURA OS — проект с открытым кодом (MIT).

[Boosty](https://boosty.to/aura_os)
---

## English

**AURA OS — Agentic Unified Runtime Architecture.** Download, type your task, get the result. No API keys, no terminal, no setup required.

### Quick start

1. Download the installer for your platform
2. Launch AURA OS
3. Type what you need — get the result

[Download for Windows](https://github.com/Ursegorus/AURA-OS/releases) · [Linux](https://github.com/Ursegorus/AURA-OS/releases) · [macOS](https://github.com/Ursegorus/AURA-OS/releases)

AURA OS installs everything it needs on first launch.

### For developers

**Four orchestration engines.** Combine Claude Code, Codex, Gemini, OpenCode, Kimi Code and Ollama in one interface.

**Knowledge base.** Search across .md files with ripgrep. Agents find relevant context before running tasks. Works with Obsidian and standalone.

**Skills shop.** 672 skills for Hermes Agent. One-click install.

**Telegram terminal.** Control AURA OS from your phone.

**Build from source.**
```bash
npm install
npm run dist:win    # Windows
npm run dist:linux  # Linux
```

**Requirements.** Windows 10/11, Linux x64, macOS 12+. 500 MB disk space.

### License

MIT
