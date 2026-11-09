from anvil import *

from ._anvil_designer import ProTemplate
from ... import state


class Pro(ProTemplate):
    """#pro: Free vs Pro. Pro is switched on by an admin (Admin → Users); "Ask for Pro" sends a request to the admin
    feedback inbox (kind "pro"). Limits come from PLANS in server_code/common.py: keep the copy in step."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        me = state.me()
        is_pro = bool(me and me.get("plan") == "pro")
        self.free_guest.visible = self.pro_guest.visible = not me
        self.free_mine.visible = bool(me) and not is_pro
        self.pro_mine.visible = is_pro
        self.ask_box.visible = bool(me) and not is_pro
        self.sent_note.visible = False
        if me:
            self.ask_hint.text = ("Pro is in early access: we switch it on by hand and email you at %s."
                                  % (me.get("email") or ""))
            state.set_control_attr(self.msg_box, "aria-label", "Tell us about your project (optional)")

    @handle("ask_button", "click")
    def ask_button_click(self, **event_args):
        me = state.me()
        msg = "Pro request from %s (%s). %s" % (me.get("name"), me.get("email"), (self.msg_box.text or "").strip())
        if state.call("submit_feedback", "pro", msg, None, {"page": "#pro"}):
            self.ask_box.visible = False
            self.sent_note.visible = True
