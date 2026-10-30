"""Pictures for a novel: upload (the browser shrinks them first), rename, delete, and serve them.

The browser resizes every picture to fit the creator's plan (Free: 400 x 600 either way round) before it
uploads; the server checks again by reading the real width and height from the file itself (PNG, JPEG, WebP).
Pictures are served at <api origin>/img?k=<key> under a random key, cached for a year.
"""
import base64
import re
import secrets
import struct

import anvil
import anvil.server
from anvil.tables import app_tables

from . import common as C

KINDS = ("bg", "sprite", "cg", "cover", "other")
TYPES = {"image/png", "image/jpeg", "image/webp"}
KEY = re.compile(r"^i[0-9a-f]{12,40}$")


def image_size(b):
    """(mime, width, height) read from the file's header, or None if it isn't a PNG, JPEG or WebP."""
    try:
        if b[:8] == b"\x89PNG\r\n\x1a\n":
            w, h = struct.unpack(">II", b[16:24])
            return "image/png", w, h
        if b[:2] == b"\xff\xd8":
            i = 2
            while i + 9 < len(b):
                if b[i] != 0xFF:
                    i += 1
                    continue
                marker = b[i + 1]
                if marker in (0xD8, 0x01) or 0xD0 <= marker <= 0xD7:
                    i += 2
                    continue
                if 0xC0 <= marker <= 0xCF and marker not in (0xC4, 0xC8, 0xCC):
                    h, w = struct.unpack(">HH", b[i + 5:i + 9])
                    return "image/jpeg", w, h
                i += 2 + struct.unpack(">H", b[i + 2:i + 4])[0]
            return None
        if b[:4] == b"RIFF" and b[8:12] == b"WEBP":
            chunk = b[12:16]
            if chunk == b"VP8 ":
                w, h = struct.unpack("<HH", b[26:30])
                return "image/webp", w & 0x3FFF, h & 0x3FFF
            if chunk == b"VP8L":
                bits = int.from_bytes(b[21:25], "little")
                return "image/webp", (bits & 0x3FFF) + 1, ((bits >> 14) & 0x3FFF) + 1
            if chunk == b"VP8X":
                return "image/webp", 1 + int.from_bytes(b[24:27], "little"), 1 + int.from_bytes(b[27:30], "little")
    except (struct.error, IndexError):
        return None
    return None


def _image(r):
    return {"id": r.get_id(), "key": r["key"], "name": r["name"] or "", "kind": r["kind"] or "bg", "w": r["width"], "h": r["height"],
            "bytes": r["bytes"], "created": C.iso(r["created"])}


@anvil.server.callable(require_user=True)
def upload_image(story_id, data_url, name="", kind="bg"):
    me = C.require_user()
    story = C.row_by_id(app_tables.stories, story_id)
    if story is None or (story["owner"] != me and not C.is_admin(me)):
        return C.fail("That novel doesn't exist, or it isn't yours.")
    lim = C.limits(story["owner"])
    if len(app_tables.images.search(story=story)) >= lim["images"]:
        return C.fail("This novel has %d pictures, the most on the %s plan. Delete some first." % (lim["images"], lim["label"]))
    if C.rate_limited("upload", 120, 3600):
        return C.fail("That's a lot of uploads in one hour. Please try again later.")
    m = re.match(r"^data:(image/[a-z]+);base64,(.+)$", data_url or "", re.S) if isinstance(data_url, str) else None
    if not m:
        return C.fail("That file isn't a picture we can use (PNG, JPEG or WebP).")
    try:
        raw = base64.b64decode(m.group(2), validate=False)
    except Exception:
        return C.fail("That picture didn't arrive in one piece. Please try again.")
    info = image_size(raw)
    if info is None or info[0] not in TYPES:
        return C.fail("That file isn't a picture we can use (PNG, JPEG or WebP).")
    mime, w, h = info
    if len(raw) > lim["max_kb"] * 1024:
        return C.fail("That picture is %d KB; the %s plan allows %d KB." % (len(raw) // 1024, lim["label"], lim["max_kb"]))
    if max(w, h) > lim["long"] or min(w, h) > lim["short"]:
        return C.fail("That picture is %d x %d; the %s plan allows up to %d x %d." % (w, h, lim["label"], lim["short"], lim["long"]))
    key = "i" + secrets.token_hex(12)
    ext = mime.split("/")[1].replace("jpeg", "jpg")
    r = app_tables.images.add_row(owner=story["owner"], story=story, key=key, name=C.text(name, 60) or "Picture",
                                  kind=kind if kind in KINDS else "other",
                                  media=anvil.BlobMedia(mime, raw, name="%s.%s" % (key, ext)), width=w, height=h, bytes=len(raw),
                                  created=C.now(), is_demo=False)
    return C.ok(image=_image(r))


@anvil.server.callable(require_user=True)
def update_image(image_id, name=None, kind=None):
    me = C.require_user()
    r = C.row_by_id(app_tables.images, image_id)
    if r is None or (r["owner"] != me and not C.is_admin(me)):
        return C.fail("That picture doesn't exist, or it isn't yours.")
    if name is not None:
        r["name"] = C.text(name, 60) or "Picture"
    if kind is not None and kind in KINDS:
        r["kind"] = kind
    return C.ok(image=_image(r))


@anvil.server.callable(require_user=True)
def delete_image(image_id):
    me = C.require_user()
    r = C.row_by_id(app_tables.images, image_id)
    if r is None:
        return C.ok()
    if r["owner"] != me and not C.is_admin(me):
        return C.fail("That picture isn't yours.")
    r.delete()
    return C.ok()


@anvil.server.http_endpoint("/img")
def serve_image(k=None, **kw):
    k = k or (anvil.server.request.query_params or {}).get("k")
    r = app_tables.images.get(key=k) if isinstance(k, str) and KEY.match(k) else None
    if r is None or r["media"] is None:
        return anvil.server.HttpResponse(404, "Not found", headers={"Content-Type": "text/plain"})
    return anvil.server.HttpResponse(200, r["media"], headers={"Content-Type": r["media"].content_type,
                                                               "Cache-Control": "public, max-age=31536000, immutable"})
