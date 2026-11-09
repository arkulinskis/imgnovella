"""The app starts here (anvil.yaml: startup module). One server call to learn who is signed in (Anvil's loading
spinner shows meanwhile), the Privacy & Terms kit, then the page for the address in the browser bar."""
import anvil.server

from . import legal, nv, router, state

LEGAL_THEME = {"accent": "#cc1f63"}  # colours for the Privacy & Terms page (match --c-brand-text in app.css)

legal.setup(LEGAL_THEME)
nv.setup()  # the engines' server bridge and picture address (client_code/nv.py)
state.set_me(anvil.server.call("get_me"))
if state.me():
    legal.refresh_soon()
router.start()
