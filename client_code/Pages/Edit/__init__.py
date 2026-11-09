from anvil import *

from ._anvil_designer import EditTemplate


class Edit(EditTemplate):
    """#edit/<id>/<tab>/<sceneId>: the novel editor (map, write, cast, pictures, sounds, variables, settings), one
    JavaScript engine (theme/assets/nv-editor.js) in Components/Screen. It autosaves through UI.api, keeps its tab
    and scene in the address with history.replaceState, and opens its own dialogs (picture picker, playtest,
    publish, Package & sell)."""

    waits = True  # router: the editor sets UI_READY itself once the novel has loaded

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        self.screen.mount(list(args))
