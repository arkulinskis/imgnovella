from anvil import *

from ._anvil_designer import FeaturedCardTemplate
from ... import router, state


class FeaturedCard(FeaturedCardTemplate):
    """Discover's Featured shelf: a wide card with the cover, genre, title, blurb and numbers."""

    def __init__(self, **properties):
        super().__init__(**properties)
        c = self.item
        state.set_attr(self.link, "href", router.href("play", c["slug"]))
        self.cover.story = c
        self.genre.text = c.get("genre") or "Story"
        self.title.text = c["title"]
        self.blurb.text = c.get("blurb") or ""
        self.by.text = "by " + c["author"]
        self.plays.text = "{:,}".format(c.get("plays") or 0)
        self.endings.text = "%d endings" % ((c.get("stats") or {}).get("endings") or 0)
