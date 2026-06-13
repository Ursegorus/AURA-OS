import time
import pytest
from timer_core import Timer


def test_countdown_completes():
    """Таймер на 1 секунду завершается."""
    done = []

    def on_done(t):
        done.append(True)

    t = Timer(1, callback=on_done)
    t.start()
    t._thread.join(timeout=5)
    assert len(done) == 1, "Колбэк не был вызван"
    assert not t.is_running, "Таймер должен быть остановлен"
    assert t.remaining == 0, f"Остаток должен быть 0, получено {t.remaining}"


def test_pause_resume():
    """Пауза и возобновление сохраняют оставшееся время."""
    t = Timer(5)
    t.start()
    time.sleep(1)

    t.pause()
    assert t.is_paused, "Таймер должен быть на паузе"

    paused_remaining = t.remaining
    time.sleep(2)  # время не должно уменьшаться на паузе
    assert abs(t.remaining - paused_remaining) < 0.5, \
        f"Остаток изменился на паузе: {paused_remaining} -> {t.remaining}"

    t.resume()
    assert not t.is_paused, "Таймер должен быть снят с паузы"
    time.sleep(1)

    t.stop()
    assert t.remaining < paused_remaining, \
        "Время должно уменьшиться после возобновления"


def test_reset():
    """Сброс возвращает таймер в начальное состояние."""
    t = Timer(10)
    t.start()
    time.sleep(2)
    t.reset()

    assert not t.is_running, "После сброса таймер не должен быть запущен"
    assert abs(t.remaining - 10) < 0.1, \
        f"Остаток должен быть 10, получено {t.remaining}"
    assert not t.is_paused, "После сброса не должно быть паузы"


def test_callback_fires():
    """Колбэк вызывается по завершению таймера."""
    result = []

    def on_done(t):
        result.append(t.remaining)

    t = Timer(0.5, callback=on_done)
    t.start()
    t._thread.join(timeout=5)

    assert len(result) == 1, "Колбэк должен быть вызван ровно 1 раз"
    assert result[0] == 0, \
        f"Остаток в колбэке должен быть 0, получено {result[0]}"


def test_tick_callback():
    """Колбэк тика вызывается."""
    ticks = []

    def on_tick(remaining):
        ticks.append(remaining)

    t = Timer(1)
    t.on_tick(on_tick)
    t.start()
    t._thread.join(timeout=5)

    print(f"Тиков получено: {len(ticks)}")
    assert len(ticks) > 0, "Должен быть хотя бы 1 тик"


def test_invalid_seconds():
    """Отрицательное время вызывает ValueError."""
    with pytest.raises(ValueError, match="positive"):
        Timer(-5)


def test_stop_while_running():
    """Принудительная остановка работает."""
    t = Timer(10)
    t.start()
    time.sleep(0.5)

    assert t.is_running
    t.stop()
    assert not t.is_running
    assert not t.is_paused


def test_multiple_start():
    """Повторный start() игнорируется."""
    import threading

    t = Timer(3)
    t.start()
    thread_id = id(t._thread)
    t.start()  # должен игнорироваться
    assert id(t._thread) == thread_id, "Поток не должен пересоздаваться"
    t.stop()
