"""Visual novels: the creator's studio (create, save, publish, duplicate, delete), the public library,
playing (published snapshot or the owner's draft), plays/endings stats, likes and reports.

A story's `data` is one JSON document (see clean_story for its exact shape). The editor saves the whole
document (autosave); `published` is a frozen copy made when the creator presses Publish, so players never
see half-finished edits. Text is stored raw: the browser always escapes it before showing it.
"""
import math
import re
import secrets

import anvil.server
from anvil.tables import app_tables
import anvil.tables as tables

from . import common as C
from . import DemoData

GENRES = ["Romance", "Mystery", "Fantasy", "Sci-fi", "Slice of life", "Comedy", "Drama", "Horror", "Adventure"]
RATINGS = ["Everyone", "Teen", "Mature"]
ENDING_KINDS = ["true", "good", "neutral", "bad", "secret"]
GAMES = ["timing", "tictactoe", "memory", "reaction", "find", "mash", "simon", "whack", "code", "rps"]
MAX_JSON = 900 * 1024
ID = re.compile(r"^[A-Za-z0-9_-]{1,40}$")
VAR = re.compile(r"^[A-Za-z_][A-Za-z0-9_]{0,31}$")
IMG = re.compile(r"^(demo:[a-z0-9-]{2,40}|i[0-9a-f]{12,40})$")
HEX = re.compile(r"^#[0-9a-fA-F]{6}$")

# step type -> {field: spec}. Spec: an int = max text length, or one of id / img / var / val / num / bool.
STEP_FIELDS = {
    "say": {"who": "id", "text": 2000, "pose": 40},
    "bg": {"img": "img", "fx": 20},
    "show": {"char": "id", "pose": 40, "pos": 20, "fx": 20},
    "hide": {"char": "id", "fx": 20},
    "set": {"var": "var", "op": 10, "val": "val"},
    "jump": {"to": "id"},
    "cg": {"img": "img"},
    "music": {"track": 30},
    "sfx": {"name": 30},
    "fx": {"name": 20},
    "wait": {"secs": "num"},
    "input": {"var": "var", "prompt": 200, "dflt": 60},
    "card": {"title": 120, "sub": 200},
    # a mini-game: which game, difficulty 0-2, its three colours, where winning / losing leads (None = carry on),
    # whether readers may retry or skip, and a yes/no variable that remembers the result
    "game": {"game": 20, "diff": "num", "title": 80, "prompt": 200, "c1": "hex", "c2": "hex", "c3": "hex",
             "win": "id", "lose": "id", "retry": "bool", "skip": "bool", "var": "var"},
    "note": {"text": 1000},
}
COMMON_FIELDS = {"k": "id", "if": 300}
SETTINGS = {"orientation": ("portrait", "landscape"), "textbox": ("sakura", "midnight", "paper", "pixel"),
            "font": ("rounded", "serif", "sans", "mono")}


# ----------------------------------------------------------------------------------------------- cleaning
def _s(v, n):
    return ("" if v is None else str(v)).replace("\r\n", "\n").strip()[:n]


def _field(v, spec):
    if isinstance(spec, int):
        return _s(v, spec)
    if spec == "id":
        return v if isinstance(v, str) and ID.match(v) else None
    if spec == "img":
        return v if isinstance(v, str) and IMG.match(v) else ""
    if spec == "var":
        return v if isinstance(v, str) and VAR.match(v) else ""
    if spec == "val":
        if isinstance(v, bool) or v is None:
            return v
        if isinstance(v, (int, float)) and math.isfinite(v):
            return max(-1e9, min(1e9, v))
        return _s(v, 200)
    if spec == "num":
        try:
            return max(0.0, min(60.0, float(v)))
        except (TypeError, ValueError):
            return 0.0
    if spec == "bool":
        return bool(v)
    if spec == "hex":
        return v if isinstance(v, str) and HEX.match(v) else ""
    return None


def _effects(lst):
    out = []
    for e in (lst if isinstance(lst, list) else [])[:12]:
        if isinstance(e, dict) and _field(e.get("var"), "var"):
            out.append({"var": e["var"], "op": _s(e.get("op"), 10) or "=", "val": _field(e.get("val"), "val")})
    return out


