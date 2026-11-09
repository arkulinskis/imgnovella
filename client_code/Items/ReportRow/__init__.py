from anvil import *

from ._anvil_designer import ReportRowTemplate
from ... import router, state


class ReportRow(ReportRowTemplate):
    """Admin → Reports: a reader's report about a novel, with "Nothing wrong" and "Take the novel down"."""

    def __init__(self, **properties):
        super().__init__(**properties)
        r = self.item
        self.status.text = r["status"]
        self.status.role = ["badge", "badge-bad"] if r["status"] == "open" else ["badge"]
        self.by.text = r.get("by") or "Guest"
        self.when.text = state.short_date(r.get("created"))
        s = r.get("story")
        self.story_link.visible = bool(s)
        if s:
            state.set_attr(self.story_link, "href", router.href("play", s["slug"]))
            self.story_title.text = s["title"]
            self.story_line.text = " by " + s["author"] + (" (taken down)" if s.get("hidden") else "")
        else:
            self.story_line.text = "(novel deleted)"
        self.reason.text = r.get("reason") or ""
        self.actions.visible = r["status"] == "open"

    def _resolve(self, action):
        if state.call("resolve_report", self.item["id"], action):
            state.toast("Done", "ok")
            self.parent.raise_event("x-changed")

    @handle("dismiss_button", "click")
    def dismiss_button_click(self, **event_args):
        self._resolve("dismiss")

    @handle("hide_button", "click")
    def hide_button_click(self, **event_args):
        self._resolve("hide")
