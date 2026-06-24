# AURA OS

Десктоп-приложение, которое выполняет задачи с помощью ИИ. Вы описываете, что нужно сделать — AURA OS сама находит ответ, пишет код, собирает контекст из базы знаний и сохраняет результат.

Не требует настроек, API-ключей и работы в терминале.

---

## Для кого

**Для тех, кто не хочет разбираться в терминале.** Установили — открыли — написали задачу — получили результат. AURA OS сама устанавливает Hermes Agent, OpenCode и других агентов. Никаких консолей, ключей и регистраций.

**Для тех, у кого уже есть ИИ-инструменты.** AURA OS объединяет Claude Code, Codex, Gemini, OpenCode, Kimi Code и Ollama в одной программе. Не нужно переключаться между окнами.

**Для тех, кто ведёт базу знаний.** При первом запуске AURA OS создаёт структуру для заметок, проектов и решений. Работает с Obsidian и без него.

---

## Как работает

```
Пользователь пишет задачу → AURA OS ищет контекст в базе знаний →
выбирает подходящий движок → агенты выполняют → результат сохраняется
```

AURA OS сама решает, какой движок использовать:

| Движок | Когда подходит |
|--------|----------------|
| **Hermes Agent** | Нужны навыки, cron, MCP. Требует API-ключ |
| **Claude Code** | У пользователя есть подписка Claude |
| **OpenCode** | Нет ключей — бесплатные модели внутри |
| **Встроенный** | Если ничего другого нет |

По умолчанию AURA OS выбирает движок сама: от самого мощного к самому доступному.

---

## Возможности

**База знаний.** Поиск по заметкам через ripgrep. Перед выполнением задачи AURA OS находит нужные файлы и подкладывает их как контекст. Никакой индексации — поиск работает сразу.

**Граф связей.** Показывает, какие заметки связаны между собой. Встроен в AURA OS — не открывает браузер.

**Магазин скиллов.** 672 готовых навыка для Hermes Agent. Установка в один клик.

**Telegram-терминал.** Запускайте задачи с телефона.

**Установка агентов в один клик.** Hermes Agent устанавливается при первом запуске. OpenCode, Kimi Code, Claude Code, Codex — кнопкой в разделе «Агенты».

**Авто-дополнение базы знаний.** Если у вас уже есть заметки, AURA OS проверит, каких папок не хватает, и добавит их, не трогая существующие файлы.

**Готовые установщики.** Windows (.exe), Linux (.AppImage, .deb), macOS (.dmg) собираются через GitHub Actions.

---

## Быстрый старт

```bash
# Скачайте установщик со страницы релизов
# https://github.com/Ursegorus/AURA-OS/releases

# Или соберите из исходников
npm install
npm run dist:win    # Windows
npm run dist:linux  # Linux
# macOS — через GitHub Actions
```

---

## Системные требования

- Windows 10/11, Linux x64, macOS 12+
- Node.js 18+ (для установки CLI-агентов)
- 500 МБ на диске

---

## Благодарности

AURA OS использует идеи и код открытых проектов:

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
