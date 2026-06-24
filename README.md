# AURA OS

**Agentic Unified Runtime Architecture** — десктоп-приложение, которое само решает ваши задачи с помощью ИИ. Вы пишете, что нужно сделать — AURA OS находит ответ, пишет код, ищет информацию, исправляет ошибки и сохраняет результат.

Не требует открывать терминал, настраивать API-ключи и разбираться в ИИ-инструментах.

---

## Чем полезна

**Для тех, кто не хочет разбираться в терминале**
Установили — открыли — написали задачу — получили результат. AURA OS сама устанавливает и настраивает Hermes Agent, OpenCode и другие ИИ-агенты. Никаких консолей, ключей и регистраций.

**Для тех, у кого уже есть ИИ-инструменты**
AURA OS объединяет Claude Code, Codex, Gemini, Ollama, Kimi Code и OpenCode в одной программе. Не нужно переключаться между окнами — AURA сама распределяет задачи между агентами.

**Для тех, кто ведёт базу знаний**
При первом запуске AURA OS создаёт типовую структуру Second Brain по [методу Васина Константина](https://github.com/vasin-k-i/second-brain-kit). Работает с Obsidian и без него.

---

## Возможности

**Четыре движка оркестрации**
- **Auto** — сам выбирает лучший доступный: Hermes → Claude Code → OpenCode → встроенный
- **Hermes Agent** — полный AI-агент с навыками, памятью, cron-задачами и MCP. Нужен API-ключ
- **Claude Code** — для пользователей Claude с подпиской
- **OpenCode** — бесплатный движок без ключей. Работает сразу после установки

**Встроенная база знаний (Second Brain)**
- Типовая структура `_BRAIN/` — INDEX, CONTEXT, PROJECTS, MEMORY, ADR, стратегии, заметки
- Поиск через ripgrep — агенты находят релевантный контекст перед выполнением
- Граф связей с интерактивной визуализацией (vis-network)
- Редактор .md прямо в AURA OS
- Полная совместимость с Obsidian — одни и те же файлы

**Магазин скиллов**
672+ готовых навыков для Hermes Agent — от code-review до Google Workspace. Установка в один клик.

**Telegram-терминал**
Управляйте AURA OS с телефона: запускайте задачи, смотрите статус, выполняйте команды.

**Авто-установка агентов**
Hermes Agent устанавливается при первом запуске. OpenCode, Kimi Code, Claude Code, Codex — в один клик из UI.

**One-click на любую платформу**
Установщики для Windows (.exe), Linux (.AppImage, .deb) и macOS (.dmg) собираются через GitHub Actions.

---

## Как начать

```bash
# Скачайте установщик со страницы релизов
# https://github.com/Ursegorus/AURA-OS/releases

# Или соберите из исходников
npm install
npm run dist:win    # Windows
npm run dist:linux  # Linux
# macOS — через GitHub Actions или `npx electron-builder --mac --publish never`
```

---

## Системные требования

- Windows 10/11 x64, Linux x64 или macOS 12+
- Node.js 18+ (для установки CLI-агентов)
- 500 МБ свободного места

---

## Благодарности и источники

AURA OS построена на идеях и коде открытых проектов:

| Проект | Автор | Что использовано |
|--------|-------|-----------------|
| [Hermes Agent](https://github.com/NousResearch/hermes-agent) | Nous Research | Основной AI-движок, архитектура агента, skills, MCP |
| [OpenCode](https://github.com/anomalyco/opencode) | Anomaly | Бесплатный CLI-агент для пользователей без API-ключей |
| [Kimi Code](https://github.com/moonshotai/Kimi-K2.7-Code) | Moonshot AI | Open-source модель кодирования MoE 1T |
| [Second Brain Kit](https://github.com/vasin-k-i/second-brain-kit) | Константин Васин | Типовая структура базы знаний _BRAIN/, мост памяти, метод ведения проектов |
| [SwarmVault](https://github.com/swarmclawai/swarmvault) | SwarmClaw AI | Концепция knowledge graph и MCP-сервера для базы знаний |
| [Graphify](https://github.com/safishamsi/graphify) | Safi Shamsi | Референс построения графа зависимостей кода (71k⭐) |
| [AI Free](https://github.com/Staks-sor/ai-free) | Staks-sor | Бесплатный API через браузерную автоматизацию |
| [vis-network](https://github.com/visjs/vis-network) | vis.js community | Библиотека визуализации графа связей |

---

## Поддержать проект

AURA OS — бесплатный проект с открытым кодом (MIT).

[Boosty](https://boosty.to/aura_os)

---

## Лицензия

MIT — подробнее в [LICENSE](LICENSE).