def _step(st):
    if not isinstance(st, dict) or st.get("t") not in STEP_FIELDS:
        return None
    out = {"t": st["t"]}
    for k, spec in list(STEP_FIELDS[st["t"]].items()) + list(COMMON_FIELDS.items()):
        if k in st:
            out[k] = _field(st[k], spec)
    if out["t"] == "game":
        out["game"] = out.get("game") if out.get("game") in GAMES else "timing"
        out["diff"] = int(min(2, out.get("diff") or 0))
    return out


def _choice(ch):
    if not isinstance(ch, dict):
        return None
    out = {"id": _field(ch.get("id"), "id") or secrets.token_hex(4), "text": _s(ch.get("text"), 300), "to": _field(ch.get("to"), "id"),
           "if": _s(ch.get("if"), 300), "mode": "lock" if ch.get("mode") == "lock" else "hide", "hint": _s(ch.get("hint"), 120),
           "once": bool(ch.get("once")), "set": _effects(ch.get("set"))}
    return out


def _num(v, lo, hi, dflt=0):
    try:
        f = float(v)
        return max(lo, min(hi, f)) if math.isfinite(f) else dflt
    except (TypeError, ValueError):
        return dflt


def _scene(sc):
    if not isinstance(sc, dict) or not _field(sc.get("id"), "id"):
        return None
    end = sc.get("ending")
    ending = None
    if isinstance(end, dict):
        ending = {"kind": end.get("kind") if end.get("kind") in ENDING_KINDS else "good", "title": _s(end.get("title"), 80) or "The End",
                  "text": _s(end.get("text"), 600)}
    return {"id": sc["id"], "name": _s(sc.get("name"), 80) or "Untitled scene", "x": round(_num(sc.get("x"), -20000, 20000)),
            "y": round(_num(sc.get("y"), -20000, 20000)), "note": _s(sc.get("note"), 500),
            "steps": [s for s in (_step(x) for x in (sc.get("steps") or [])[:500]) if s],
            "choices": [c for c in (_choice(x) for x in (sc.get("choices") or [])[:12]) if c],
            "next": _field(sc.get("next"), "id"), "ending": ending,
            "timer": round(_num(sc.get("timer"), 0, 60)), "timeout": _field(sc.get("timeout"), "id")}


def _char(ch):
    if not isinstance(ch, dict) or not _field(ch.get("id"), "id"):
        return None
    poses = []
    for p in (ch.get("poses") or [])[:24]:
        if isinstance(p, dict) and _s(p.get("name"), 40):
            poses.append({"name": _s(p.get("name"), 40), "img": _field(p.get("img"), "img")})
    return {"id": ch["id"], "name": _s(ch.get("name"), 40) or "Someone", "color": ch.get("color") if HEX.match(str(ch.get("color") or "")) else "#ff4f8b",
            "poses": poses}


def _var(v):
    if not isinstance(v, dict) or not _field(v.get("name"), "var"):
        return None
    typ = v.get("type") if v.get("type") in ("number", "flag", "text") else "number"
    init = v.get("init")
    if typ == "number":
        init = _num(init, -1e9, 1e9)
        init = int(init) if float(init).is_integer() else init
    elif typ == "flag":
        init = bool(init)
    else:
        init = _s(init, 200)
    return {"name": v["name"], "type": typ, "init": init, "note": _s(v.get("note"), 200)}


def clean_story(data):
    """The story document, keeping only known fields with sane types and sizes."""
    if not isinstance(data, dict):
        data = {}
    st = data.get("settings") if isinstance(data.get("settings"), dict) else {}
    settings = {k: (st.get(k) if st.get(k) in opts else opts[0]) for k, opts in SETTINGS.items()}
    settings.update({"accent": st.get("accent") if HEX.match(str(st.get("accent") or "")) else "#ff4f8b",
                     "cps": int(_num(st.get("cps"), 0, 200, 45)), "credits": _s(st.get("credits"), 1500),
                     "title_img": _field(st.get("title_img"), "img"), "title_music": _s(st.get("title_music"), 30),
                     "branding": st.get("branding") is not False})
    scenes = [s for s in (_scene(x) for x in (data.get("scenes") or [])[:400]) if s]
    seen, uniq = set(), []
    for s in scenes:
        if s["id"] not in seen:
            seen.add(s["id"])
            uniq.append(s)
    chars = [c for c in (_char(x) for x in (data.get("chars") or [])[:40]) if c]
    names, vars_ = set(), []
    for v in (_var(x) for x in (data.get("vars") or [])[:100]):
        if v and v["name"] not in names:
            names.add(v["name"])
            vars_.append(v)
    start = data.get("start") if data.get("start") in seen else (uniq[0]["id"] if uniq else None)
    return {"v": 1, "settings": settings, "start": start, "chars": chars, "vars": vars_, "scenes": uniq}


