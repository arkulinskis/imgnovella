from anvil import *

from ._anvil_designer import EndingRowTemplate


class EndingRow(EndingRowTemplate):
    """Play page: one ending, its name once this reader found it (??? and the kind before that), and how readers split.
    item = {kind, title, kind_label, found, pct, total}."""

    def __init__(self, **properties):
        super().__init__(**properties)
        e = self.item
        self.row.classes["k-" + (e.get("kind") or "neutral")] = True
        self.title.text = e["title"] if e.get("found") else "??? (" + (e.get("kind_label") or "Ending") + ")"
        self.pct.text = "%d%% of readers" % e["pct"] if e.get("total") else ""
        self.bar.style["width"] = "%d%%" % e["pct"]
