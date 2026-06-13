#!/usr/bin/env python3
"""
timer.py — CLI для Python-таймера.

Использование:
    python timer.py 30              # таймер на 30 секунд
    python timer.py --minutes 5     # таймер на 5 минут
    python timer.py --name "Чай" 300  # таймер с именем задачи
    python timer.py --help          # справка
"""

import argparse
import sys
import time
from timer_core import Timer


def format_time(seconds: float) -> str:
    """Форматировать секунды в MM:SS."""
    m, s = divmod(int(seconds), 60)
    return f"[{m:02d}:{s:02d}]"


def print_tick(remaining: float):
    """Вывод тика в ту же строку."""
    bar_len = 20
    total = getattr(print_tick, '_total', 0)
    if total == 0:
        total = 1  # fallback
    filled = int((remaining / total) * bar_len)
    bar = '█' * (bar_len - filled) + '░' * filled
    sys.stdout.write(f"\r{format_time(remaining)} {bar} {remaining:.1f}s ")
    sys.stdout.flush()


def main():
    parser = argparse.ArgumentParser(
        description="Python-таймер обратного отсчёта",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Примеры:
  python timer.py 30
  python timer.py --minutes 5
  python timer.py --name "Чай" 300
        """,
    )

    parser.add_argument(
        "seconds",
        type=float,
        nargs="?",
        default=None,
        help="Время в секундах",
    )
    parser.add_argument(
        "--minutes", "-m",
        type=float,
        default=0,
        help="Время в минутах (альтернатива секундам)",
    )
    parser.add_argument(
        "--name", "-n",
        type=str,
        default="",
        help="Название задачи для таймера",
    )

    args = parser.parse_args()

    # Определяем общее время
    if args.seconds is not None:
        total_seconds = args.seconds
    elif args.minutes > 0:
        total_seconds = args.minutes * 60
    else:
        parser.error("Укажите время: python timer.py 30 или --minutes 5")

    if total_seconds <= 0:
        parser.error("Время должно быть положительным числом")

    task_name = args.name.strip()

    # Заголовок
    header = f"⏱  Таймер"
    if task_name:
        header += f": {task_name}"
    header += f" на {format_time(total_seconds)}"
    print(header)
    print()

    # Создаём и запускаем таймер
    timer = Timer(total_seconds)

    # Сохраняем total для progress bar
    print_tick._total = total_seconds

    # Колбэк завершения
    def on_done(t):
        print(f"\n\n✅ [DONE!] Таймер завершён")
        if task_name:
            print(f"   Задача: {task_name}")
        print(f"   Прошло: {format_time(total_seconds)}")
        # Звуковой сигнал (Windows + Linux/Mac)
        print("\a", end="", flush=True)
        for _ in range(3):
            sys.stdout.write("\a")
            sys.stdout.flush()
            time.sleep(0.3)
        print()

    timer._callback = on_done
    timer.on_tick(print_tick)

    try:
        timer.start()
        # Ждём завершения потока
        while timer.is_running:
            time.sleep(0.1)
    except KeyboardInterrupt:
        print("\n\n⏹  Таймер прерван (Ctrl+C)")
        timer.stop()


if __name__ == "__main__":
    main()