def story_stats(data):
    words = choices = lines = 0
    endings = []
    for s in data.get("scenes") or []:
        for st in s.get("steps") or []:
            if st.get("t") == "say":
                lines += 1
                words += len((st.get("text") or "").split())
        for c in s.get("choices") or []:
            choices += 1
            words += len((c.get("text") or "").split())
        if s.get("ending"):
            endings.append(s["ending"].get("kind"))
    return {"scenes": len(data.get("scenes") or []), "lines": lines, "words": words, "choices": choices,
            "endings": len(endings), "ending_kinds": endings, "minutes": max(1, int(round(words / 180.0 + choices * 0.15)))}


# ----------------------------------------------------------------------------------------------- helpers
def new_slug():
    while True:
        s = secrets.token_hex(4)
        if app_tables.stories.get(slug=s) is None:
            return s


def _owned(story_id, user):
    r = C.row_by_id(app_tables.stories, story_id)
    if r is None or (r["owner"] != user and not C.is_admin(user)):
        return None
    return r


def first_bg(data):
    for s in (data or {}).get("scenes") or []:
        for st in s.get("steps") or []:
            if st.get("t") == "bg" and st.get("img"):
                return st["img"]
    return ""


def card(r, me=None):
    """What the library and studio show about a novel (no emails, no story data)."""
    data = r["published"] or r["data"] or {}
    st = r["stats"] or {}
    owner = r["owner"]
    return {"id": r.get_id(), "slug": r["slug"], "title": r["title"], "blurb": r["blurb"] or "", "genre": r["genre"] or "",
            "tags": r["tags"] or [], "rating": r["rating"] or "Everyone", "cover": r["cover"] or first_bg(data),
            "author": C.name_of(owner), "author_bio": (owner["bio"] or "") if owner else "",
            "plays": int(r["plays"] or 0), "likes": int(r["likes"] or 0), "stats": st, "status": r["status"] or "draft",
            "orientation": ((data.get("settings") or {}).get("orientation")) or "portrait",
            "published_at": C.iso(r["published_at"]), "updated": C.iso(r["updated"]), "featured": bool(r["featured"]),
            "hidden": bool(r["hidden"]), "demo": bool(r["is_demo"]), "mine": me is not None and owner == me}


def blank_story():
    return clean_story({
        "settings": {"orientation": "portrait", "textbox": "sakura", "accent": "#ff4f8b", "cps": 45},
        "chars": [{"id": "c_you", "name": "[player]", "color": "#3cc6c0", "poses": []}],
        "vars": [{"name": "player", "type": "text", "init": "Aki", "note": "The reader's name"}],
        "start": "s_start",
        "scenes": [{"id": "s_start", "name": "Opening", "x": 0, "y": 0,
                    "steps": [{"t": "bg", "img": "demo:bg-sakura-park", "fx": "fade", "k": "a1"},
                              {"t": "say", "text": "This is where your story begins. Click a line to edit it.", "k": "a2"}],
                    "choices": [], "next": None, "ending": None}]})


def _save_row(r, data):
    data = clean_story(data)
    r.update(data=data, stats=story_stats(data), updated=C.now())
    return data


# ----------------------------------------------------------------------------------------------- the studio
@anvil.server.callable(require_user=True)
def studio_home():
    me = C.require_user()
    DemoData.ensure_loaded()
    rows = app_tables.stories.search(tables.order_by("updated", ascending=False), owner=me)
    out = []
    for r in rows:
        c = card(r, me)
        c["changes"] = bool(r["published"]) and r["published"] != r["data"]
        c["images"] = len(app_tables.images.search(story=r))
        out.append(c)
    totals = {"novels": len(out), "plays": sum(c["plays"] for c in out), "likes": sum(c["likes"] for c in out),
              "published": len([c for c in out if c["status"] in ("public", "unlisted")]),
              "words": sum((c["stats"] or {}).get("words", 0) for c in out)}
    return {"stories": out, "totals": totals, "limits": C.limits(me)}


