from anvil import *

from ._anvil_designer import ReportTemplate
from ... import state


class Report(ReportTemplate):
    """Play page → Report this novel: the reason goes to Admin → Reports."""

    def __init__(self, slug="", **properties):
        self.slug = slug
        super().__init__(**properties)

    @handle("cancel_button", "click")
    def cancel_button_click(self, **event_args):
        self.raise_event("x-close-alert", value=False)

    @handle("send_button", "click")
    def send_button_click(self, **event_args):
        reason = (self.reason_box.text or "").strip()
        if len(reason) < 5:
            state.toast("Please tell us a little more (at least 5 characters).", "error")
            return
        if state.call("report_story", self.slug, reason):
            state.toast("Thanks. We'll take a look.", "ok")
            self.raise_event("x-close-alert", value=True)
