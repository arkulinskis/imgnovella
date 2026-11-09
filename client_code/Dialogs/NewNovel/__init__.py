from anvil import *

from ._anvil_designer import NewNovelTemplate
from ... import state


class NewNovel(NewNovelTemplate):
    """Studio → New novel: a title, the starter story or a blank page, portrait or landscape.
    Closes with {"id", "template"} of the new novel, or None."""

    def __init__(self, **properties):
        super().__init__(**properties)
        state.set_control_attr(self.title_box, "maxlength", "80")

    @handle("cancel_button", "click")
    def cancel_button_click(self, **event_args):
        self.raise_event("x-close-alert", value=None)

    @handle("title_box", "pressed_enter")
    def title_box_pressed_enter(self, **event_args):
        self.create_button_click()

    @handle("create_button", "click")
    def create_button_click(self, **event_args):
        title = (self.title_box.text or "").strip()
        if len(title) < 2:
            state.toast("Please give your novel a title.", "error")
            return
        template = "starter" if self.starter_radio.selected else "blank"
        shape = "landscape" if self.landscape_radio.selected else "portrait"
        r = state.call("create_story", title, template, shape)
        if r:
            self.raise_event("x-close-alert", value={"id": r["story"]["id"], "template": template})
