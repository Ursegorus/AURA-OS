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

Проект использует идеи и код: Hermes Agent (Nous Research), OpenCode (Anomaly), Kimi K2.7 Code (Moonshot AI), Second Brain Kit (Константин Васин), SwarmVault (SwarmClaw AI), Graphify (Safi Shamsi), AI Free (Staks-sor), vis-network (vis.js community).

[Boosty](https://boosty.to/aura_os)

---

## English

Download, type your task, get the result. No API keys, no terminal, no setup required. Six built-in AI agents, knowledge base with search and graph, 672 skills, Telegram control. Open source (MIT).

[Download for Windows](https://github.com/Ursegorus/AURA-OS/releases) · [Linux](https://github.com/Ursegorus/AURA-OS/releases) · [macOS](https://github.com/Ursegorus/AURA-OS/releases)
