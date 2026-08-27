import ctypes
import gzip
import json
import os
import sys
import threading
import time
from dataclasses import dataclass
from ctypes import wintypes
from datetime import datetime, timedelta, timezone
from pathlib import Path
import tkinter as tk
from tkinter import messagebox
from typing import Callable, Optional
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError, available_timezones

try:
    import pystray
    from PIL import Image, ImageDraw, ImageTk
except ImportError:
    pystray = None
    Image = None
    ImageDraw = None
    ImageTk = None


APP_TITLE = "World Clock Widget"
APP_VERSION = "v1.1.11"
APP_DIR_NAME = "WorldClockWidget"
DEFAULT_OVERLAY_DIRECTION = "right"
OVERLAY_DIRECTIONS = {
    "right": "Справа",
    "left": "Слева",
    "top": "Сверху",
    "bottom": "Снизу",
}
DEFAULT_TIMEZONES = [
    "Europe/Moscow",
    "Asia/Vladivostok",
    "Asia/Almaty",
]
LOCAL_TIME_OPTION = "Локальное время Windows"

# Visual tokens from the Figma frame (node 1906:14898).
THEMES = {
    "dark": {
        "BG": "#0B0E14",
        "SURFACE": "#161B22",
        "SURFACE_HOVER": "#1C222B",
        "BORDER": "#30363D",
        "TEXT": "#F0F6FC",
        "MUTED": "#8B949E",
        "ACCENT": "#7C5CFC",
        "DANGER": "#F85149",
        "BADGE": "#211B46",
    },
    "light": {
        "BG": "#F6F8FA",
        "SURFACE": "#FFFFFF",
        "SURFACE_HOVER": "#EAEEF2",
        "BORDER": "#D0D7DE",
        "TEXT": "#1F2328",
        "MUTED": "#656D76",
        "ACCENT": "#6E40E6",
        "DANGER": "#CF222E",
        "BADGE": "#EEE9FF",
    },
}
BG = THEMES["dark"]["BG"]
SURFACE = THEMES["dark"]["SURFACE"]
SURFACE_HOVER = THEMES["dark"]["SURFACE_HOVER"]
BORDER = THEMES["dark"]["BORDER"]
TEXT = THEMES["dark"]["TEXT"]
MUTED = THEMES["dark"]["MUTED"]
ACCENT = THEMES["dark"]["ACCENT"]
DANGER = THEMES["dark"]["DANGER"]
BADGE = THEMES["dark"]["BADGE"]
TRANSPARENT_KEY = "#010203"
FONT_FAMILY = "Inter"

STRINGS = {
    "ru": {
        "world_time": "Мировое время",
        "cities": "ГОРОДА",
        "add_city": "Добавить город",
        "choose_city": "Выбрать город",
        "settings": "Настройки",
        "theme": "Тема",
        "dark": "Тёмная",
        "light": "Светлая",
        "language": "Язык",
        "russian": "Русский",
        "english": "English",
        "base_city": "Базовый город",
        "popular_cities": "ИЗБРАННЫЕ ГОРОДА",
        "search_results": "РЕЗУЛЬТАТЫ ПОИСКА",
        "search_city": "Поиск города...",
        "from_base": "от базы",
        "system_city": "Ханой",
    },
    "en": {
        "world_time": "World time",
        "cities": "CITIES",
        "add_city": "Add city",
        "choose_city": "Choose city",
        "settings": "Settings",
        "theme": "Theme",
        "dark": "Dark",
        "light": "Light",
        "language": "Language",
        "russian": "Русский",
        "english": "English",
        "base_city": "Base city",
        "popular_cities": "FAVORITE CITIES",
        "search_results": "SEARCH RESULTS",
        "search_city": "Search city...",
        "from_base": "from base",
        "system_city": "Hanoi",
    },
}


def set_theme(theme: str):
    global BG, SURFACE, SURFACE_HOVER, BORDER, TEXT, MUTED, ACCENT, DANGER, BADGE
    palette = THEMES.get(theme, THEMES["dark"])
    BG = palette["BG"]
    SURFACE = palette["SURFACE"]
    SURFACE_HOVER = palette["SURFACE_HOVER"]
    BORDER = palette["BORDER"]
    TEXT = palette["TEXT"]
    MUTED = palette["MUTED"]
    ACCENT = palette["ACCENT"]
    DANGER = palette["DANGER"]
    BADGE = palette["BADGE"]


def tr(key: str, language: str = "ru") -> str:
    return STRINGS.get(language, STRINGS["ru"]).get(key, key)


def resource_path(*parts: str) -> Path:
    base = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent))
    return base.joinpath(*parts)


def register_bundled_font():
    if os.name != "nt":
        return
    font_path = resource_path("assets", "fonts", "Inter-Variable.ttf")
    if not font_path.exists():
        return
    try:
        ctypes.windll.gdi32.AddFontResourceExW(str(font_path), 0x10, 0)
    except Exception:
        pass


def ui_font(size: int, weight: str = "normal") -> tuple[str, int, str]:
    # Negative Tk font sizes are device pixels, matching Figma's CSS pixel sizes.
    return (FONT_FAMILY, -size, weight)


def tinted_icon(name: str, size: int):
    if Image is None:
        return None
    path = resource_path("assets", "icons", f"{name}.png")
    if not path.exists():
        return None
    source = Image.open(path).convert("RGBA").resize((size, size), Image.Resampling.LANCZOS)
    if name == "close":
        color = DANGER
    elif name == "check":
        color = "#FFFFFF"
    elif name in {"chevron-down", "chevron-right", "search", "plus"}:
        color = MUTED
    else:
        color = TEXT
    rgb = tuple(int(color[i:i + 2], 16) for i in (1, 3, 5))
    tinted = Image.new("RGBA", source.size, (*rgb, 0))
    tinted.putalpha(source.getchannel("A"))
    return tinted


def _rounded_polygon(canvas: tk.Canvas, x1, y1, x2, y2, radius, **kwargs):
    radius = max(1, min(radius, (x2 - x1) / 2, (y2 - y1) / 2))
    points = [
        x1 + radius, y1, x2 - radius, y1, x2, y1, x2, y1 + radius,
        x2, y2 - radius, x2, y2, x2 - radius, y2, x1 + radius, y2,
        x1, y2, x1, y2 - radius, x1, y1 + radius, x1, y1,
    ]
    return canvas.create_polygon(points, smooth=True, splinesteps=24, **kwargs)


class RoundedPanel(tk.Canvas):
    def __init__(
        self,
        master,
        *,
        height: int,
        fill: str = SURFACE,
        outline: str = BORDER,
        radius: int = 12,
        border_width: int = 1,
        padding: int = 0,
        dashed: bool = False,
    ):
        parent_bg = master.cget("bg") if "bg" in master.keys() else BG
        super().__init__(master, height=height, bg=parent_bg, highlightthickness=0, bd=0)
        self.fill_color = fill
        self.outline_color = outline
        self.radius = radius
        self.border_width = border_width
        self.padding = padding
        self.dashed = dashed
        self.content = tk.Frame(self, bg=fill)
        self._window = self.create_window(padding, padding, anchor="nw", window=self.content)
        self.bind("<Configure>", self._redraw)

    def _redraw(self, _event=None):
        width = max(1, self.winfo_width())
        height = max(1, self.winfo_height())
        self.delete("panel_shape")
        _rounded_polygon(
            self,
            1,
            1,
            width - 1,
            height - 1,
            self.radius,
            fill=self.fill_color,
            outline=self.outline_color,
            width=self.border_width,
            dash=(4, 4) if self.dashed else None,
            tags="panel_shape",
        )
        self.tag_lower("panel_shape")
        inset = max(2, self.padding)
        self.coords(self._window, inset, inset)
        self.itemconfigure(
            self._window,
            width=max(1, width - inset * 2),
            height=max(1, height - inset * 2),
        )

    def set_outline(self, color: str):
        self.outline_color = color
        self._redraw()


class IconButton(tk.Canvas):
    def __init__(self, master, icon_name: str, command, *, size=32, icon_size=16, filled=True, button_fill=None):
        parent_bg = master.cget("bg") if "bg" in master.keys() else BG
        super().__init__(master, width=size, height=size, bg=parent_bg, highlightthickness=0, bd=0, cursor="hand2")
        self.command = command
        self.size = size
        self.icon_size = icon_size
        self.filled = filled
        self.button_fill = SURFACE if button_fill is None else button_fill
        self._photo = None
        self._draw(False)
        source = tinted_icon(icon_name, icon_size)
        if source is not None and ImageTk is not None:
            self._photo = ImageTk.PhotoImage(source)
            self.create_image(size / 2, size / 2, image=self._photo)
        self.bind("<Enter>", lambda _e: self._draw(True))
        self.bind("<Leave>", lambda _e: self._draw(False))
        self.bind("<Button-1>", lambda _e: self.command())

    def _draw(self, hovered: bool):
        self.delete("button_shape")
        if self.filled:
            _rounded_polygon(
                self,
                1,
                1,
                self.size - 1,
                self.size - 1,
                6,
                fill=SURFACE_HOVER if hovered else self.button_fill,
                outline=ACCENT if hovered else BORDER,
                width=1,
                tags="button_shape",
            )
            self.tag_lower("button_shape")


class StarButton(tk.Canvas):
    def __init__(self, master, command, selected=False, size=28):
        parent_bg = master.cget("bg") if "bg" in master.keys() else BG
        super().__init__(master, width=size, height=size, bg=parent_bg, highlightthickness=0, bd=0, cursor="hand2")
        self.command = command
        self.selected = selected
        self.size = size
        self._draw(False)
        self.bind("<Enter>", lambda _e: self._draw(True))
        self.bind("<Leave>", lambda _e: self._draw(False))
        self.bind("<Button-1>", lambda _e: self.command())

    def _draw(self, hovered):
        self.delete("all")
        _rounded_polygon(self, 1, 1, self.size - 1, self.size - 1, 6, fill=SURFACE_HOVER if hovered else BORDER, outline=ACCENT if hovered else BORDER, width=1)
        self.create_text(self.size / 2, self.size / 2 - 1, text="★" if self.selected else "☆", fill=ACCENT if self.selected or hovered else MUTED, font=ui_font(18), anchor="center")


class TimeSlider(tk.Canvas):
    def __init__(self, master, variable: tk.IntVar, command):
        super().__init__(master, height=86, bg=BG, highlightthickness=0, bd=0, cursor="hand2")
        self.variable = variable
        self.command = command
        self.bind("<Configure>", self.redraw)
        self.bind("<Button-1>", self._set_from_event)
        self.bind("<B1-Motion>", self._set_from_event)

    def _set_from_event(self, event):
        width = max(1, self.winfo_width() - 2)
        value = int(round(max(0, min(width, event.x - 1)) / width * 24))
        self.variable.set(value)
        self.redraw()
        self.command()
        return "break"

    def redraw(self, _event=None):
        self.delete("all")
        width = max(1, self.winfo_width() - 22)
        track_y = 17
        self.create_line(11, track_y, width + 11, track_y, fill=BORDER, width=6, capstyle="round")
        x = 11 + width * self.variable.get() / 24
        self.create_line(11, track_y, x, track_y, fill=ACCENT, width=6, capstyle="round")
        self.create_oval(x - 10, track_y - 10, x + 10, track_y + 10, fill=BG, outline=ACCENT, width=3)
        for value, label in zip((0, 6, 12, 18, 24), ("00", "06", "12", "18", "24")):
            tx = 10 + (self.winfo_width() - 20) * value / 24
            self.create_line(tx, 54, tx, 61, fill=BORDER, width=2)
            self.create_text(tx, 75, text=label, fill=MUTED, font=ui_font(16), anchor="center")


def resolve_config_file() -> Path:
    base_dir = Path(os.environ.get("LOCALAPPDATA", Path.home()))
    app_dir = base_dir / APP_DIR_NAME
    try:
        app_dir.mkdir(parents=True, exist_ok=True)
        return app_dir / "widget_config.json"
    except OSError:
        return Path(__file__).with_name("widget_config.json")


CONFIG_FILE = resolve_config_file()


@dataclass(frozen=True)
class TimezoneItem:
    tz_name: str
    city_label: str
    city_id: str = ""
    english_name: str = ""
    russian_name: str = ""
    country_code: str = ""
    aliases: str = ""
    population: int = 0

    @property
    def key(self) -> str:
        return f"{self.tz_name}@@{self.city_id}" if self.city_id else self.tz_name


CITY_ITEMS_BY_KEY: dict[str, TimezoneItem] = {}


def timezone_from_city_key(value: str) -> str:
    return value.split("@@", 1)[0]


def is_russian_text(value: str) -> bool:
    russian_letters = set("АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя")
    return any(char in russian_letters for char in value) and all(not char.isalpha() or char in russian_letters for char in value)


