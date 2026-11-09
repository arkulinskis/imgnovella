"""ImgNovella's JavaScript engines seen from Python.

    theme/assets/nv-runtime.js  window.NV: THE player (self-contained; exported games embed its source)
    theme/assets/nv-tools.js    window.NVT: built-in art, picture URLs, story checker, game packaging
    theme/assets/nv-editor.js   the editor screen (UI.page "edit") + window.ED
    theme/assets/nv-kit.js      the UI.* helpers the editor was written against (api, toast, confirm, modal ...)

Python reaches them only through this module:

    nv.setup()              once at start-up: the server bridge (UI.api in the engines), NVK.host, IMG_API
    nv.set_me(me)           keep UI.me (the editor reads the creator's name) in step with state.me()
    nv.img(key)             a picture key (demo:<name> or i<hex>) as a URL
    nv.js_value(x)          a Python dict/list as a real JS object (to hand to the engines)
    nv.py_value(x)          a JS object/array as plain Python dicts/lists
"""
import json
import re

import anvil
import anvil.js
from anvil import confirm
import anvil.server
from anvil.js import window

from . import router, state

NULL = anvil.js.call(window.Function("return null"))  # "no JS object yet", typed for the validator
_api: dict = {"origin": ""}


def py_value(x):
    """JS -> plain Python (dicts, lists, str, numbers). None stays None."""
    if x is None:
        return None
    return json.loads(window.JSON.stringify(x))


def js_value(x):
    """Python -> a real JS object (not a proxy of a Python dict)."""
    return window.JSON.parse(json.dumps(x))


def api_origin():
    return _api["origin"] or "/_/api"


def img(key):
    """Same as NVT.img: built-in art from the theme, uploaded pictures from the /img endpoint (server_code/Images.py)."""
    key = key or ""
    if key.startswith("demo:"):
        return "_/theme/demo-" + key[5:] + ".svg"
    if re.match(r"^i[0-9a-f]+$", key):
        return api_origin().rstrip("/") + "/img?k=" + key
    return ""


def has_title_art(key):
    """Built-in covers already show the title; anything else gets the title drawn over it."""
    return "cover" in (key or "")


# ---------------------------------------------------------------- server calls for the engines (UI.api)
def _bridge(kind, payload_json):
    """Called from JS. Always returns a JSON string: {"result": ...} or {"error": ...}."""
    p = json.loads(payload_json) if payload_json else {}
    try:
        if kind == "call":
            call = anvil.server.call_s if p.get("quiet") else anvil.server.call
            return json.dumps({"result": call(p["fn"], *(p.get("args") or []))})
        return json.dumps({"error": "Unknown request: %s" % kind})
    except Exception as e:
        kind_of = type(e).__name__  # (some of Anvil's exception classes aren't in the validator's stubs)
        if kind_of == "SessionExpiredError":
            return json.dumps({"error": "Your session expired. Reload the page and sign in again.", "reload": True})
        if kind_of == "AppOfflineError":
            return json.dumps({"error": "You seem to be offline. Check your connection and try again."})
        if kind_of == "PermissionDenied":
            return json.dumps({"error": str(e) or "You don't have access to that.", "denied": True})
        print("bridge %s %s failed: %r" % (kind, p.get("fn", ""), e))
        return json.dumps({"error": "Something went wrong. Please try again.", "detail": repr(e)[:300]})


# ---------------------------------------------------------------- NVK.host: what the editor asks Python to show
def _toast(message, kind=""):
    state.toast(message, kind or None)


def _confirm(options_json):
    o = json.loads(options_json or "{}")
    return bool(confirm(o.get("text") or "", title=o.get("title") or "Are you sure?",
                        buttons=[(o.get("cancel") or "Cancel", False), (o.get("ok") or "OK", True)], role="app-dialog"))


def _go(target_hash):
    router.show()


def set_me(me):
    window.UI.me = js_value(me) if me else None


def setup():
    window.NV_BRIDGE = _bridge
    try:
        _api["origin"] = str(anvil.server.get_api_origin())  # ends in /_/api; pictures are served at /img?k=KEY
    except Exception as e:
        print("api origin: %r" % e)
    window.IMG_API = api_origin()  # NVT.img reads it
    host = window.NVK.host
    for name, fn in (("toast", _toast), ("confirm", _confirm), ("go", _go)):
        host[name] = fn


def copy_text(text):
    """Copy to the clipboard (ED.copy shows the toast and falls back to a prompt)."""
    window.ED.copy(text)
