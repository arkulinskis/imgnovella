from anvil import *

from ._anvil_designer import StudioCardTemplate
from ... import router, state

STATUS = {"public": ("Public", ["badge", "badge-good"]), "unlisted": ("Unlisted", ["badge", "badge-mint"]),
          "draft": ("Draft", ["badge"])}


class StudioCard(StudioCardTemplate):
    """One of the creator's novels in the Studio: cover, status, numbers, Edit / Play / Duplicate / Delete.
    Duplicate and Delete go to the page (x-duplicate / x-delete events) so it can reload the list."""

    def __init__(self, **properties):
        super().__init__(**properties)
        c = self.item
        s = c.get("stats") or {}
        edit = router.href("edit", c["id"])
        state.set_attr(self.cover_link, "href", edit)
        state.set_attr(self.cover_link, "aria-label", "Edit " + c["title"])
        state.set_attr(self.edit_link, "href", edit)
        state.set_attr(self.play_link, "href", router.href("play", c["slug"]))
        self.play_link.visible = c.get("status") != "draft"
        self.cover.story = c
        label, role = STATUS.get(c.get("status") or "draft", STATUS["draft"])
        self.status_badge.text, self.status_badge.role = label, role
        self.changes_badge.visible = bool(c.get("changes"))
        self.genre_badge.text = c.get("genre") or ""
        self.genre_badge.visible = bool(c.get("genre"))
        self.title.text = c["title"]
        line = "%d scenes · %d endings · %s words" % (s.get("scenes") or 0, s.get("endings") or 0,
                                                     "{:,}".format(s.get("words") or 0))
        if c.get("status") != "draft":
            line += " · %s plays · ♥ %d" % ("{:,}".format(c.get("plays") or 0), c.get("likes") or 0)
        self.nums.text = line
        self.edited.text = "Edited " + state.ago(c.get("updated"))

    @handle("dup_button", "click")
    def dup_button_click(self, **event_args):
        self.parent.raise_event("x-duplicate", story=self.item)

    @handle("del_button", "click")
    def del_button_click(self, **event_args):
        self.parent.raise_event("x-delete", story=self.item)