def prettify_timezone_label(tz_name: str) -> str:
    localized = {
        "Europe/Moscow": ("Москва", "Европа"),
        "Asia/Vladivostok": ("Владивосток", "Азия"),
        "Asia/Almaty": ("Алматы", "Азия"),
        "Asia/Tokyo": ("Токио", "Азия"),
        "America/New_York": ("Нью-Йорк", "Америка"),
        "Europe/London": ("Лондон", "Европа"),
        "Asia/Dubai": ("Дубай", "Азия"),
        "Australia/Sydney": ("Сидней", "Австралия"),
        "Europe/Berlin": ("Берлин", "Европа"),
        "Asia/Ho_Chi_Minh": ("Ханой", "Азия"),
    }
    if tz_name in localized:
        city, region = localized[tz_name]
        return f"{city} ({region})"
    parts = tz_name.split("/")
    city = parts[-1].replace("_", " ")
    region = "/".join(parts[:-1]).replace("_", " ")
    return f"{city} ({region})" if region else city


def display_timezone_label(tz_name: str, language: str = "ru") -> str:
    item = CITY_ITEMS_BY_KEY.get(tz_name)
    if item is not None:
        name = item.russian_name if language == "ru" and item.russian_name else item.english_name
        return f"{name} ({item.country_code})" if item.country_code else name
    tz_name = timezone_from_city_key(tz_name)
    if language == "ru":
        return prettify_timezone_label(tz_name)
    if tz_name == "Asia/Ho_Chi_Minh":
        return "Hanoi (Asia)"
    parts = tz_name.split("/")
    city = parts[-1].replace("_", " ")
    region = "/".join(parts[:-1]).replace("_", " ")
    return f"{city} ({region})" if region else city