@anvil.server.callable(require_user=True)
def create_story(title, template="blank", orientation="portrait"):
    me = C.require_user()
    title = C.text(title, 80)
    if len(title) < 2:
        return C.fail("Give your novel a title (at least 2 characters).")
    lim = C.limits(me)
    if len(app_tables.stories.search(owner=me)) >= lim["novels"]:
        return C.fail("You have %d novels, the most on the %s plan. Delete one, or go Pro for more." % (lim["novels"], lim["label"]))
    if C.rate_limited("create_story", 20, 3600):
        return C.fail("That's a lot of new novels in one hour. Please try again later.")
    if template == "starter":
        from . import DemoStories
        data = clean_story(DemoStories.cherry())
    else:
        data = blank_story()
    data["settings"]["orientation"] = "landscape" if orientation == "landscape" else "portrait"
    now = C.now()
    r = app_tables.stories.add_row(owner=me, slug=new_slug(), title=title, blurb="", genre="", tags=[], rating="Everyone",
                                   cover="", data=data, published=None, status="draft", stats=story_stats(data), plays=0,
                                   likes=0, ending_counts={}, featured=False, hidden=False, created=now, updated=now,
                                   published_at=None, is_demo=False)
    return C.ok(story=card(r, me))


def _image(r):
    return {"id": r.get_id(), "key": r["key"], "name": r["name"] or "", "kind": r["kind"] or "bg", "w": r["width"], "h": r["height"],
            "bytes": r["bytes"], "created": C.iso(r["created"])}


@anvil.server.callable(require_user=True)
def get_story(story_id):
    """Everything the editor needs: the story, its pictures and the creator's plan limits."""
    me = C.require_user()
    r = _owned(story_id, me)
    if r is None:
        return C.fail("That novel doesn't exist, or it isn't yours.")
    imgs = app_tables.images.search(tables.order_by("created", ascending=False), story=r)
    c = card(r, me)
    c["changes"] = bool(r["published"]) and r["published"] != r["data"]
    from . import Sounds
    return C.ok(story=c, data=r["data"] or blank_story(), images=[_image(i) for i in imgs], sounds=Sounds.list_for(r),
                limits=C.limits(r["owner"]), genres=GENRES, ratings=RATINGS)


@anvil.server.callable(require_user=True)
def save_story(story_id, data):
    me = C.require_user()
    r = _owned(story_id, me)
    if r is None:
        return C.fail("That novel doesn't exist, or it isn't yours.")
    if not isinstance(data, dict):
        return C.fail("That story didn't arrive in one piece. Please try again.")
    import json
    if len(json.dumps(data)) > MAX_JSON:
        return C.fail("This novel is too big to save (over 900 KB of text). Split it into two novels.")
    data = _save_row(r, data)
    return C.ok(updated=C.iso(r["updated"]), stats=r["stats"])


@anvil.server.callable(require_user=True)
def update_story_meta(story_id, meta):
    me = C.require_user()
    r = _owned(story_id, me)
    if r is None:
        return C.fail("That novel doesn't exist, or it isn't yours.")
    meta = meta if isinstance(meta, dict) else {}
    title = C.text(meta.get("title", r["title"]), 80)
    if len(title) < 2:
        return C.fail("The title needs at least 2 characters.")
    tags = [C.text(t, 24).lower() for t in (meta.get("tags", r["tags"]) or []) if C.text(t, 24)][:8] if isinstance(meta.get("tags", []), list) else []
    cover = meta.get("cover", r["cover"]) or ""
    r.update(title=title, blurb=C.text(meta.get("blurb", r["blurb"]), 600, multiline=True),
             genre=meta.get("genre") if meta.get("genre") in GENRES else (r["genre"] if "genre" not in meta else ""),
             rating=meta.get("rating") if meta.get("rating") in RATINGS else (r["rating"] or "Everyone"),
             tags=tags, cover=cover if IMG.match(cover) else "", updated=C.now())
    return C.ok(story=card(r, me))


