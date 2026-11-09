from anvil import *

from ._anvil_designer import UserRowTemplate
from ... import state


class UserRow(UserRowTemplate):
    """Admin → Users: one person with the Pro, Admin and Active switches (saved straight away)."""

    def __init__(self, **properties):
        super().__init__(**properties)
        self.joined.text = state.short_date(self.item.get("joined"))
        self.novels.text = state.plural(self.item.get("novels") or 0, "novel")
        self.pro_box.checked = self.item.get("plan") == "pro"

    def _save(self, fn, box, value):
        r = state.call(fn, self.item["id"], value)
        if r:
            state.toast("Saved", "ok")
        else:
            box.checked = not box.checked  # the server said no (e.g. your own admin switch): put it back

    @handle("pro_box", "change")
    def pro_box_change(self, **event_args):
        r = state.call("set_plan", self.item["id"], "pro" if self.pro_box.checked else "free")
        if r:
            state.toast("Pro switched on" if self.pro_box.checked else "Back to Free", "ok")
        else:
            self.pro_box.checked = not self.pro_box.checked

    @handle("admin_box", "change")
    def admin_box_change(self, **event_args):
        self._save("set_admin", self.admin_box, self.admin_box.checked)

    @handle("active_box", "change")
    def active_box_change(self, **event_args):
        self._save("set_enabled", self.active_box, self.active_box.checked)
