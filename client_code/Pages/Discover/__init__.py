from anvil import *

from ._anvil_designer import DiscoverTemplate
from ... import router, state

SORTS = [("Popular", "popular"), ("Newest", "new"), ("Most liked", "liked")]


class Discover(DiscoverTemplate):
    """#discover[/<genre>]: the public library. Featured shelf, genre chips, search, sort (popular / new / most liked).
    Anyone can browse and play; the genre stays in the address (router.replace) without reopening the page."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        self.genre = args[0] if args else None
        self.sort_box.items = SORTS
        self.sort_box.selected_value = "popular"
        state.set_control_attr(self.sort_box, "aria-label", "Sort")
        state.set_control_attr(self.search_box, "aria-label", "Search novels")
        state.set_attr(self.cta_link, "href", "#studio" if state.me() else "#auth/signup")
        self.chips.add_event_handler("x-genre", self._pick_genre)
        self.load()

    def load(self):
        q = (self.search_box.text or "").strip()
        d = state.call("library", q or None, self.genre, self.sort_box.selected_value or "popular")
        if not d:
            return
        genres = [{"label": "All", "name": None, "count": None, "on": not self.genre}]
        genres += [{"label": g["name"], "name": g["name"], "count": g["count"], "on": g["name"] == self.genre}
                   for g in d.get("genres") or [] if g.get("count") or g["name"] == self.genre]
        self.chips.items = genres
        self.featured.items = d.get("featured") or []
        self.featured_box.visible = bool(d.get("featured"))
        self.list_title.text = self.genre or ("Results" if q else "All novels")
        self.total.text = str(d.get("total") or 0)
        self.grid.items = d.get("stories") or []
        self.empty.visible = not d.get("stories")

    def _pick_genre(self, name=None, **event_args):
        self.genre = name
        if name:
            router.replace("discover", name)
        else:
            router.replace("discover")
        self.load()

    @handle("sort_box", "change")
    def sort_box_change(self, **event_args):
        self.load()

    @handle("search_box", "pressed_enter")
    def search_box_pressed_enter(self, **event_args):
        self.load()

    @handle("search_button", "click")
    def search_button_click(self, **event_args):
        self.load()