@anvil.server.callable(require_user=True)
def publish_story(story_id, visibility="public", data=None):
    """Freeze the current draft as what players see. visibility: public (in the library) or unlisted (link only)."""
    me = C.require_user()
    r = _owned(story_id, me)
    if r is None:
        return C.fail("That novel doesn't exist, or it isn't yours.")
    if visibility not in ("public", "unlisted"):
        return C.fail("Choose public or unlisted.")
    if C.rate_limited("publish", 30, 3600):
        return C.fail("That's a lot of publishing in one hour. Please try again later.")
    if isinstance(data, dict):
        _save_row(r, data)
    d = r["data"] or {}
    if not d.get("scenes"):
        return C.fail("Add at least one scene before publishing.")
    if not d.get("start"):
        return C.fail("Choose a starting scene before publishing.")
    if not r["genre"]:
        return C.fail("Pick a genre in Settings, so readers can find your novel.")
    now = C.now()
    r.update(published=d, status=visibility, published_at=now, updated=now)
    return C.ok(story=card(r, me))


@anvil.server.callable(require_user=True)
def unpublish_story(story_id):
    me = C.require_user()
    r = _owned(story_id, me)
    if r is None:
        return C.fail("That novel doesn't exist, or it isn't yours.")
    r.update(status="draft", published=None, published_at=None)
    return C.ok(story=card(r, me))


@anvil.server.callable(require_user=True)
def duplicate_story(story_id):
    me = C.require_user()
    r = _owned(story_id, me)
    if r is None:
        return C.fail("That novel doesn't exist, or it isn't yours.")
    lim = C.limits(me)
    if len(app_tables.stories.search(owner=me)) >= lim["novels"]:
        return C.fail("You have %d novels, the most on the %s plan." % (lim["novels"], lim["label"]))
    import json
    now = C.now()
    text, cover = json.dumps(r["data"] or blank_story()), r["cover"] or ""
    imgs = list(app_tables.images.search(story=r))
    snds = list(app_tables.sounds.search(story=r))
    keys = {}
    for f in imgs + snds:  # each copied file gets its own key, and the copy's story points at the new keys
        keys[f["key"]] = f["key"][0] + secrets.token_hex(12)
        text = text.replace('"%s"' % f["key"], '"%s"' % keys[f["key"]])
    data = json.loads(text)
    copy = app_tables.stories.add_row(owner=me, slug=new_slug(), title=C.text("Copy of " + r["title"], 80), blurb=r["blurb"],
                                      genre=r["genre"], tags=r["tags"] or [], rating=r["rating"], cover=keys.get(cover, cover), data=data,
                                      published=None, status="draft", stats=story_stats(data), plays=0, likes=0, ending_counts={},
                                      featured=False, hidden=False, created=now, updated=now, published_at=None, is_demo=False)
    for img in imgs:
        app_tables.images.add_row(owner=me, story=copy, key=keys[img["key"]], name=img["name"], kind=img["kind"],
                                  media=img["media"], width=img["width"], height=img["height"], bytes=img["bytes"],
                                  created=now, is_demo=False)
    for snd in snds:
        app_tables.sounds.add_row(owner=me, story=copy, key=keys[snd["key"]], name=snd["name"], kind=snd["kind"], media=snd["media"],
                                  seconds=snd["seconds"], bytes=snd["bytes"], created=now, is_demo=False)
    return C.ok(story=card(copy, me))


def delete_story_rows(r):
    for t in (app_tables.likes, app_tables.reports, app_tables.images, app_tables.sounds):
        for x in t.search(story=r):
            x.delete()
    r.delete()


@anvil.server.callable(require_user=True)
def delete_story(story_id):
    me = C.require_user()
    r = _owned(story_id, me)
    if r is None:
        return C.ok()
    delete_story_rows(r)
    return C.ok()


# ----------------------------------------------------------------------------------------------- library + playing
def _listed():
    return [r for r in app_tables.stories.search(status="public") if not r["hidden"] and r["published"]]


@anvil.server.callable
def library(query=None, genre=None, sort="popular"):
    DemoData.ensure_loaded()
    me = C.me()
    rows = _listed()
    counts = {}
    for r in rows:
        if r["genre"]:
            counts[r["genre"]] = counts.get(r["genre"], 0) + 1
    q = C.text(query, 80).lower()
    if genre in GENRES:
        rows = [r for r in rows if r["genre"] == genre]
    if q:
        rows = [r for r in rows if q in " ".join([r["title"] or "", r["blurb"] or "", C.name_of(r["owner"]), " ".join(r["tags"] or []),
                                                    r["genre"] or ""]).lower()]
    if sort == "new":
        rows.sort(key=lambda r: C.iso(r["published_at"]) or "", reverse=True)
    elif sort == "liked":
        rows.sort(key=lambda r: (r["likes"] or 0), reverse=True)
    else:
        rows.sort(key=lambda r: (r["plays"] or 0) + 6 * (r["likes"] or 0), reverse=True)
    featured = [card(r, me) for r in _listed() if r["featured"]][:6] if not q and not genre else []
    return {"stories": [card(r, me) for r in rows[:60]], "total": len(rows), "featured": featured,
            "genres": [{"name": g, "count": counts.get(g, 0)} for g in GENRES]}


