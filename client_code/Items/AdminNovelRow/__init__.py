from anvil import *

from ._anvil_designer import AdminNovelRowTemplate
from ... import router, state


class AdminNovelRow(AdminNovelRowTemplate):
    """Admin → Novels: one novel with Featured and Taken down switches (saved straight away)."""

    def __init__(self, **properties):
        super().__init__(**properties)
        c = self.item
        s = c.get("stats") or {}
        self.cover.story = c
        self.title.text = c["title"]
        self.demo_badge.visible = bool(c.get("demo"))
        n = c.get("reports") or 0
        self.reports_badge.text = state.plural(n, "report")
        self.reports_badge.visible = n > 0
        self.line.text = "by %s · %s · %d scenes · %d plays · ♥ %d" % (c["author"], c.get("status"), s.get("scenes") or 0,
                                                                      c.get("plays") or 0, c.get("likes") or 0)
        state.set_attr(self.open_link, "href", router.href("play", c["slug"]))
        self.open_link.visible = c.get("status") != "draft"
        self.featured_box.checked = bool(c.get("featured"))
        self.hidden_box.checked = bool(c.get("hidden"))

    def _save(self, field, box):
        if state.call("admin_set_story", self.item["id"], field, box.checked):
            state.toast("Saved", "ok")
        else:
            box.checked = not box.checked

    @handle("featured_box", "change")
    def featured_box_change(self, **event_args):
        self._save("featured", self.featured_box)

    @handle("hidden_box", "change")
    def hidden_box_change(self, **event_args):
        self._save("hidden", self.hidden_box)
