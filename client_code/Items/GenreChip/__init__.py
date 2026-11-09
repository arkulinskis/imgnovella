from anvil import *

from ._anvil_designer import GenreChipTemplate
from ... import state


class GenreChip(GenreChipTemplate):
    """Discover: one genre filter chip (item = {name, count, on}); "All" has name None."""

    def __init__(self, **properties):
        super().__init__(**properties)
        g = self.item
        self.chip.text = g["label"] + ("  %d" % g["count"] if g.get("count") is not None else "")
        self.chip.role = ["dc-chip", "on"] if g.get("on") else ["dc-chip"]
        state.set_control_attr(self.chip, "aria-pressed", "true" if g.get("on") else "false")

    @handle("chip", "click")
    def chip_click(self, **event_args):
        self.parent.raise_event("x-genre", name=self.item.get("name"))