@anvil.server.callable
def get_play(slug, draft=False):
    """A novel to play: the published snapshot, or (for its owner or an admin, draft=True) the current draft."""
    DemoData.ensure_loaded()
    me = C.me()
    r = app_tables.stories.get(slug=slug) if isinstance(slug, str) and re.match(r"^[0-9a-f]{8}$", slug) else None
    if r is None:
        return C.fail("This novel doesn't exist (or was deleted).")
    is_owner = me is not None and (r["owner"] == me or C.is_admin(me))
    if draft:
        if not is_owner:
            return C.fail("Only the creator can play the draft.")
        data = r["data"]
    else:
        if (r["status"] not in ("public", "unlisted") or not r["published"] or r["hidden"]) and not is_owner:
            return C.fail("This novel isn't published, or it was taken down.")
        data = r["published"] or (r["data"] if is_owner else None)
    if not data:
        return C.fail("This novel has nothing to play yet.")
    liked = me is not None and app_tables.likes.get(user=me, story=r) is not None
    c = card(r, me)
    c["can_edit"] = is_owner
    return C.ok(story=c, data=data, liked=liked, ending_counts=r["ending_counts"] or {}, draft=bool(draft))


@anvil.server.callable
def record_play(slug, event, ending_id=None):
    """Counts a play (once per visit) and each ending reached (once per visit per ending)."""
    r = app_tables.stories.get(slug=slug) if isinstance(slug, str) else None
    if r is None or r["status"] not in ("public", "unlisted"):
        return C.ok()
    me = C.me()
    if me is not None and r["owner"] == me:
        return C.ok()  # creators testing their own novel don't count
    done = anvil.server.session.get("played") or []
    key = "%s:%s:%s" % (slug, event, ending_id or "")
    if key in done or C.rate_limited("record_play", 60, 3600):
        return C.ok()
    anvil.server.session["played"] = (done + [key])[-200:]
    if event == "start":
        r["plays"] = int(r["plays"] or 0) + 1
    elif event == "ending" and isinstance(ending_id, str) and ID.match(ending_id):
        counts = dict(r["ending_counts"] or {})
        counts[ending_id] = int(counts.get(ending_id, 0)) + 1
        r["ending_counts"] = counts
    return C.ok()


@anvil.server.callable(require_user=True)
def toggle_like(slug):
    me = C.require_user()
    r = app_tables.stories.get(slug=slug) if isinstance(slug, str) else None
    if r is None or (r["status"] not in ("public", "unlisted") and r["owner"] != me):
        return C.fail("This novel isn't available.")
    row = app_tables.likes.get(user=me, story=r)
    if row is None:
        app_tables.likes.add_row(user=me, story=r, created=C.now(), is_demo=False)
        r["likes"] = int(r["likes"] or 0) + 1
    else:
        row.delete()
        r["likes"] = max(0, int(r["likes"] or 0) - 1)
    return C.ok(liked=row is None, likes=int(r["likes"] or 0))


@anvil.server.callable
def report_story(slug, reason):
    r = app_tables.stories.get(slug=slug) if isinstance(slug, str) else None
    if r is None:
        return C.fail("This novel doesn't exist.")
    reason = C.text(reason, 1000, multiline=True)
    if len(reason) < 5:
        return C.fail("Please say briefly what's wrong (at least 5 characters).")
    if C.rate_limited("report", 5, 3600):
        return C.fail("Thanks, we've had several reports from you this hour. Please try again later.")
    app_tables.reports.add_row(story=r, user=C.me(), reason=reason, status="open", created=C.now())
    return C.ok()


@anvil.server.callable
def creator_page(slug):
    """The other published novels by the creator of this one (for the play page's "More by" shelf)."""
    me = C.me()
    r = app_tables.stories.get(slug=slug) if isinstance(slug, str) else None
    if r is None:
        return {"stories": []}
    rows = [x for x in _listed() if x["owner"] == r["owner"] and x != r]
    return {"stories": [card(x, me) for x in rows[:6]]}
