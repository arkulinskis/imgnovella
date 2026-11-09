from anvil import *

from ._anvil_designer import NovelCardTemplate
from ... import router, state


class NovelCard(NovelCardTemplate):
    """A published novel on a shelf (landing, Discover, "More by" on the play page): cover, title, creator, numbers."""

    def __init__(self, **properties):
        super().__init__(**properties)
        c = self.item
        s = c.get("stats") or {}
        state.set_attr(self.link, "href", router.href("play", c["slug"]))
        self.cover.story = c
        self.title.text = c["title"]
        self.by.text = "by " + c["author"] + (" · " + c["genre"] if c.get("genre") else "")
        self.plays.text = "{:,}".format(c.get("plays") or 0)
        self.likes.text = "{:,}".format(c.get("likes") or 0)
        self.endings.text = "%d endings" % (s.get("endings") or 0)
        self.minutes.text = "~%d min" % (s.get("minutes") or 1)
