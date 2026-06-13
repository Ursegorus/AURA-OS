"""
timer_core.py — класс Timer с поддержкой паузы, сброса и колбэков.

Использует только стандартную библиотеку Python.
Работает в отдельном потоке (threading) для неблокирующего отсчёта.
"""

import threading
import time
from typing import Callable, Optional


class Timer:
    """Таймер обратного отсчёта с паузой, сбросом и колбэками."""

    def __init__(self, seconds: float, callback: Optional[Callable] = None):
        """
        Инициализация таймера.

        Args:
            seconds: Количество секунд для обратного отсчёта.
            callback: Функция, вызываемая по завершению таймера.
                      Сигнатура: callback(timer_self)
        """
        if seconds <= 0:
            raise ValueError("Seconds must be positive")

        self._initial = float(seconds)
        self._remaining = float(seconds)
        self._callback = callback
        self._running = False
        self._paused = False
        self._event = threading.Event()
        self._thread: Optional[threading.Thread] = None
        self._tick_callback: Optional[Callable[[float], None]] = None
        self._lock = threading.Lock()

    @property
    def remaining(self) -> float:
        """Оставшееся время в секундах."""
        with self._lock:
            return self._remaining

    @property
    def is_running(self) -> bool:
        """Таймер активен (не остановлен и не завершён)."""
        return self._running

    @property
    def is_paused(self) -> bool:
        """Таймер на паузе."""
        return self._paused

    def on_tick(self, callback: Callable[[float], None]):
        """Установить колбэк на каждый тик (секунда)."""
        self._tick_callback = callback

    def start(self):
        """Запустить таймер в отдельном потоке."""
        if self._running:
            return

        self._running = True
        self._paused = False
        self._event.clear()
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def pause(self):
        """Приостановить таймер."""
        with self._lock:
            if not self._running or self._paused:
                return
            self._paused = True

    def resume(self):
        """Возобновить таймер после паузы."""
        with self._lock:
            if not self._running or not self._paused:
                return
            self._paused = False
        # Разбудить поток, чтобы он продолжил отсчёт
        self._event.set()

    def reset(self):
        """Сбросить таймер в начальное состояние."""
        self.stop()
        with self._lock:
            self._remaining = self._initial
            self._paused = False

    def stop(self):
        """Остановить таймер принудительно (graceful shutdown)."""
        with self._lock:
            if not self._running:
                return
            self._running = False
            self._paused = False
        self._event.set()
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=2)

    def _run(self):
        """Внутренний цикл обратного отсчёта (выполняется в потоке)."""
        last_tick = time.perf_counter()

        while self._running:
            # Проверка паузы
            with self._lock:
                if self._paused:
                    self._event.clear()
                    paused_remaining = self._remaining

            # Если на паузе — ждём resume
            if self._paused:
                # Пересчитываем оставшееся время с учётом времени, проведённого в паузе
                self._event.wait()
                last_tick = time.perf_counter()
                continue

            # Проверка завершения
            with self._lock:
                if self._remaining <= 0:
                    self._running = False
                    break

            current_time = time.perf_counter()
            elapsed = current_time - last_tick

            with self._lock:
                self._remaining -= elapsed
                current_remaining = self._remaining

            # Тик каждую секунду
            if self._tick_callback:
                self._tick_callback(max(0, current_remaining))

            # Проверка завершения после декремента
            if current_remaining <= 0:
                with self._lock:
                    self._running = False
                break

            # Спим не больше 0.1 сек для быстрой реакции на паузу/остановку
            sleep_time = min(0.1, current_remaining)
            # Если спим больше 0.5 сек, значит осталось много времени — спим 0.5
            if sleep_time > 0.5:
                sleep_time = 0.5
            time.sleep(sleep_time)
            last_tick = current_time

        # Обнуляем остаток и помечаем как остановленный
        with self._lock:
            if self._remaining < 0:
                self._remaining = 0.0
            self._running = False

        # Таймер завершился — вызываем колбэк
        if self._callback:
            try:
                self._callback(self)
            except Exception:
                pass