def format_offset(delta_seconds: float) -> str:
    hours = int(delta_seconds // 3600)
    sign = "+" if hours > 0 else ""
    return f"{sign}{hours} ч." if hours != 0 else "0 ч."


def get_available_tz_names() -> set[str]:
    try:
        tz_names = set(available_timezones())
    except Exception:
        tz_names = set()

    if not tz_names:
        tz_names = {"Etc/UTC", "UTC"}

    return tz_names


class GlobalHotkeyListener(threading.Thread):
    HOTKEY_ID = 1
    MOD_ALT = 0x0001
    MOD_SHIFT = 0x0004
    VK_T = 0x54
    PM_REMOVE = 0x0001
    WM_HOTKEY = 0x0312

    def __init__(self, on_hotkey):
        super().__init__(daemon=True)
        self.on_hotkey = on_hotkey
        self._stop_event = threading.Event()
        self.user32 = ctypes.windll.user32

    def run(self):
        registered = self.user32.RegisterHotKey(
            None,
            self.HOTKEY_ID,
            self.MOD_ALT | self.MOD_SHIFT,
            self.VK_T,
        )
        if not registered:
            return

        msg = wintypes.MSG()
        while not self._stop_event.is_set():
            while self.user32.PeekMessageW(
                ctypes.byref(msg),
                None,
                0,
                0,
                self.PM_REMOVE,
            ):
                if msg.message == self.WM_HOTKEY and msg.wParam == self.HOTKEY_ID:
                    self.on_hotkey()
                self.user32.TranslateMessage(ctypes.byref(msg))
                self.user32.DispatchMessageW(ctypes.byref(msg))
            time.sleep(0.05)

        self.user32.UnregisterHotKey(None, self.HOTKEY_ID)

    def stop(self):
        self._stop_event.set()


class SearchableDropdown(tk.Frame):
    active_dropdown: "SearchableDropdown | None" = None

    def __init__(
        self,
        master,
        values: list[str],
        initial_value: str,
        on_select: Callable[[str], None],
        font: tuple[str, int] = (FONT_FAMILY, 11),
        dropdown_height: int = 8,
        embedded: bool = False,
    ):
        parent_bg = master.cget("bg") if "bg" in master.keys() else BG
        super().__init__(master, bg=parent_bg)
        self.on_select = on_select
        self.font = font
        self.dropdown_height = dropdown_height
        self.embedded = embedded
        self.state = "normal"

        self._all_values: list[str] = []
        self._filtered_values: list[str] = []
        self._outside_click_bind_id: str | None = None
        self.popup: tk.Toplevel | None = None
        self.search_entry: tk.Entry | None = None
        self.listbox: tk.Listbox | None = None
        self.current_value = ""

        self.container = tk.Frame(
            self,
            bg=parent_bg if embedded else SURFACE,
            highlightthickness=0 if embedded else 1,
            highlightbackground=BORDER,
            highlightcolor=ACCENT,
        )
        self.container.pack(fill="x", expand=True)

        self.value_label = tk.Label(
            self.container,
            text="",
            anchor="w",
            bg=parent_bg if embedded else SURFACE,
            fg=TEXT,
            font=font,
            padx=0 if embedded else 12,
            pady=0 if embedded else 8,
        )
        self.value_label.pack(side="left", fill="x", expand=True)

        self.arrow_label = tk.Label(
            self.container,
            text="⌄",
            bg=parent_bg if embedded else SURFACE,
            fg=MUTED,
            font=ui_font(max(10, font[1]), "bold"),
            padx=0 if embedded else 12,
            pady=0 if embedded else 8,
        )
        self.arrow_label.pack(side="right")

        for widget in (self, self.container, self.value_label, self.arrow_label):
            widget.bind("<Button-1>", self.open_popup)

        self.bind("<Destroy>", lambda _event: self.close_popup())
        self.set_values(values, preserve_current=False)
        self.set(initial_value if initial_value in self._all_values else (self._all_values[0] if self._all_values else ""))

    @staticmethod
    def _sorted_unique(values: list[str]) -> list[str]:
        return sorted(dict.fromkeys(values), key=lambda value: value.lower())

    def _set_display_state(self):
        if self.state == "disabled":
            bg = SURFACE
            fg = "#6E7681"
            arrow_fg = "#6E7681"
        else:
            bg = self.master.cget("bg") if self.embedded else SURFACE
            fg = TEXT
            arrow_fg = MUTED
        self.container.configure(bg=bg)
        self.value_label.configure(bg=bg, fg=fg)
        self.arrow_label.configure(bg=bg, fg=arrow_fg)

    def set_state(self, state: str):
        self.state = "disabled" if state == "disabled" else "normal"
        if self.state == "disabled":
            self.close_popup()
        self._set_display_state()

    def set_values(self, values: list[str], preserve_current: bool = True):
        previous = self.current_value
        self._all_values = self._sorted_unique(values)
        if preserve_current and previous in self._all_values:
            self.set(previous)
        elif self._all_values:
            self.set(self._all_values[0])
        else:
            self.set("")

    def get(self) -> str:
        return self.current_value

    def set(self, value: str):
        if value and value in self._all_values:
            self.current_value = value
        elif self._all_values:
            self.current_value = self._all_values[0]
        else:
            self.current_value = ""
        self.value_label.configure(text=self.current_value)

    def open_popup(self, _event=None):
        if self.state == "disabled":
            return

        if SearchableDropdown.active_dropdown is not None and SearchableDropdown.active_dropdown is not self:
            SearchableDropdown.active_dropdown.close_popup()

        if self.popup is not None:
            self.close_popup()
            return

        SearchableDropdown.active_dropdown = self

        self.popup = tk.Toplevel(self)
        self.popup.overrideredirect(True)
        self.popup.attributes("-topmost", True)
        self.popup.configure(bg=BORDER)

        content = tk.Frame(self.popup, bg=SURFACE)
        content.pack(fill="both", expand=True, padx=1, pady=1)

        self.search_entry = tk.Entry(
            content,
            font=self.font,
            bg=BG,
            fg=TEXT,
            insertbackground=TEXT,
            relief="flat",
            highlightthickness=1,
            highlightcolor=ACCENT,
            highlightbackground=BORDER,
        )
        self.search_entry.pack(fill="x", padx=6, pady=(6, 4), ipady=5)

        list_frame = tk.Frame(content, bg=SURFACE)
        list_frame.pack(fill="both", expand=True, padx=6, pady=(0, 6))

        scrollbar = tk.Scrollbar(list_frame)
        scrollbar.pack(side="right", fill="y")

        self.listbox = tk.Listbox(
            list_frame,
            bg=SURFACE,
            fg=TEXT,
            selectbackground=ACCENT,
            selectforeground=TEXT,
            relief="flat",
            font=self.font,
            activestyle="none",
            exportselection=False,
            height=self.dropdown_height,
            yscrollcommand=scrollbar.set,
        )
        self.listbox.pack(side="left", fill="both", expand=True)
        scrollbar.configure(command=self.listbox.yview)

        self._refresh_matches("")
        self._place_popup()

        self.search_entry.bind("<KeyRelease>", self._on_search_key_release)
        self.search_entry.bind("<Down>", self._on_down_key)
        self.search_entry.bind("<Return>", self._on_return_key)
        self.search_entry.bind("<Escape>", self._on_escape_key)
        self.search_entry.bind("<FocusOut>", self._on_popup_focus_out)
        self.listbox.bind("<ButtonRelease-1>", self._select_from_listbox)
        self.listbox.bind("<Double-Button-1>", self._select_from_listbox)
        self.listbox.bind("<Return>", self._select_from_listbox)
        self.listbox.bind("<Escape>", self._on_escape_key)

        top_level = self.winfo_toplevel()
        self._outside_click_bind_id = top_level.bind("<Button-1>", self._on_top_level_click, add="+")

        self.search_entry.focus_set()

    def _place_popup(self):
        if self.popup is None:
            return
        self.update_idletasks()
        width = max(self.winfo_width(), 260)
        x = self.winfo_rootx()
        y = self.winfo_rooty() + self.winfo_height()
        desired_height = min(300, 86 + max(1, min(self.dropdown_height, len(self._all_values))) * 24)
        screen_bottom = self.winfo_screenheight() - 8
        if y + desired_height > screen_bottom:
            y = max(8, self.winfo_rooty() - desired_height)
        self.popup.geometry(f"{width}x{desired_height}+{x}+{y}")

    def close_popup(self):
        if self._outside_click_bind_id is not None:
            top_level = self.winfo_toplevel()
            top_level.unbind("<Button-1>", self._outside_click_bind_id)
            self._outside_click_bind_id = None

        if self.popup is not None:
            try:
                self.popup.destroy()
            except tk.TclError:
                pass
        self.popup = None
        self.search_entry = None
        self.listbox = None

        if SearchableDropdown.active_dropdown is self:
            SearchableDropdown.active_dropdown = None

    def _refresh_matches(self, query: str):
        if self.listbox is None:
            return
        q = query.strip().casefold()
        if not q:
            matches = list(self._all_values)
        else:
            matches = [value for value in self._all_values if q in value.lower()]
        self._filtered_values = matches

        self.listbox.delete(0, tk.END)
        for value in matches:
            self.listbox.insert(tk.END, value)

        if not matches:
            return

        current_index = 0
        if self.current_value in matches:
            current_index = matches.index(self.current_value)
        self.listbox.selection_set(current_index)
        self.listbox.activate(current_index)
        self.listbox.see(current_index)

    def _commit_selection(self, value: str):
        if value not in self._all_values:
            return
        self.set(value)
        self.on_select(value)
        self.close_popup()

    def _select_from_listbox(self, _event=None):
        if self.listbox is None:
            return "break"
        selection = self.listbox.curselection()
        if not selection:
            return "break"
        self._commit_selection(self._filtered_values[selection[0]])
        return "break"

    def _on_search_key_release(self, event):
        if event.keysym in {"Up", "Down", "Return", "Escape"}:
            return
        if self.search_entry is None:
            return
        self._refresh_matches(self.search_entry.get())

    def _on_down_key(self, _event=None):
        if self.listbox is None or not self._filtered_values:
            return "break"
        selection = self.listbox.curselection()
        index = 0 if not selection else min(selection[0] + 1, len(self._filtered_values) - 1)
        self.listbox.selection_clear(0, tk.END)
        self.listbox.selection_set(index)
        self.listbox.activate(index)
        self.listbox.see(index)
        return "break"

    def _on_return_key(self, _event=None):
        return self._select_from_listbox()

    def _on_escape_key(self, _event=None):
        self.close_popup()
        return "break"

    def _on_popup_focus_out(self, _event=None):
        self.after(30, self._close_if_focus_left_popup)

    def _close_if_focus_left_popup(self):
        if self.popup is None:
            return
        focused_widget = self.focus_displayof()
        if focused_widget is None:
            self.close_popup()
            return
        widget_path = str(focused_widget)
        if widget_path.startswith(str(self.popup)):
            return
        self.close_popup()

    def _on_top_level_click(self, event):
        if self.popup is None:
            return
        target_path = str(event.widget)
        if target_path.startswith(str(self)) or target_path.startswith(str(self.popup)):
            return
        self.close_popup()


class AddCityDialog(tk.Toplevel):
    def __init__(self, master: tk.Tk, all_timezones: list[TimezoneItem], on_add):
        super().__init__(master)
        self.title("Добавить город")
        self.geometry("520x620")
        self.configure(bg="#0A0D19")
        self.resizable(False, False)
        self.transient(master)
        self.grab_set()

        self.all_timezones = all_timezones
        self.filtered_items = all_timezones
        self.on_add = on_add

        self.search_var = tk.StringVar()
        self.search_var.trace_add("write", self.filter_items)

        header = tk.Label(
            self,
            text="Добавить город",
            fg="#E7EAF3",
            bg="#0A0D19",
            font=("Segoe UI", 18, "bold"),
        )
        header.pack(anchor="w", padx=20, pady=(18, 8))

        search_entry = tk.Entry(
            self,
            textvariable=self.search_var,
            font=("Segoe UI", 12),
            bg="#161B2A",
            fg="#E7EAF3",
            insertbackground="#E7EAF3",
            relief="flat",
            highlightthickness=1,
            highlightcolor="#2B3350",
            highlightbackground="#2B3350",
        )
        search_entry.pack(fill="x", padx=20, pady=(0, 12), ipady=9)
        search_entry.focus_set()

        list_frame = tk.Frame(self, bg="#0A0D19")
        list_frame.pack(fill="both", expand=True, padx=20, pady=(0, 12))

        scrollbar = tk.Scrollbar(list_frame)
        scrollbar.pack(side="right", fill="y")

        self.listbox = tk.Listbox(
            list_frame,
            bg="#11172A",
            fg="#E7EAF3",
            selectbackground="#2F64FF",
            selectforeground="#FFFFFF",
            relief="flat",
            font=("Segoe UI", 11),
            yscrollcommand=scrollbar.set,
        )
        self.listbox.pack(side="left", fill="both", expand=True)
        self.listbox.bind("<Double-Button-1>", self.add_selected)
        self.listbox.bind("<Return>", self.add_selected)
        scrollbar.config(command=self.listbox.yview)

        action_frame = tk.Frame(self, bg="#0A0D19")
        action_frame.pack(fill="x", padx=20, pady=(0, 18))

        cancel_btn = tk.Button(
            action_frame,
            text="Отмена",
            command=self.destroy,
            bg="#2A2F43",
            fg="#E7EAF3",
            activebackground="#3A4260",
            activeforeground="#FFFFFF",
            relief="flat",
            font=("Segoe UI", 10, "bold"),
            padx=16,
            pady=8,
            cursor="hand2",
        )
        cancel_btn.pack(side="right")

        add_btn = tk.Button(
            action_frame,
            text="Добавить",
            command=self.add_selected,
            bg="#6B3F71",
            fg="#F9F6FF",
            activebackground="#8B4E95",
            activeforeground="#FFFFFF",
            relief="flat",
            font=("Segoe UI", 10, "bold"),
            padx=16,
            pady=8,
            cursor="hand2",
        )
        add_btn.pack(side="right", padx=(0, 8))

        self.refresh_listbox()

    def filter_items(self, *_):
        query = self.search_var.get().strip().lower()
        if not query:
            self.filtered_items = self.all_timezones
        else:
            self.filtered_items = [
                item
                for item in self.all_timezones
                if query in item.city_label.lower() or query in item.tz_name.lower()
            ]
        self.refresh_listbox()

    def refresh_listbox(self):
        self.listbox.delete(0, tk.END)
        for item in self.filtered_items:
            self.listbox.insert(tk.END, f"{item.city_label}  |  {item.tz_name}")

    def add_selected(self, _event=None):
        selection = self.listbox.curselection()
        if not selection:
            return
        selected_item = self.filtered_items[selection[0]]
        self.on_add(selected_item.tz_name)
        self.destroy()


class SettingsDialog(tk.Toplevel):
    def __init__(self, master: tk.Tk, settings: dict, timezone_items: list[TimezoneItem], on_save):
        super().__init__(master)
        self.title("Настройки")
        self.geometry("520x360")
        self.configure(bg="#0A0D19")
        self.resizable(False, False)
        self.transient(master)
        self.grab_set()

        self.on_save = on_save
        self.mode_var = tk.StringVar(value=settings.get("top_clock_mode", "auto"))
        self.manual_timezone_var = tk.StringVar(value=settings.get("manual_top_timezone", "Etc/UTC"))
        self.direction_label_to_key = {label: key for key, label in OVERLAY_DIRECTIONS.items()}

        direction_key = settings.get("overlay_direction", DEFAULT_OVERLAY_DIRECTION)
        if direction_key not in OVERLAY_DIRECTIONS:
            direction_key = DEFAULT_OVERLAY_DIRECTION
        self.direction_label_var = tk.StringVar(value=OVERLAY_DIRECTIONS[direction_key])

        self.tz_names = [item.tz_name for item in timezone_items]
        self.direction_values = list(OVERLAY_DIRECTIONS.values())

        header = tk.Label(
            self,
            text="Настройки",
            fg="#E7EAF3",
            bg="#0A0D19",
            font=("Segoe UI", 18, "bold"),
        )
        header.pack(anchor="w", padx=20, pady=(16, 12))

        content = tk.Frame(self, bg="#0A0D19")
        content.pack(fill="both", expand=True, padx=20)

        top_clock_label = tk.Label(
            content,
            text="Верхние часы",
            fg="#E7EAF3",
            bg="#0A0D19",
            font=("Segoe UI", 11, "bold"),
        )
        top_clock_label.grid(row=0, column=0, sticky="w")

        auto_radio = tk.Radiobutton(
            content,
            text="Авто (локальное время Windows)",
            variable=self.mode_var,
            value="auto",
            command=self._sync_manual_state,
            fg="#D6DBEB",
            bg="#0A0D19",
            selectcolor="#162034",
            activebackground="#0A0D19",
            activeforeground="#FFFFFF",
            font=("Segoe UI", 10),
        )
        auto_radio.grid(row=1, column=0, sticky="w", pady=(6, 0))

        manual_radio = tk.Radiobutton(
            content,
            text="Ручной часовой пояс",
            variable=self.mode_var,
            value="manual",
            command=self._sync_manual_state,
            fg="#D6DBEB",
            bg="#0A0D19",
            selectcolor="#162034",
            activebackground="#0A0D19",
            activeforeground="#FFFFFF",
            font=("Segoe UI", 10),
        )
        manual_radio.grid(row=2, column=0, sticky="w", pady=(4, 4))

        self.manual_dropdown = SearchableDropdown(
            content,
            values=self.tz_names,
            initial_value=self.manual_timezone_var.get(),
            on_select=lambda value: self.manual_timezone_var.set(value),
            font=("Segoe UI", 10),
        )
        self.manual_dropdown.grid(row=3, column=0, sticky="we", pady=(0, 14))

        direction_label = tk.Label(
            content,
            text="Анимация открытия оверлея",
            fg="#E7EAF3",
            bg="#0A0D19",
            font=("Segoe UI", 11, "bold"),
        )
        direction_label.grid(row=4, column=0, sticky="w")

        self.direction_dropdown = SearchableDropdown(
            content,
            values=self.direction_values,
            initial_value=self.direction_label_var.get(),
            on_select=lambda value: self.direction_label_var.set(value),
            font=("Segoe UI", 10),
        )
        self.direction_dropdown.grid(row=5, column=0, sticky="we", pady=(6, 8))

        content.columnconfigure(0, weight=1)

        action_frame = tk.Frame(self, bg="#0A0D19")
        action_frame.pack(fill="x", padx=20, pady=(0, 18))

        cancel_btn = tk.Button(
            action_frame,
            text="Отмена",
            command=self.destroy,
            bg="#2A2F43",
            fg="#E7EAF3",
            activebackground="#3A4260",
            activeforeground="#FFFFFF",
            relief="flat",
            font=("Segoe UI", 10, "bold"),
            padx=16,
            pady=8,
            cursor="hand2",
        )
        cancel_btn.pack(side="right")

        save_btn = tk.Button(
            action_frame,
            text="Сохранить",
            command=self.save,
            bg="#6B3F71",
            fg="#F9F6FF",
            activebackground="#8B4E95",
            activeforeground="#FFFFFF",
            relief="flat",
            font=("Segoe UI", 10, "bold"),
            padx=16,
            pady=8,
            cursor="hand2",
        )
        save_btn.pack(side="right", padx=(0, 8))

        self._sync_manual_state()

    def _sync_manual_state(self):
        state = "normal" if self.mode_var.get() == "manual" else "disabled"
        self.manual_dropdown.set_state(state)

    def save(self):
        selected_direction = self.direction_label_var.get()
        direction_key = self.direction_label_to_key.get(selected_direction, DEFAULT_OVERLAY_DIRECTION)
        payload = {
            "top_clock_mode": self.mode_var.get(),
            "manual_top_timezone": self.manual_timezone_var.get(),
            "overlay_direction": direction_key,
        }
        self.on_save(payload)
        self.destroy()


class FigmaDialog(tk.Toplevel):
    def __init__(self, master, title: str):
        super().__init__(master)
        self.title(title)
        self.geometry(self._dialog_geometry(master))
        self.resizable(False, False)
        self.configure(bg=TRANSPARENT_KEY)
        self.overrideredirect(True)
        self.attributes("-topmost", True)
        try:
            self.wm_attributes("-transparentcolor", TRANSPARENT_KEY)
        except tk.TclError:
            self.configure(bg=BG)
        self.transient(master)
        self.grab_set()
        self._images: list[object] = []

        chrome = tk.Canvas(self, width=400, height=750, bg=TRANSPARENT_KEY, highlightthickness=0, bd=0)
        chrome.pack(fill="both", expand=True)
        _rounded_polygon(chrome, 1, 1, 399, 749, 20, fill=BG, outline=BORDER, width=1)
        self.shell = tk.Frame(chrome, bg=BG, width=364, height=714)
        self.shell.pack_propagate(False)
        chrome.create_window(18, 18, anchor="nw", width=364, height=714, window=self.shell)
        self.protocol("WM_DELETE_WINDOW", self.close)
        self.bind("<Escape>", lambda _e: self.close())
        self.after_idle(lambda: (self.lift(), self.focus_force()))

    @staticmethod
    def _dialog_geometry(master) -> str:
        master.update_idletasks()
        width, height = 400, 750
        x = master.winfo_rootx() + (master.winfo_width() - width) // 2
        y = master.winfo_rooty() + (master.winfo_height() - height) // 2
        x = min(max(0, x), max(0, master.winfo_screenwidth() - width))
        y = min(max(0, y), max(0, master.winfo_screenheight() - height))
        return f"400x750+{x}+{y}"

    def header(self, title: str):
        row = tk.Frame(self.shell, bg=BG, height=40)
        row.pack(fill="x")
        row.pack_propagate(False)
        back = IconButton(row, "arrow-left", self.close, size=32, icon_size=16)
        back.pack(side="left", pady=4)
        label = tk.Label(row, text=title, bg=BG, fg=TEXT, font=ui_font(17, "bold"), anchor="w")
        self.header_title_label = label
        label.pack(side="left", padx=(8, 0), fill="y")
        row.bind("<ButtonPress-1>", self._start_drag)
        row.bind("<B1-Motion>", self._drag)
        label.bind("<ButtonPress-1>", self._start_drag)
        label.bind("<B1-Motion>", self._drag)
        return row

    def _start_drag(self, event):
        self._drag_x = event.x_root - self.winfo_x()
        self._drag_y = event.y_root - self.winfo_y()

    def _drag(self, event):
        self.geometry(f"400x750+{event.x_root - self._drag_x}+{event.y_root - self._drag_y}")

    def icon_label(self, master, name: str, size: int):
        label = tk.Label(master, bg=master.cget("bg"))
        source = tinted_icon(name, size)
        if source is not None and ImageTk is not None:
            photo = ImageTk.PhotoImage(source)
            self._images.append(photo)
            label.configure(image=photo)
        return label

    def close(self):
        self.destroy()


class FigmaChoiceDialog(FigmaDialog):
    def __init__(self, master, title: str, options: list[tuple[str, str, str]], selected: str, on_select, compact=False):
        self.options = options
        self.selected = selected
        self.on_select = on_select
        self.compact = compact
        super().__init__(master, title)
        self.header(title).pack_propagate(False)
        self.body = tk.Frame(self.shell, bg=BG)
        self.body.pack(fill="both", expand=True, pady=(16, 0))
        if compact:
            self._build_search()
            section = tk.Label(self.body, text="МОИ ГОРОДА", bg=BG, fg=MUTED, font=ui_font(12, "bold"), anchor="w")
            section.pack(fill="x", pady=(16, 10))
        self.options_frame = tk.Frame(self.body, bg=BG)
        self.options_frame.pack(fill="x")
        self._render_options()

    def _build_search(self):
        panel = RoundedPanel(self.body, height=36, fill=SURFACE, outline=BORDER, radius=10, padding=0)
        panel.pack(fill="x")
        icon = self.icon_label(panel.content, "search", 16)
        icon.pack(side="left", padx=(12, 10))
        self.search_var = tk.StringVar()
        entry = tk.Entry(
            panel.content,
            textvariable=self.search_var,
            bg=SURFACE,
            fg=TEXT,
            insertbackground=TEXT,
            relief="flat",
            borderwidth=0,
            font=ui_font(12),
        )
        entry.pack(side="left", fill="both", expand=True, padx=(0, 10), pady=7)
        entry.insert(0, "Поиск базового города...")
        entry.configure(fg="#59616D")

        def focus_in(_event):
            if entry.get() == "Поиск базового города...":
                entry.delete(0, tk.END)
                entry.configure(fg=TEXT)

        def focus_out(_event):
            if not entry.get():
                entry.insert(0, "Поиск базового города...")
                entry.configure(fg="#59616D")

        entry.bind("<FocusIn>", focus_in)
        entry.bind("<FocusOut>", focus_out)
        entry.bind("<KeyRelease>", lambda _e: self._filter_options(entry.get()))

    def _filter_options(self, query: str):
        q = query.strip().lower()
        self.filtered_options = [
            option for option in self.options
            if not q or q in option[1].lower() or q in option[2].lower()
        ]
        self._render_options()

    def _render_options(self):
        for child in self.options_frame.winfo_children():
            child.destroy()
        height = 48 if self.compact else 69
        options = getattr(self, "filtered_options", self.options)
        for index, (value, title, subtitle) in enumerate(options):
            active = value == self.selected
            panel = RoundedPanel(
                self.options_frame,
                height=height,
                fill=SURFACE,
                outline=ACCENT if active else BORDER,
                radius=12,
                padding=14 if self.compact else 16,
            )
            panel.pack(fill="x", pady=(0, 10 if self.compact else 12))
            text_side = tk.Frame(panel.content, bg=SURFACE)
            text_side.pack(side="left", fill="both", expand=True)
            title_label = tk.Label(text_side, text=title, bg=SURFACE, fg=TEXT if active else (MUTED if not self.compact else TEXT), font=ui_font(14, "bold"), anchor="w")
            title_label.pack(anchor="w")
            if subtitle:
                sub = tk.Label(text_side, text=subtitle, bg=SURFACE, fg=MUTED if active else "#59616D", font=ui_font(11), anchor="w")
                sub.pack(anchor="w", pady=(3, 0))
            marker = tk.Canvas(panel.content, width=22, height=22, bg=SURFACE, highlightthickness=0, bd=0)
            marker.pack(side="right")
            marker.create_oval(2, 2, 20, 20, fill=ACCENT if active else SURFACE, outline=ACCENT if active else BORDER, width=2 if not active else 1)
            if active:
                source = tinted_icon("check", 12)
                if source is not None and ImageTk is not None:
                    photo = ImageTk.PhotoImage(source)
                    self._images.append(photo)
                    marker.create_image(11, 11, image=photo)
            callback = lambda _e=None, choice=value: self._choose(choice)
            for widget in (panel, panel.content, text_side, title_label, marker):
                widget.bind("<Button-1>", callback)

    def _choose(self, value: str):
        self.on_select(value)
        self.destroy()


class FigmaAddCityDialog(FigmaDialog):
    POPULAR = ["Asia/Tokyo", "America/New_York", "Europe/London", "Asia/Dubai", "Australia/Sydney", "Europe/Berlin"]

    def __init__(self, master, all_timezones: list[TimezoneItem], on_add, title: str = "Добавить город", language: str = "ru", favorite_timezones=None, on_favorite_add=None, on_favorite_remove=None, stay_open=False):
        self.all_timezones = all_timezones
        self.item_by_zone = {item.key: item for item in all_timezones}
        self.on_add = on_add
        self.on_favorite_remove = on_favorite_remove
        self.on_favorite_add = on_favorite_add
        self.favorite_timezones = list(self.POPULAR if favorite_timezones is None else favorite_timezones)
        self.stay_open = stay_open
        self.current_query = ""
        self.language = language
        super().__init__(master, title)
        self.header(title)
        self.body = tk.Frame(self.shell, bg=BG)
        self.body.pack(fill="both", expand=True, pady=(16, 0))
        self._build_search()
        self.section_label = tk.Label(self.body, text=tr("popular_cities", language), bg=BG, fg=MUTED, font=ui_font(12, "bold"), anchor="w")
        self.section_label.pack(fill="x", pady=(16, 10))
        self.list_canvas = tk.Canvas(self.body, bg=BG, highlightthickness=0, bd=0)
        self.list_canvas.pack(fill="both", expand=True)
        self.list_inner = tk.Frame(self.list_canvas, bg=BG)
        self.list_window = self.list_canvas.create_window(0, 0, anchor="nw", window=self.list_inner)
        self.list_inner.bind("<Configure>", lambda _e: self.list_canvas.configure(scrollregion=self.list_canvas.bbox("all")))
        self.list_canvas.bind("<Configure>", lambda e: self.list_canvas.itemconfigure(self.list_window, width=e.width))
        self.list_canvas.bind_all("<MouseWheel>", self._on_wheel)
        self._render_items("")

    def destroy(self):
        try:
            self.list_canvas.unbind_all("<MouseWheel>")
        except (AttributeError, tk.TclError):
            pass
        super().destroy()

    def _on_wheel(self, event):
        self.list_canvas.yview_scroll(int(-event.delta / 120), "units")

    def _build_search(self):
        panel = RoundedPanel(self.body, height=38, fill=SURFACE, outline=BORDER, radius=10)
        panel.pack(fill="x")
        icon = self.icon_label(panel.content, "search", 18)
        icon.pack(side="left", padx=(12, 10))
        self.search_var = tk.StringVar()
        entry = tk.Entry(panel.content, textvariable=self.search_var, bg=SURFACE, fg=TEXT, insertbackground=TEXT, relief="flat", bd=0, font=ui_font(12))
        entry.pack(side="left", fill="both", expand=True, padx=(0, 12), pady=8)
        placeholder = tr("search_city", self.language)
        entry.insert(0, placeholder)
        entry.configure(fg="#59616D")

        def focus_in(_event):
            if entry.get() == placeholder:
                entry.delete(0, tk.END)
                entry.configure(fg=TEXT)

        def focus_out(_event):
            if not entry.get():
                entry.insert(0, placeholder)
                entry.configure(fg="#59616D")
                self._render_items("")

        entry.bind("<FocusIn>", focus_in)
        entry.bind("<FocusOut>", focus_out)
        entry.bind("<KeyRelease>", lambda _e: self._render_items(entry.get()))

    @staticmethod
    def _split_label(label: str) -> tuple[str, str]:
        if label.endswith(")") and " (" in label:
            city, region = label.rsplit(" (", 1)
            return city, f"({region}"
        return label, ""

    def _render_items(self, query: str):
        if not hasattr(self, "list_inner"):
            return
        for child in self.list_inner.winfo_children():
            child.destroy()
        self.current_query = query
        q = query.strip().casefold()
        if q:
            russian_query = is_russian_text(q)

            def searchable_names(item):
                if russian_query:
                    names = [item.russian_name.casefold()]
                    if not item.city_id:
                        names.extend(alias.casefold() for alias in item.aliases.split("|") if is_russian_text(alias))
                    return names
                names = [item.english_name.casefold()]
                names.extend(alias.casefold() for alias in item.aliases.split("|") if alias.isascii())
                return names

            items = [item for item in self.all_timezones if any(q in name for name in searchable_names(item))]
            def match_rank(item):
                names = searchable_names(item)
                if q in names:
                    rank = 0
                elif any(name.startswith(q) for name in names):
                    rank = 1
                elif any(any(word.startswith(q) for word in name.replace("-", " ").split()) for name in names):
                    rank = 2
                else:
                    rank = 3
                return rank, -item.population if rank == 0 else 0, display_timezone_label(item.key, self.language).casefold()
            items.sort(key=match_rank)
            items = items[:40]
            self.section_label.configure(text=tr("search_results", self.language))
        else:
            items = [self.item_by_zone[tz] for tz in self.favorite_timezones if tz in self.item_by_zone]
            self.section_label.configure(text=tr("popular_cities", self.language))
        self.filtered_items = items
        for item in items:
            panel = RoundedPanel(self.list_inner, height=52, fill=SURFACE, outline=BORDER, radius=12, padding=11)
            panel.pack(fill="x", pady=(0, 10))
            label = self._matching_label(item, q)
            city, region = self._split_label(label)
            line = tk.Frame(panel.content, bg=SURFACE)
            line.pack(side="left", fill="both", expand=True)
            city_label = tk.Label(line, text=city, bg=SURFACE, fg=TEXT, font=ui_font(13, "bold"), anchor="w")
            city_label.pack(side="left")
            if region:
                tk.Label(line, text=region, bg=SURFACE, fg=MUTED, font=ui_font(11), anchor="w").pack(side="left", padx=(8, 0))
            if item.key in self.favorite_timezones and self.on_favorite_remove is not None:
                remove = IconButton(panel.content, "close", lambda zone=item.key: self._remove_favorite(zone), size=28, icon_size=14, button_fill=BORDER)
                remove.pack(side="right", pady=1)
            favorite = StarButton(panel.content, lambda zone=item.key: self._toggle_favorite(zone), selected=item.key in self.favorite_timezones)
            favorite.pack(side="right", pady=1)
            add = IconButton(panel.content, "plus", lambda zone=item.key: self._add(zone), size=28, icon_size=14, button_fill=BORDER)
            add.pack(side="right", pady=1)

    def _matching_label(self, item: TimezoneItem, query: str) -> str:
        if query and any("а" <= char.casefold() <= "я" or char.casefold() == "ё" for char in query):
            matches = [alias for alias in item.aliases.split("|") if query in alias.casefold() and is_russian_text(alias)]
            if matches:
                matches.sort(key=lambda alias: (
                    0 if alias.casefold() == query else 1 if alias.casefold().startswith(query) else 2,
                    len(alias),
                    alias.casefold(),
                ))
                return f"{matches[0]} ({item.country_code})" if item.country_code else matches[0]
        return display_timezone_label(item.key, self.language)

    def _add(self, timezone_name: str):
        self.on_add(timezone_name)
        if not self.stay_open:
            self.destroy()

    def _remove_favorite(self, timezone_name: str):
        if self.on_favorite_remove is None:
            return
        self.on_favorite_remove(timezone_name)
        self.favorite_timezones = [tz for tz in self.favorite_timezones if tz != timezone_name]
        self._render_items(self.current_query)

    def _toggle_favorite(self, timezone_name: str):
        if timezone_name in self.favorite_timezones:
            self._remove_favorite(timezone_name)
        elif self.on_favorite_add is not None:
            self.on_favorite_add(timezone_name)
            self.favorite_timezones.append(timezone_name)
            self._render_items(self.current_query)


class FigmaSettingsDialog(FigmaDialog):
    def __init__(self, master, settings: dict, timezone_items: list[TimezoneItem], city_timezones: list[str], on_save, favorite_timezones=None, on_favorite_add=None, on_favorite_remove=None):
        self.settings = settings
        self.on_save = on_save
        self.timezone_items = timezone_items
        self.item_by_zone = {item.key: item for item in timezone_items}
        self.city_timezones = list(city_timezones)
        self.favorite_timezones = list(favorite_timezones or [])
        self.on_favorite_remove = on_favorite_remove
        self.on_favorite_add = on_favorite_add
        self.theme = settings.get("theme", "dark")
        self.language = settings.get("language", "ru")
        self.base_changed = False
        if settings.get("top_clock_mode", "auto") == "auto":
            self.base_timezone = "Asia/Ho_Chi_Minh" if "Asia/Ho_Chi_Minh" in self.item_by_zone else settings.get("manual_top_timezone", "Etc/UTC")
        else:
            self.base_timezone = settings.get("base_timezone") or settings.get("manual_top_timezone", "Etc/UTC")
        title = tr("settings", self.language)
        super().__init__(master, title)
        self.header(title)
        self.body = tk.Frame(self.shell, bg=BG)
        self.body.pack(fill="both", expand=True, pady=(16, 0))
        self._build()

    def _row(self, master, label: str, right_text: str, command=None, chevron=False):
        row = tk.Frame(master, bg=SURFACE, height=49, cursor="hand2" if command else "arrow")
        row.pack(fill="x")
        row.pack_propagate(False)
        left = tk.Label(row, text=label, bg=SURFACE, fg=TEXT, font=ui_font(13), anchor="w")
        left.pack(side="left", padx=14, fill="y")
        if chevron:
            icon = self.icon_label(row, "chevron-right", 14)
            icon.pack(side="right", padx=(8, 14))
        right = tk.Label(row, text=right_text, bg=SURFACE, fg=MUTED, font=ui_font(12), anchor="e")
        right.pack(side="right", fill="y")
        if command:
            for widget in (row, left, right):
                widget.bind("<Button-1>", lambda _e: command())
        return row

    def _separator(self, master):
        tk.Frame(master, bg=BORDER, height=1).pack(fill="x")

    def _build(self):
        group1 = RoundedPanel(self.body, height=50, fill=SURFACE, outline=BORDER, radius=12)
        group1.pack(fill="x")
        self._row(
            group1.content,
            tr("theme", self.language),
            tr(self.theme, self.language),
            command=self._open_theme,
            chevron=True,
        )

        group2 = RoundedPanel(self.body, height=98, fill=SURFACE, outline=BORDER, radius=12)
        group2.pack(fill="x", pady=(14, 0))
        language_label = tr("russian" if self.language == "ru" else "english", self.language)
        self._row(group2.content, tr("language", self.language), language_label, command=self._open_language, chevron=True)
        self._separator(group2.content)
        base_name = self._split_city(self.base_timezone)[0]
        self._row(group2.content, tr("base_city", self.language), base_name, command=self._open_base_city, chevron=True)

    def _split_city(self, timezone_name: str) -> tuple[str, str]:
        item = self.item_by_zone.get(timezone_name)
        label = display_timezone_label(timezone_name, self.language)
        return FigmaAddCityDialog._split_label(label)

    def _open_theme(self):
        options = [
            ("dark", tr("dark", self.language), ""),
            ("light", tr("light", self.language), ""),
        ]
        FigmaChoiceDialog(self, tr("theme", self.language), options, self.theme, self._set_theme)

    def _set_theme(self, value: str):
        self.theme = value
        updated = self._updated_settings()
        self.settings.update(updated)
        self.on_save(self.settings.copy())
        self.after_idle(self._reopen_with_current_theme)

    def _reopen_with_current_theme(self):
        master = self.master
        self.destroy()
        master.after_idle(master.open_settings_dialog)

    def _open_language(self):
        options = [("ru", "Русский", ""), ("en", "English", "")]
        FigmaChoiceDialog(self, tr("language", self.language), options, self.language, self._set_language)

    def _set_language(self, value: str):
        self.language = value
        self.header_title_label.configure(text=tr("settings", value))
        self._rebuild()

    def _open_base_city(self):
        FigmaAddCityDialog(
            self,
            self.timezone_items,
            self._set_base_city,
            title=tr("base_city", self.language),
            language=self.language,
            favorite_timezones=self.favorite_timezones,
            on_favorite_add=self._add_favorite,
            on_favorite_remove=self._remove_favorite,
        )

    def _add_favorite(self, timezone_name: str):
        if timezone_name not in self.favorite_timezones:
            self.favorite_timezones.append(timezone_name)
        if self.on_favorite_add:
            self.on_favorite_add(timezone_name)

    def _remove_favorite(self, timezone_name: str):
        self.favorite_timezones = [tz for tz in self.favorite_timezones if tz != timezone_name]
        if self.on_favorite_remove:
            self.on_favorite_remove(timezone_name)

    def _set_base_city(self, value: str):
        self.base_timezone = value
        self.base_changed = True
        self._rebuild()

    def _rebuild(self):
        for child in self.body.winfo_children():
            child.destroy()
        self._build()

    def _updated_settings(self) -> dict:
        payload = {
            "theme": self.theme,
            "language": self.language,
            "time_format": "24",
        }
        if self.base_changed:
            payload["base_timezone"] = self.base_timezone
        return payload

    def close(self):
        payload = self._updated_settings()
        self.settings.update(payload)
        self.on_save(self.settings)
        self.destroy()


class WorldClockWidget(tk.Tk):
    def __init__(self):
        super().__init__()

        self.offset_hours = tk.IntVar(value=0)
        self.city_timezones: list[str] = []
        self.favorite_timezones: list[str] = list(FigmaAddCityDialog.POPULAR)
        self.card_widgets: list[tuple[tk.Widget, tk.Label, tk.Label, tk.Widget]] = []
        self._card_animation_ids: dict[tk.Widget, str] = {}
        self._drag_panel = None
        self._drag_moved = False
        self.timezone_names = get_available_tz_names()
        self.available_timezone_items = self._build_timezone_items()
        self.timezone_option_to_tz: dict[str, str] = {}
        self.timezone_tz_to_option: dict[str, str] = {}
        for item in self.available_timezone_items:
            option_text = item.city_label
            if option_text in self.timezone_option_to_tz:
                option_text = f"{item.city_label} | {item.key}"
            self.timezone_option_to_tz[option_text] = item.key
            self.timezone_tz_to_option[item.key] = option_text
        self.timezone_option_values = list(self.timezone_option_to_tz.keys())

        default_manual = "Etc/UTC" if "Etc/UTC" in self.timezone_names else sorted(self.timezone_names)[0]
        self.settings = {
            "top_clock_mode": "auto",
            "manual_top_timezone": default_manual,
            "overlay_direction": DEFAULT_OVERLAY_DIRECTION,
            "time_format": "24",
            "base_timezone": "",
            "theme": "dark",
            "language": "ru",
        }

        self.overlay_visible = True
        self._drag_x = 0
        self._drag_y = 0
        self.force_hour_rounding = False
        self._animation_after_id: Optional[str] = None
        self.hotkey_listener: Optional[GlobalHotkeyListener] = None
        self.tray_icon = None

        width, height, x, y = self._default_overlay_geometry()
        self.overlay_target = {"width": width, "height": height, "x": x, "y": y}

        self.title(APP_TITLE)
        self.geometry(self._format_geometry(width, height, x, y))
        self.minsize(400, 750)
        self.resizable(True, True)
        self.configure(bg=TRANSPARENT_KEY)
        try:
            self.wm_attributes("-transparentcolor", TRANSPARENT_KEY)
        except tk.TclError:
            self.configure(bg=BG)
        self.overrideredirect(True)
        self.attributes("-topmost", True)

        self.load_config()
        set_theme(self.settings.get("theme", "dark"))
        self.configure(bg=TRANSPARENT_KEY)
        self.geometry(self._format_geometry(**self.overlay_target))
        self._build_layout()
        self.render_city_cards()

        self.bind("<Escape>", lambda _e: self.hide_overlay())
        self.protocol("WM_DELETE_WINDOW", self.hide_overlay)

        self.start_background_services()
        self.tick()

        # Стартуем в трее: окно скрыто, открывается по Alt+Shift+T.
        self.after(250, lambda: self.hide_overlay(animated=False))

    def _default_overlay_geometry(self) -> tuple[int, int, int, int]:
        width = 400
        height = 750
        screen_w = self.winfo_screenwidth()
        screen_h = self.winfo_screenheight()
        x = max(12, screen_w - width - 20)
        y = max(12, screen_h - height - 60)
        return width, height, x, y

    def _format_geometry(self, width: int, height: int, x: int, y: int) -> str:
        return f"{width}x{height}+{x}+{y}"

    def _build_timezone_items(self) -> list[TimezoneItem]:
        tz_names = sorted(tz for tz in self.timezone_names if "/" in tz)
        if not tz_names:
            tz_names = sorted(self.timezone_names)
        special_aliases = {
            "Asia/Almaty": "алма-ата|алма ата|alma-ata|alma ata",
            "Asia/Ho_Chi_Minh": "ханой|hanoi",
        }
        items = []
        for tz in tz_names:
            russian_name = prettify_timezone_label(tz).split(" (", 1)[0]
            items.append(TimezoneItem(
                tz,
                prettify_timezone_label(tz),
                english_name=display_timezone_label(tz, "en").split(" (", 1)[0],
                russian_name=russian_name if is_russian_text(russian_name) else "",
                aliases=special_aliases.get(tz, ""),
            ))
        known = {(item.tz_name, item.english_name.casefold()): index for index, item in enumerate(items)}
        catalog = resource_path("assets", "data", "cities15000.json.gz")
        if catalog.exists():
            try:
                with gzip.open(catalog, "rt", encoding="utf-8") as source:
                    for city_id, english, russian, country, tz_name, aliases, population in json.load(source):
                        if russian and not is_russian_text(russian):
                            russian = ""
                        if english.casefold() == "hanoi":
                            tz_name = "Asia/Ho_Chi_Minh"
                        if tz_name not in self.timezone_names:
                            continue
                        pair = (tz_name, english.casefold())
                        if pair in known:
                            index = known[pair]
                            items[index] = TimezoneItem(tz_name, f"{english} ({country})", english_name=english, russian_name=russian, country_code=country, aliases=aliases, population=population)
                            continue
                        items.append(TimezoneItem(tz_name, f"{english} ({country})", city_id, english, russian, country, aliases, population))
            except (OSError, ValueError, TypeError):
                pass
        CITY_ITEMS_BY_KEY.clear()
        CITY_ITEMS_BY_KEY.update((item.key, item) for item in items)
        return items

    def _resolve_zone(self, tz_name: str):
        try:
            return ZoneInfo(timezone_from_city_key(tz_name))
        except ZoneInfoNotFoundError:
            return timezone.utc

    def _valid_city_key(self, value: str) -> bool:
        return timezone_from_city_key(value) in self.timezone_names

    def _city_option_for_timezone(self, tz_name: str) -> str:
        return self.timezone_tz_to_option.get(
            tz_name,
            f"{display_timezone_label(tz_name, self.settings.get('language', 'ru'))} | {tz_name}",
        )

    def _parse_timezone_option(self, selected_text: str) -> Optional[str]:
        selected_text = selected_text.strip()
        if not selected_text:
            return None
        if selected_text == LOCAL_TIME_OPTION:
            return LOCAL_TIME_OPTION
        if " | " in selected_text:
            tz_candidate = selected_text.split(" | ", 1)[1].strip()
            if tz_candidate in self.timezone_names:
                return tz_candidate
        if selected_text in self.timezone_names:
            return selected_text
        return None

    def _timezone_option_values(self, include_local: bool = False) -> list[str]:
        values = list(self.timezone_option_values)
        if include_local:
            values.append(LOCAL_TIME_OPTION)
        return sorted(dict.fromkeys(values), key=lambda value: value.lower())

    def _create_city_dropdown(
        self,
        master,
        initial_value: str,
        on_commit,
        include_local: bool = False,
        font: tuple[str, int] = ("Segoe UI", 12),
    ) -> SearchableDropdown:
        option_values = self._timezone_option_values(include_local=include_local)
        if initial_value in option_values:
            fallback_value = initial_value
        else:
            fallback_value = option_values[0] if option_values else ""

        def handle_select(selected_text: str):
            parsed = self._parse_timezone_option(selected_text)
            if parsed is not None:
                on_commit(parsed)

        return SearchableDropdown(
            master,
            values=option_values,
            initial_value=fallback_value,
            on_select=handle_select,
            font=font,
        )

    def _build_layout(self):
        outer = tk.Frame(self, bg="#070B1A")
        outer.pack(fill="both", expand=True, padx=14, pady=14)

        top_bar = tk.Frame(outer, bg="#070B1A")
        top_bar.pack(fill="x", pady=(0, 6))

        initial_top = (
            LOCAL_TIME_OPTION
            if self.settings.get("top_clock_mode") == "auto"
            else self._city_option_for_timezone(self.settings.get("manual_top_timezone", "Etc/UTC"))
        )
        self.top_city_dropdown = self._create_city_dropdown(
            top_bar,
            initial_top,
            self._on_top_city_selected,
            include_local=True,
            font=("Segoe UI", 12),
        )
        self.top_city_dropdown.pack(side="left", fill="x", expand=True, padx=(0, 8))

        hotkey_hint = tk.Label(
            top_bar,
            text="Alt+Shift+T",
            fg="#8E95AA",
            bg="#070B1A",
            font=("Segoe UI", 10),
        )
        hotkey_hint.pack(side="right", padx=(0, 8))

        hide_btn = tk.Button(
            top_bar,
            text="-",
            command=self.hide_overlay,
            bg="#202944",
            fg="#D9DEEE",
            activebackground="#2C395C",
            activeforeground="#FFFFFF",
            relief="flat",
            font=("Segoe UI", 12, "bold"),
            padx=10,
            pady=2,
            cursor="hand2",
        )
        hide_btn.pack(side="right", padx=(0, 6))

        settings_btn = tk.Button(
            top_bar,
            text="S",
            command=self.open_settings_dialog,
            bg="#202944",
            fg="#D9DEEE",
            activebackground="#2C395C",
            activeforeground="#FFFFFF",
            relief="flat",
            font=("Segoe UI", 11, "bold"),
            padx=10,
            pady=2,
            cursor="hand2",
        )
        settings_btn.pack(side="right", padx=(0, 6))

        for drag_widget in (top_bar, hotkey_hint):
            drag_widget.bind("<ButtonPress-1>", self.start_drag)
            drag_widget.bind("<B1-Motion>", self.on_drag)

        self.main_time_label = tk.Label(
            outer,
            text="--:--",
            fg="#F2F5FF",
            bg="#070B1A",
            font=("Segoe UI", 66, "bold"),
        )
        self.main_time_label.pack(anchor="center", pady=(0, 2))

        self.main_date_label = tk.Label(
            outer,
            text="",
            fg="#BEC4D6",
            bg="#070B1A",
            font=("Segoe UI", 14),
        )
        self.main_date_label.pack(anchor="center", pady=(0, 10))

        slider_card = tk.Frame(outer, bg="#2A2A2E")
        slider_card.pack(fill="x", pady=(2, 8))
        slider_card.configure(highlightthickness=0)

        slider_title = tk.Label(
            slider_card,
            text="Смещение по времени (0–24ч)",
            fg="#CED2DC",
            bg="#2A2A2E",
            font=("Segoe UI", 10),
        )
        slider_title.pack(anchor="w", padx=12, pady=(8, 2))

        self.offset_slider = tk.Scale(
            slider_card,
            from_=0,
            to=24,
            orient="horizontal",
            variable=self.offset_hours,
            showvalue=False,
            resolution=1,
            command=lambda _v: self.update_times(),
            troughcolor="#3A3A40",
            bg="#2A2A2E",
            fg="#DFE3EC",
            activebackground="#2F64FF",
            highlightthickness=0,
            sliderlength=24,
            length=450,
        )
        self.offset_slider.pack(fill="x", padx=8)
        self.offset_slider.bind("<ButtonPress-3>", self.start_right_slider_drag)
        self.offset_slider.bind("<B3-Motion>", self.on_right_slider_drag)
        self.offset_slider.bind("<ButtonRelease-3>", self.stop_right_slider_drag)

        marks = tk.Frame(slider_card, bg="#2A2A2E")
        marks.pack(fill="x", padx=16, pady=(0, 8))
        for label in ["00", "06", "12", "18", "24"]:
            mark = tk.Label(
                marks,
                text=label,
                fg="#9FA5B5",
                bg="#2A2A2E",
                font=("Segoe UI", 10),
            )
            mark.pack(side="left", expand=True)

        header_row = tk.Frame(outer, bg="#070B1A")
        header_row.pack(fill="x", pady=(4, 4))

        cities_label = tk.Label(
            header_row,
            text="Города",
            fg="#DFE3EC",
            bg="#070B1A",
            font=("Segoe UI", 18, "bold"),
        )
        cities_label.pack(side="left")

        add_btn = tk.Button(
            header_row,
            text="+",
            command=self.open_add_city_dialog,
            bg="#6B3F71",
            fg="#FFFFFF",
            activebackground="#8B4E95",
            activeforeground="#FFFFFF",
            relief="flat",
            font=("Segoe UI", 16, "bold"),
            width=3,
            cursor="hand2",
        )
        add_btn.pack(side="right")

        footer = tk.Frame(outer, bg="#070B1A")
        footer.pack(side="bottom", fill="x", pady=(4, 0))

        version_label = tk.Label(
            footer,
            text=APP_VERSION,
            fg="#9EA7BE",
            bg="#070B1A",
            font=("Segoe UI", 9),
        )
        version_label.pack(side="right")

        self.cards_frame = tk.Frame(outer, bg="#070B1A")
        self.cards_frame.pack(fill="both", expand=True)

    # Figma implementation. Kept as the last definition so the desktop logic
    # above stays intact while the rendered view follows node 1906:14898.
    def _build_layout(self):
        self._images: list[object] = []
        language = self.settings.get("language", "ru")
        chrome = tk.Canvas(self, bg=TRANSPARENT_KEY, highlightthickness=0, bd=0)
        chrome.pack(fill="both", expand=True)
        self.main_chrome = chrome
        _rounded_polygon(chrome, 1, 1, 399, 749, 20, fill=BG, outline=BORDER, width=1, tags="main_shape")

        outer = tk.Frame(chrome, bg=BG, width=364, height=714)
        outer.pack_propagate(False)
        self.main_outer = outer
        self.main_outer_window = chrome.create_window(18, 18, anchor="nw", width=364, height=714, window=outer)
        chrome.bind("<Configure>", self._redraw_main_chrome)

        header = tk.Frame(outer, bg=BG, height=40)
        header.pack(fill="x")
        header.pack_propagate(False)
        header.grid_columnconfigure(1, weight=1)
        settings_btn = IconButton(header, "settings", self.open_settings_dialog, size=32, icon_size=16)
        settings_btn.grid(row=0, column=0, pady=4, sticky="w")
        title = tk.Label(header, text=tr("world_time", language), bg=BG, fg=TEXT, font=ui_font(18, "bold"))
        title.grid(row=0, column=1, sticky="nsew")
        hide_btn = IconButton(header, "chevron-right", self.hide_overlay, size=32, icon_size=16)
        hide_btn.grid(row=0, column=2, pady=4, sticky="e")
        for drag_widget in (header, title):
            drag_widget.bind("<ButtonPress-1>", self.start_drag)
            drag_widget.bind("<B1-Motion>", self.on_drag)
            drag_widget.bind("<ButtonRelease-1>", self.finish_geometry_change)

        hero = RoundedPanel(outer, height=150, fill=SURFACE, outline=BORDER, radius=16)
        hero.pack(fill="x", pady=(16, 0))
        hero.content.pack_propagate(False)
        self.main_time_label = tk.Label(hero.content, text="--:--", fg=TEXT, bg=SURFACE, font=ui_font(60, "bold"))
        self.main_time_label.place(relx=0.5, y=4, anchor="n")
        self.top_city_label = tk.Label(hero.content, text="", fg=TEXT, bg=SURFACE, font=ui_font(14, "bold"))
        self.top_city_label.place(relx=0.5, y=88, anchor="n")
        self.main_date_label = tk.Label(hero.content, text="", fg=MUTED, bg=SURFACE, font=ui_font(13, "bold"))
        self.main_date_label.place(relx=0.5, y=112, anchor="n")

        self.offset_slider = TimeSlider(outer, self.offset_hours, self.update_times)
        self.offset_slider.pack(fill="x", pady=(16, 0))

        city_header = tk.Frame(outer, bg=BG, height=17)
        city_header.pack(fill="x", pady=(16, 10))
        city_header.pack_propagate(False)
        tk.Label(city_header, text=tr("cities", language), bg=BG, fg=MUTED, font=ui_font(15, "bold"), anchor="w").pack(fill="both")

        self.cards_canvas = tk.Canvas(outer, bg=BG, highlightthickness=0, bd=0)
        self.cards_canvas.pack(fill="both", expand=True)
        self.cards_content = tk.Frame(self.cards_canvas, bg=BG)
        self.cards_window = self.cards_canvas.create_window(0, 0, anchor="nw", window=self.cards_content)
        self.cards_content.bind("<Configure>", lambda _e: self.cards_canvas.configure(scrollregion=self.cards_canvas.bbox("all")))
        self.cards_canvas.bind("<Configure>", lambda e: self.cards_canvas.itemconfigure(self.cards_window, width=e.width))
        self.cards_canvas.bind("<MouseWheel>", lambda e: self.cards_canvas.yview_scroll(int(-e.delta / 120), "units"))
        self.cards_frame = tk.Frame(self.cards_content, bg=BG)
        self.cards_frame.pack(fill="x")

        self.add_city_panel = RoundedPanel(self.cards_content, height=48, fill=BG, outline=BORDER, radius=12, dashed=True)
        self.add_city_panel.pack(fill="x", pady=(10, 0))
        add_content = tk.Frame(self.add_city_panel.content, bg=BG, cursor="hand2")
        add_content.pack(expand=True)
        icon_label = tk.Label(add_content, bg=BG)
        source = tinted_icon("plus", 16)
        if source is not None and ImageTk is not None:
            photo = ImageTk.PhotoImage(source)
            self._images.append(photo)
            icon_label.configure(image=photo)
        icon_label.pack(side="left")
        add_label = tk.Label(add_content, text=tr("add_city", language), bg=BG, fg=MUTED, font=ui_font(15, "bold"), cursor="hand2")
        add_label.pack(side="left", padx=(10, 0))
        for widget in (self.add_city_panel, self.add_city_panel.content, add_content, icon_label, add_label):
            widget.bind("<Button-1>", lambda _e: self.open_add_city_dialog())
        self._bind_panel_hover(
            self.add_city_panel,
            (self.add_city_panel, self.add_city_panel.content, add_content, icon_label, add_label),
            lambda active: add_label.configure(fg=ACCENT if active else MUTED),
        )

        tk.Frame(outer, bg=BG, height=18).pack(fill="x")
        version = tk.Label(outer, text=APP_VERSION, bg=BG, fg=MUTED, font=ui_font(10), anchor="w")
        version.place(relx=0, rely=1, y=-1, anchor="sw")

        self.resize_handle = tk.Canvas(outer, width=24, height=24, bg=BG, highlightthickness=0, bd=0, cursor="size_nw_se")
        self.resize_handle.place(relx=1, rely=1, anchor="se")
        for offset in (6, 11, 16):
            self.resize_handle.create_line(offset, 21, 21, offset, fill=MUTED, width=1)
        self.resize_handle.bind("<ButtonPress-1>", self.start_resize)
        self.resize_handle.bind("<B1-Motion>", self.on_resize)
        self.resize_handle.bind("<ButtonRelease-1>", self.finish_geometry_change)

    def _redraw_main_chrome(self, event):
        width = max(400, event.width)
        height = max(750, event.height)
        self.main_chrome.delete("main_shape")
        _rounded_polygon(self.main_chrome, 1, 1, width - 1, height - 1, 20, fill=BG, outline=BORDER, width=1, tags="main_shape")
        self.main_chrome.tag_lower("main_shape")
        self.main_chrome.itemconfigure(self.main_outer_window, width=width - 36, height=height - 36)

    def _bind_panel_hover(self, panel: RoundedPanel, widgets, on_change=None):
        def set_hover(active: bool):
            panel.set_outline(ACCENT if active else BORDER)
            if on_change:
                on_change(active)

        def leave_later(_event=None):
            def check():
                px, py = self.winfo_pointerx(), self.winfo_pointery()
                inside = (
                    panel.winfo_rootx() <= px < panel.winfo_rootx() + panel.winfo_width()
                    and panel.winfo_rooty() <= py < panel.winfo_rooty() + panel.winfo_height()
                )
                if not inside:
                    set_hover(False)
            self.after_idle(check)

        for widget in widgets:
            widget.bind("<Enter>", lambda _e: set_hover(True), add="+")
            widget.bind("<Leave>", leave_later, add="+")

    def start_resize(self, event):
        self._resize_start_x = event.x_root
        self._resize_start_y = event.y_root
        self._resize_start_width = self.winfo_width()
        self._resize_start_height = self.winfo_height()

    def on_resize(self, event):
        width = max(400, self._resize_start_width + event.x_root - self._resize_start_x)
        height = max(750, self._resize_start_height + event.y_root - self._resize_start_y)
        self.overlay_target.update({"width": width, "height": height})
        self.geometry(self._format_geometry(width, height, self.winfo_x(), self.winfo_y()))

    def finish_geometry_change(self, _event=None):
        self._capture_window_geometry()
        self.save_config()

    def start_right_slider_drag(self, event):
        self.force_hour_rounding = True
        self._set_slider_by_mouse(event)
        return "break"

    def on_right_slider_drag(self, event):
        self._set_slider_by_mouse(event)
        return "break"

    def stop_right_slider_drag(self, _event):
        self.force_hour_rounding = False
        self.update_times()
        return "break"

    def _set_slider_by_mouse(self, event):
        width = max(1, self.offset_slider.winfo_width())
        relative = min(1.0, max(0.0, event.x / width))
        value = int(round(relative * 24))
        self.offset_hours.set(value)
        self.update_times()

    def start_background_services(self):
        self.hotkey_listener = GlobalHotkeyListener(lambda: self.after(0, self.toggle_overlay))
        self.hotkey_listener.start()

        if pystray is None or Image is None or ImageDraw is None:
            messagebox.showwarning(
                "Трей недоступен",
                "Для иконки в трее установите зависимости: pip install pystray pillow",
            )
            return

        tray_menu = pystray.Menu(
            pystray.MenuItem(
                "Открыть/скрыть (Alt+Shift+T)",
                lambda _icon, _item: self.after(0, self.toggle_overlay),
            ),
            pystray.MenuItem(
                "Выход",
                lambda _icon, _item: self.after(0, self.quit_app),
            ),
        )

        self.tray_icon = pystray.Icon(
            "world_clock_widget",
            self._create_tray_image(),
            APP_TITLE,
            tray_menu,
        )

        threading.Thread(target=self.tray_icon.run, daemon=True).start()

    def _create_tray_image(self):
        image = Image.new("RGBA", (64, 64), (10, 13, 25, 255))
        draw = ImageDraw.Draw(image)
        draw.rounded_rectangle((8, 8, 56, 56), radius=12, fill=(22, 28, 43, 255))
        draw.ellipse((16, 16, 48, 48), fill=(47, 100, 255, 255))
        draw.ellipse((25, 25, 39, 39), fill=(22, 28, 43, 255))
        draw.line((32, 24, 32, 32), fill=(240, 244, 255, 255), width=2)
        draw.line((32, 32, 40, 32), fill=(240, 244, 255, 255), width=2)
        return image

    def start_drag(self, event):
        self._drag_x = event.x_root - self.winfo_x()
        self._drag_y = event.y_root - self.winfo_y()

    def on_drag(self, event):
        x = event.x_root - self._drag_x
        y = event.y_root - self._drag_y
        self.overlay_target["x"] = x
        self.overlay_target["y"] = y
        self.geometry(self._format_geometry(self.overlay_target["width"], self.overlay_target["height"], x, y))

    def _capture_window_geometry(self):
        self.update_idletasks()
        self.overlay_target.update(
            {
                "width": max(400, self.winfo_width()),
                "height": max(750, self.winfo_height()),
                "x": self.winfo_x(),
                "y": self.winfo_y(),
            }
        )

    def _ensure_target_within_screen(self):
        screen_w = self.winfo_screenwidth()
        screen_h = self.winfo_screenheight()
        width = self.overlay_target["width"]
        height = self.overlay_target["height"]

        max_x = max(10, screen_w - width - 10)
        max_y = max(10, screen_h - height - 10)
        self.overlay_target["x"] = min(max(10, self.overlay_target["x"]), max_x)
        self.overlay_target["y"] = min(max(10, self.overlay_target["y"]), max_y)

    def _animate_overlay_in(self):
        self._ensure_target_within_screen()
        width = self.overlay_target["width"]
        height = self.overlay_target["height"]
        target_x = self.overlay_target["x"]
        target_y = self.overlay_target["y"]
        screen_w = self.winfo_screenwidth()
        screen_h = self.winfo_screenheight()

        direction = self.settings.get("overlay_direction", DEFAULT_OVERLAY_DIRECTION)
        if direction == "left":
            start_x, start_y = -width, target_y
        elif direction == "top":
            start_x, start_y = target_x, -height
        elif direction == "bottom":
            start_x, start_y = target_x, screen_h
        else:
            start_x, start_y = screen_w, target_y

        self.geometry(self._format_geometry(width, height, int(start_x), int(start_y)))
        steps = 14
        interval_ms = 12

        if self._animation_after_id is not None:
            self.after_cancel(self._animation_after_id)
            self._animation_after_id = None

        def step(frame: int):
            progress = frame / steps
            x = round(start_x + (target_x - start_x) * progress)
            y = round(start_y + (target_y - start_y) * progress)
            self.geometry(self._format_geometry(width, height, x, y))
            if frame < steps:
                self._animation_after_id = self.after(interval_ms, lambda: step(frame + 1))
            else:
                self._animation_after_id = None
                self.lift()
                self.focus_force()

        step(0)

    def _animate_overlay_out(self):
        width = self.overlay_target["width"]
        height = self.overlay_target["height"]
        start_x = self.winfo_x()
        start_y = self.winfo_y()
        screen_w = self.winfo_screenwidth()
        screen_h = self.winfo_screenheight()

        direction = self.settings.get("overlay_direction", DEFAULT_OVERLAY_DIRECTION)
        if direction == "left":
            end_x, end_y = -width, start_y
        elif direction == "top":
            end_x, end_y = start_x, -height
        elif direction == "bottom":
            end_x, end_y = start_x, screen_h
        else:
            end_x, end_y = screen_w, start_y

        steps = 14
        interval_ms = 12

        def step(frame: int):
            progress = frame / steps
            eased = progress * progress * (3 - 2 * progress)
            x = round(start_x + (end_x - start_x) * eased)
            y = round(start_y + (end_y - start_y) * eased)
            self.geometry(self._format_geometry(width, height, x, y))
            if frame < steps:
                self._animation_after_id = self.after(interval_ms, lambda: step(frame + 1))
            else:
                self._animation_after_id = None
                self.withdraw()

        step(0)

    def toggle_overlay(self):
        if self.overlay_visible:
            self.hide_overlay()
        else:
            self.show_overlay()

    def show_overlay(self):
        self.overlay_visible = True
        self.deiconify()
        self.overrideredirect(True)
        self.attributes("-topmost", True)
        self._animate_overlay_in()

    def hide_overlay(self, animated: bool = True):
        if self._animation_after_id is not None:
            self.after_cancel(self._animation_after_id)
            self._animation_after_id = None

        if self.overlay_visible:
            self._capture_window_geometry()
            self.save_config()
        self.overlay_visible = False
        if animated and self.winfo_viewable():
            self._animate_overlay_out()
        else:
            self.withdraw()

    def quit_app(self):
        if self.hotkey_listener is not None:
            self.hotkey_listener.stop()

        if self.tray_icon is not None:
            self.tray_icon.stop()

        self.destroy()

    def open_add_city_dialog(self):
        language = self.settings.get("language", "ru")
        FigmaAddCityDialog(
            self,
            self.available_timezone_items,
            self.add_city,
            title=tr("add_city", language),
            language=language,
            favorite_timezones=self.favorite_timezones,
            on_favorite_add=self.add_favorite,
            on_favorite_remove=self.remove_favorite,
        )

    def open_city_selector(self, index: int):
        language = self.settings.get("language", "ru")
        FigmaAddCityDialog(
            self,
            self.available_timezone_items,
            lambda timezone_name: self._on_card_city_selected(index, timezone_name),
            title=tr("choose_city", language),
            language=language,
            favorite_timezones=self.favorite_timezones,
            on_favorite_add=self.add_favorite,
            on_favorite_remove=self.remove_favorite,
        )

    def _on_top_city_selected(self, parsed_value: str):
        if parsed_value == LOCAL_TIME_OPTION:
            self.settings["top_clock_mode"] = "auto"
        elif self._valid_city_key(parsed_value):
            self.settings["top_clock_mode"] = "manual"
            self.settings["manual_top_timezone"] = parsed_value
        self.save_config()
        self.update_times()

    def _sync_top_city_combo(self):
        if not hasattr(self, "top_city_dropdown"):
            return
        value = (
            LOCAL_TIME_OPTION
            if self.settings.get("top_clock_mode") == "auto"
            else self._city_option_for_timezone(self.settings.get("manual_top_timezone", "Etc/UTC"))
        )
        self.top_city_dropdown.set(value)

    def _on_card_city_selected(self, index: int, parsed_value: str):
        if self._valid_city_key(parsed_value) and 0 <= index < len(self.city_timezones):
            self.city_timezones[index] = parsed_value
            self.save_config()
            self.render_city_cards()

    def open_settings_dialog(self):
        FigmaSettingsDialog(
            self,
            self.settings.copy(),
            self.available_timezone_items,
            self.city_timezones,
            self.apply_settings,
            favorite_timezones=self.favorite_timezones,
            on_favorite_add=self.add_favorite,
            on_favorite_remove=self.remove_favorite,
        )

    def add_favorite(self, city_key: str):
        if city_key not in self.favorite_timezones:
            self.favorite_timezones.append(city_key)
            self.save_config()

    def remove_favorite(self, tz_name: str):
        self.favorite_timezones = [tz for tz in self.favorite_timezones if tz != tz_name]
        self.save_config()

    def apply_settings(self, updated: dict):
        mode = updated.get("top_clock_mode", self.settings.get("top_clock_mode", "auto"))
        manual_tz = updated.get("manual_top_timezone", self.settings["manual_top_timezone"])
        direction = updated.get("overlay_direction", self.settings["overlay_direction"])
        base_timezone = updated.get("base_timezone", self.settings.get("base_timezone", ""))
        theme = updated.get("theme", self.settings.get("theme", "dark"))
        language = updated.get("language", self.settings.get("language", "ru"))

        if mode not in {"auto", "manual"}:
            mode = "auto"
        if not self._valid_city_key(manual_tz):
            manual_tz = self.settings["manual_top_timezone"]
        if direction not in OVERLAY_DIRECTIONS:
            direction = DEFAULT_OVERLAY_DIRECTION
        if theme not in THEMES:
            theme = "dark"
        if language not in STRINGS:
            language = "ru"
        if self._valid_city_key(base_timezone):
            mode = "manual"
            manual_tz = base_timezone
        else:
            base_timezone = ""
            mode = "auto"

        self.settings.update(
            {
                "top_clock_mode": mode,
                "manual_top_timezone": manual_tz,
                "overlay_direction": direction,
                "time_format": "24",
                "base_timezone": base_timezone,
                "theme": theme,
                "language": language,
            }
        )
        set_theme(theme)
        for child in self.winfo_children():
            if not isinstance(child, tk.Toplevel):
                child.destroy()
        self.configure(bg=TRANSPARENT_KEY)
        self._build_layout()
        self.save_config()
        self.render_city_cards()

    def _max_supported_cities(self) -> int:
        return len(self.available_timezone_items)

    def add_city(self, tz_name: str):
        if tz_name in self.city_timezones:
            return False

        if len(self.city_timezones) + 1 > self._max_supported_cities():
            messagebox.showwarning(
                "Лимит городов",
                "Чтобы все часы помещались без прокрутки, достигнут лимит для вашего экрана.",
            )
            return False

        self.city_timezones.append(tz_name)
        self.render_city_cards()
        self.save_config()
        return True

    def remove_city(self, tz_name: str):
        self.city_timezones = [tz for tz in self.city_timezones if tz != tz_name]
        self.render_city_cards()
        self.save_config()

    def _city_card_style(self, city_count: int, idx: int) -> dict:
        if city_count <= 3:
            return {
                "pad_y": 10,
                "city_font": 20 if idx == 0 else 17,
                "meta_font": 13,
                "time_font": 38 if idx == 0 else 30,
            }
        if city_count <= 6:
            return {
                "pad_y": 8,
                "city_font": 16 if idx == 0 else 14,
                "meta_font": 12,
                "time_font": 28 if idx == 0 else 23,
            }
        return {
            "pad_y": 6,
            "city_font": 14 if idx == 0 else 12,
            "meta_font": 11,
            "time_font": 23 if idx == 0 else 19,
        }

    def _resize_overlay_for_city_count(self, city_count: int):
        card_height_guess = 112 if city_count <= 3 else 90 if city_count <= 6 else 76
        desired_height = 340 + city_count * card_height_guess
        max_height = self.winfo_screenheight() - 30
        desired_height = max(560, min(max_height, desired_height))

        self.overlay_target["height"] = desired_height

        self._ensure_target_within_screen()
        if self.overlay_visible:
            self.geometry(
                self._format_geometry(
                    self.overlay_target["width"],
                    self.overlay_target["height"],
                    self.overlay_target["x"],
                    self.overlay_target["y"],
                )
            )

    def render_city_cards(self):
        for animation_id in self._card_animation_ids.values():
            try:
                self.after_cancel(animation_id)
            except tk.TclError:
                pass
        self._card_animation_ids.clear()
        self._drag_panel = None
        for child in self.cards_frame.winfo_children():
            child.destroy()
        self.card_widgets.clear()

        city_count = len(self.city_timezones)
        self._resize_overlay_for_city_count(city_count)

        for idx, tz_name in enumerate(self.city_timezones):
            style = self._city_card_style(city_count, idx)

            card = tk.Frame(self.cards_frame, bg="#141A2B", padx=14, pady=style["pad_y"])
            card.pack(fill="x", pady=4)

            left = tk.Frame(card, bg="#141A2B")
            left.pack(side="left", fill="both", expand=True)

            city_combo = self._create_city_dropdown(
                left,
                initial_value="",
                on_commit=lambda value, card_index=idx: self._on_card_city_selected(card_index, value),
                include_local=False,
                font=("Segoe UI", max(10, style["city_font"] - 2)),
            )
            city_combo.pack(anchor="w", fill="x")
            initial_city = self._city_option_for_timezone(tz_name)
            city_combo.set(initial_city)

            offset_label = tk.Label(
                left,
                text="",
                fg="#AFB5C7",
                bg="#141A2B",
                font=("Segoe UI", style["meta_font"]),
            )
            offset_label.pack(anchor="w", pady=(2, 0))

            right = tk.Frame(card, bg="#141A2B")
            right.pack(side="right", fill="y")

            time_label = tk.Label(
                right,
                text="--:--",
                fg="#F3F5FF",
                bg="#141A2B",
                font=("Segoe UI", style["time_font"], "bold"),
            )
            time_label.pack(anchor="e")

            remove_btn = tk.Button(
                right,
                text="x",
                command=lambda name=tz_name: self.remove_city(name),
                bg="#202944",
                fg="#D9DEEE",
                activebackground="#2C395C",
                activeforeground="#FFFFFF",
                relief="flat",
                font=("Segoe UI", 9, "bold"),
                padx=6,
                pady=1,
                cursor="hand2",
            )
            remove_btn.pack(anchor="e", pady=(3, 0))

            self.card_widgets.append((city_combo, offset_label, time_label, card))

        self.update_times()

    def render_city_cards(self):
        for child in self.cards_frame.winfo_children():
            child.destroy()
        self.card_widgets.clear()

        city_count = len(self.city_timezones)
        card_height = 72 if city_count <= 3 else 66
        card_padding = 12 if city_count <= 3 else 10
        self._card_height = card_height
        self._card_slot = card_height + 10
        self.cards_frame.configure(height=max(1, city_count * self._card_slot))
        self.cards_frame.pack_propagate(False)

        for idx, tz_name in enumerate(self.city_timezones):
            panel = RoundedPanel(
                self.cards_frame,
                height=card_height,
                fill=SURFACE,
                outline=BORDER,
                radius=12,
                padding=card_padding,
            )
            panel.place(x=0, y=idx * self._card_slot, relwidth=1, height=card_height)

            left = tk.Frame(panel.content, bg=SURFACE, cursor="hand2")
            left.pack(side="left", fill="both", expand=True)
            city_row = tk.Frame(left, bg=SURFACE, cursor="hand2")
            city_row.pack(anchor="w")
            city, region = FigmaAddCityDialog._split_label(display_timezone_label(tz_name, self.settings.get("language", "ru")))
            city_label = tk.Label(city_row, text=city, bg=SURFACE, fg=TEXT, font=ui_font(16, "bold"), cursor="hand2")
            city_label.pack(side="left")
            region_label = tk.Label(city_row, text=region, bg=SURFACE, fg=MUTED, font=ui_font(13), cursor="hand2")
            region_label.pack(side="left", padx=(6, 0), pady=(2, 0))

            offset_label = tk.Label(left, text="", bg=SURFACE, fg=MUTED, font=ui_font(13), anchor="w")
            offset_label.pack(anchor="w", pady=(5, 0))

            actions = tk.Frame(panel.content, bg=SURFACE)
            actions.pack(side="right", fill="y")
            time_label = tk.Label(actions, text="--:--", bg=SURFACE, fg=TEXT, font=ui_font(20, "bold"))
            time_label.pack(side="left", fill="y")
            remove = IconButton(actions, "close", lambda zone=tz_name: self.remove_city(zone), size=24, icon_size=16, filled=False)
            remove.pack(side="left", padx=(8, 0))

            selectable = (panel, panel.content, left, city_row, city_label, region_label, offset_label, actions, time_label)
            for widget in selectable:
                widget.bind("<ButtonPress-1>", lambda event, card=panel: self._start_city_drag(event, card))
                widget.bind("<B1-Motion>", lambda event, card=panel: self._move_city_drag(event, card))
                widget.bind("<ButtonRelease-1>", lambda event, card=panel: self._finish_city_drag(event, card))
                widget.configure(cursor="fleur")
            self._bind_panel_hover(panel, (*selectable, remove))

            self.card_widgets.append((left, offset_label, time_label, panel))

        self.update_times()

    def _card_index(self, panel) -> int:
        return next((index for index, record in enumerate(self.card_widgets) if record[3] is panel), -1)

    def _start_city_drag(self, event, panel):
        animation_id = self._card_animation_ids.pop(panel, None)
        if animation_id:
            self.after_cancel(animation_id)
        self._drag_panel = panel
        self._drag_start_root_y = event.y_root
        self._drag_start_y = panel.winfo_y()
        self._drag_moved = False
        panel.tk.call("raise", panel._w)
        panel.set_outline(ACCENT)

    def _move_city_drag(self, event, panel):
        if self._drag_panel is not panel:
            return
        delta = event.y_root - self._drag_start_root_y
        if abs(delta) >= 4:
            self._drag_moved = True
        max_y = max(0, (len(self.card_widgets) - 1) * self._card_slot)
        y = min(max(0, self._drag_start_y + delta), max_y)
        panel.place_configure(y=y)
        current = self._card_index(panel)
        target = min(len(self.card_widgets) - 1, max(0, int((y + self._card_height / 2) // self._card_slot)))
        if target == current or current < 0:
            return
        record = self.card_widgets.pop(current)
        zone = self.city_timezones.pop(current)
        self.card_widgets.insert(target, record)
        self.city_timezones.insert(target, zone)
        for index, other in enumerate(self.card_widgets):
            if other[3] is not panel:
                self._animate_card_to(other[3], index * self._card_slot)

    def _finish_city_drag(self, _event, panel):
        if self._drag_panel is not panel:
            return
        index = self._card_index(panel)
        moved = self._drag_moved
        self._drag_panel = None
        self._drag_moved = False
        if index >= 0:
            self._animate_card_to(panel, index * self._card_slot)
        if moved:
            self.save_config()
        elif index >= 0:
            self.open_city_selector(index)

    def _animate_card_to(self, panel, target_y: int):
        previous = self._card_animation_ids.pop(panel, None)
        if previous:
            try:
                self.after_cancel(previous)
            except tk.TclError:
                pass
        start_y = panel.winfo_y()
        steps = 8

        def step(number=1):
            if not panel.winfo_exists() or panel is self._drag_panel:
                self._card_animation_ids.pop(panel, None)
                return
            progress = number / steps
            eased = 1 - (1 - progress) ** 3
            panel.place_configure(y=round(start_y + (target_y - start_y) * eased))
            if number < steps:
                self._card_animation_ids[panel] = self.after(15, lambda: step(number + 1))
            else:
                self._card_animation_ids.pop(panel, None)

        step()

    def get_top_clock_time(self) -> datetime:
        if self.settings.get("top_clock_mode") == "manual":
            zone = self._resolve_zone(self.settings.get("manual_top_timezone", "Etc/UTC"))
            return datetime.now(zone)
        return datetime.now().astimezone()

    def get_reference_time(self) -> datetime:
        now_ref = self.get_top_clock_time()
        if self.force_hour_rounding or self.offset_hours.get() != 0:
            now_ref = now_ref.replace(minute=0, second=0, microsecond=0)
        adjusted_ref = now_ref + timedelta(hours=self.offset_hours.get())
        return adjusted_ref

    def update_times(self):
        top_time = self.get_top_clock_time()
        if self.force_hour_rounding or self.offset_hours.get() != 0:
            top_time = top_time.replace(minute=0, second=0, microsecond=0)
        top_time = top_time + timedelta(hours=self.offset_hours.get())
        display_format = "%H:%M"
        def format_clock(value: datetime) -> str:
            return value.strftime(display_format)

        self.main_time_label.config(text=format_clock(top_time))
        language = self.settings.get("language", "ru")
        if self.settings.get("top_clock_mode", "auto") == "manual":
            top_city, _region = FigmaAddCityDialog._split_label(
                display_timezone_label(self.settings.get("manual_top_timezone", "Etc/UTC"), language)
            )
        else:
            top_city = tr("system_city", language)
        self.top_city_label.config(text=top_city)
        if language == "en":
            weekdays = ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")
            months = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")
        else:
            weekdays = ("Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс")
            months = ("янв.", "февр.", "мар.", "апр.", "мая", "июн.", "июл.", "авг.", "сент.", "окт.", "нояб.", "дек.")
        self.main_date_label.config(text=f"{weekdays[top_time.weekday()]}, {top_time.day} {months[top_time.month - 1]} {top_time.year}")

        ref_time = self.get_reference_time()
        ref_offset = ref_time.utcoffset() or timedelta(0)

        for idx, tz_name in enumerate(self.city_timezones):
            _city_label, offset_label, time_label, _card = self.card_widgets[idx]
            zone = self._resolve_zone(tz_name)
            city_time = ref_time.astimezone(zone)
            current_offset = city_time.utcoffset() or timedelta(0)
            delta = (current_offset - ref_offset).total_seconds()

            time_label.config(text=format_clock(city_time))

            offset_text = format_offset(delta) if language == "ru" else f"{int(delta // 3600):+d} h"
            offset_label.config(text=f"{offset_text} {tr('from_base', language)}")

    def tick(self):
        self.update_times()
        self.after(1000, self.tick)

    def load_config(self):
        data = {}
        if CONFIG_FILE.exists():
            try:
                data = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
            except Exception:
                data = {}

        settings_data = data.get("settings", {})
        top_mode = settings_data.get("top_clock_mode", "auto")
        manual_top_tz = settings_data.get("manual_top_timezone", self.settings["manual_top_timezone"])
        overlay_direction = settings_data.get("overlay_direction", DEFAULT_OVERLAY_DIRECTION)
        base_timezone = settings_data.get("base_timezone", "")
        theme = settings_data.get("theme", "dark")
        language = settings_data.get("language", "ru")

        if top_mode not in {"auto", "manual"}:
            top_mode = "auto"
        if not self._valid_city_key(manual_top_tz):
            manual_top_tz = self.settings["manual_top_timezone"]
        if overlay_direction not in OVERLAY_DIRECTIONS:
            overlay_direction = DEFAULT_OVERLAY_DIRECTION
        if theme not in THEMES:
            theme = "dark"
        if language not in STRINGS:
            language = "ru"

        self.settings.update(
            {
                "top_clock_mode": top_mode,
                "manual_top_timezone": manual_top_tz,
                "overlay_direction": overlay_direction,
                "time_format": "24",
                "base_timezone": base_timezone,
                "theme": theme,
                "language": language,
            }
        )

        has_saved_timezones = "timezones" in data
        tzs = data.get("timezones", [])
        normalized_tzs = []
        for tz in tzs:
            if tz == "UTC" and "Etc/UTC" in self.timezone_names:
                normalized_tzs.append("Etc/UTC")
            else:
                normalized_tzs.append(tz)
        valid = [tz for tz in normalized_tzs if self._valid_city_key(tz)]
        if has_saved_timezones:
            self.city_timezones = valid

        if not has_saved_timezones and not self.city_timezones:
            self.city_timezones = [tz for tz in DEFAULT_TIMEZONES if tz in self.timezone_names]

        if not has_saved_timezones and not self.city_timezones:
            if "Etc/UTC" in self.timezone_names:
                self.city_timezones = ["Etc/UTC"]
            elif "UTC" in self.timezone_names:
                self.city_timezones = ["UTC"]
            else:
                fallback = sorted(self.timezone_names)
                self.city_timezones = [fallback[0]] if fallback else ["Etc/UTC"]

        if "favorites" in data:
            self.favorite_timezones = [tz for tz in data.get("favorites", []) if self._valid_city_key(tz)]

        if top_mode == "manual" and self._valid_city_key(base_timezone):
            self.settings["manual_top_timezone"] = base_timezone
        elif top_mode == "auto":
            self.settings["base_timezone"] = ""

        window_data = data.get("window", {})
        try:
            width = max(400, int(window_data.get("width", self.overlay_target["width"])))
            height = max(750, int(window_data.get("height", self.overlay_target["height"])))
            width = min(width, self.winfo_screenwidth())
            height = min(height, self.winfo_screenheight())
            x = int(window_data.get("x", self.overlay_target["x"]))
            y = int(window_data.get("y", self.overlay_target["y"]))
            x = min(max(0, x), max(0, self.winfo_screenwidth() - width))
            y = min(max(0, y), max(0, self.winfo_screenheight() - height))
            self.overlay_target.update({"width": width, "height": height, "x": x, "y": y})
        except (TypeError, ValueError):
            pass

    def save_config(self):
        payload = {
            "timezones": self.city_timezones,
            "favorites": self.favorite_timezones,
            "settings": self.settings,
            "window": self.overlay_target,
        }
        CONFIG_FILE.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    register_bundled_font()
    app = WorldClockWidget()
    app.mainloop()

