"""Music and sound effects a creator uploads for a novel (MP3, OGG, WAV, M4A, WebM audio).

Audio can't be shrunk in the browser like pictures, so files over the plan's size are refused with a hint.
The server checks the real format from the file's first bytes. Files are served at <api origin>/audio?k=<key>
under a random key ("a" + hex), cached for a year. Story data uses the key in music/sfx steps.
"""
import base64
import re
import secrets

import anvil
import anvil.server
from anvil.tables import app_tables
import anvil.tables as tables

from . import common as C

KINDS = ("music", "sound")
KEY = re.compile(r"^a[0-9a-f]{12,40}$")


def sniff(b):
    """The audio type from a file's first bytes, or None."""
    if b[:3] == b"ID3" or (len(b) > 1 and b[0] == 0xFF and (b[1] & 0xE0) == 0xE0):
        return "audio/mpeg"
    if b[:4] == b"OggS":
        return "audio/ogg"
    if b[:4] == b"RIFF" and b[8:12] == b"WAVE":
        return "audio/wav"
    if b[4:8] == b"ftyp":
        return "audio/mp4"
    if b[:4] == b"\x1a\x45\xdf\xa3":
        return "audio/webm"
    return None


def sound_dict(r):
    return {"id": r.get_id(), "key": r["key"], "name": r["name"] or "", "kind": r["kind"] or "music",
            "seconds": r["seconds"] or 0, "bytes": r["bytes"], "created": C.iso(r["created"])}


def list_for(story):
    return [sound_dict(r) for r in app_tables.sounds.search(tables.order_by("created", ascending=False), story=story)]


@anvil.server.callable(require_user=True)
def upload_sound(story_id, data_url, name="", kind="music", seconds=0):
    me = C.require_user()
    story = C.row_by_id(app_tables.stories, story_id)
    if story is None or (story["owner"] != me and not C.is_admin(me)):
        return C.fail("That novel doesn't exist, or it isn't yours.")
    lim = C.limits(story["owner"])
    if len(app_tables.sounds.search(story=story)) >= lim["sounds"]:
        return C.fail("This novel has %d sound files, the most on the %s plan. Delete some first." % (lim["sounds"], lim["label"]))
    if C.rate_limited("upload_sound", 60, 3600):
        return C.fail("That's a lot of uploads in one hour. Please try again later.")
    m = re.match(r"^data:[^;,]*;base64,(.+)$", data_url or "", re.S) if isinstance(data_url, str) else None
    if not m:
        return C.fail("That file isn't a sound we can use (MP3, OGG, WAV or M4A).")
    try:
        raw = base64.b64decode(m.group(1), validate=False)
    except Exception:
        return C.fail("That file didn't arrive in one piece. Please try again.")
    mime = sniff(raw)
    if mime is None:
        return C.fail("That file isn't a sound we can use (MP3, OGG, WAV or M4A).")
    if len(raw) > lim["sound_kb"] * 1024:
        return C.fail("That file is %d KB; the %s plan allows %d KB per sound. Try a shorter clip or a lower-quality MP3."
                      % (len(raw) // 1024, lim["label"], lim["sound_kb"]))
    try:
        secs = max(0.0, min(3600.0, float(seconds or 0)))
    except (TypeError, ValueError):
        secs = 0.0
    key = "a" + secrets.token_hex(12)
    ext = {"audio/mpeg": "mp3", "audio/ogg": "ogg", "audio/wav": "wav", "audio/mp4": "m4a", "audio/webm": "webm"}[mime]
    r = app_tables.sounds.add_row(owner=story["owner"], story=story, key=key, name=C.text(name, 60) or "Sound",
                                  kind=kind if kind in KINDS else "music", media=anvil.BlobMedia(mime, raw, name="%s.%s" % (key, ext)),
                                  seconds=round(secs, 1), bytes=len(raw), created=C.now(), is_demo=False)
    return C.ok(sound=sound_dict(r))


@anvil.server.callable(require_user=True)
def update_sound(sound_id, name=None, kind=None):
    me = C.require_user()
    r = C.row_by_id(app_tables.sounds, sound_id)
    if r is None or (r["owner"] != me and not C.is_admin(me)):
        return C.fail("That sound doesn't exist, or it isn't yours.")
    if name is not None:
        r["name"] = C.text(name, 60) or "Sound"
    if kind in KINDS:
        r["kind"] = kind
    return C.ok(sound=sound_dict(r))


@anvil.server.callable(require_user=True)
def delete_sound(sound_id):
    me = C.require_user()
    r = C.row_by_id(app_tables.sounds, sound_id)
    if r is None:
        return C.ok()
    if r["owner"] != me and not C.is_admin(me):
        return C.fail("That sound isn't yours.")
    r.delete()
    return C.ok()


@anvil.server.http_endpoint("/audio")
def serve_sound(k=None, **kw):
    k = k or (anvil.server.request.query_params or {}).get("k")
    r = app_tables.sounds.get(key=k) if isinstance(k, str) and KEY.match(k) else None
    if r is None or r["media"] is None:
        return anvil.server.HttpResponse(404, "Not found", headers={"Content-Type": "text/plain"})
    return anvil.server.HttpResponse(200, r["media"], headers={"Content-Type": r["media"].content_type,
                                                               "Cache-Control": "public, max-age=31536000, immutable"})
