from anvil import *

from ._anvil_designer import NewNovelTemplate
from ... import state

HINTS = {
    "starter": 'The starter story is "Cherry Blossom Promise": 9 scenes, 3 endings, variables and a timed choice, '
               "so you learn by remixing.",
    "blank": "A blank page has one scene and a background.",
    "twine": "Bring a story you wrote in Twine and give it pictures, characters and music.",
}


class NewNovel(NewNovelTemplate):
    """Studio -> New novel: a title, the starter story, a blank page or an import from Twine (Twee text or a
    published Twine 2 .html, parsed by server_code/TwineImport.py), portrait or landscape.
    Closes with {"id", "template", "info"} of the new novel, or None."""

    def __init__(self, **properties):
        super().__init__(**properties)
        state.set_control_attr(self.title_box, "maxlength", "80")
        for rb in (self.starter_radio, self.blank_radio, self.twine_radio):
            rb.add_event_handler("clicked", self._mode)
        self._mode()

    def _template(self):
        if self.twine_radio.selected:
            return "twine"
        return "starter" if self.starter_radio.selected else "blank"

    def _mode(self, **event_args):
        t = self._template()
        self.twine_box.visible = t == "twine"
        self.tpl_hint.text = HINTS[t]
        self.create_button.text = "Import" if t == "twine" else "Create"

    @handle("twine_file", "change")
    def twine_file_change(self, file=None, **event_args):
        if not file:
            return
        try:
            self.twine_text.text = file.get_bytes().decode("utf-8", "replace")
            state.toast("Loaded %s" % (file.name or "your file"), "ok")
        except Exception:
            state.toast("We couldn't read that file. Try exporting it as Twee.", "error")
        self.twine_file.clear()

    @handle("cancel_button", "click")
    def cancel_button_click(self, **event_args):
        self.raise_event("x-close-alert", value=None)

    @handle("title_box", "pressed_enter")
    def title_box_pressed_enter(self, **event_args):
        self.create_button_click()

    @handle("create_button", "click")
    def create_button_click(self, **event_args):
        title = (self.title_box.text or "").strip()
        template = self._template()
        shape = "landscape" if self.landscape_radio.selected else "portrait"
        if template == "twine":
            text = self.twine_text.text or ""
            if not text.strip():
                state.toast("Paste your Twee text or choose a Twine file first.", "error")
                return
            r = state.call("import_twine", title, text, shape)
            if r:
                self.raise_event("x-close-alert", value={"id": r["story"]["id"], "template": template, "info": r.get("info") or {}})
            return
        if len(title) < 2:
            state.toast("Please give your novel a title.", "error")
            return
        r = state.call("create_story", title, template, shape)
        if r:
            self.raise_event("x-close-alert", value={"id": r["story"]["id"], "template": template})
