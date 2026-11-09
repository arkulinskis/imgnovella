"""Server tests against the strict mock of Anvil (tools/testing/mock).

    python tools/testing/test_server.py          -> prints ALL OK, or the first failure

call(name, ...) runs a server function the way the browser does: by name, with require_user enforced,
and the reply must be JSON (a datetime or a row in a reply fails here, like it would break the page).
Add tests for every new server function: the happy path, bad input, and someone who isn't allowed.
"""
import datetime as dt
import importlib
import json
import os
import pathlib
import shutil
import sys
import tempfile

HERE = pathlib.Path(__file__).resolve().parent
PROJECT = HERE.parents[1]
_tmp = pathlib.Path(tempfile.mkdtemp())
shutil.copytree(PROJECT / "server_code", _tmp / "app")
(_tmp / "app" / "__init__.py").write_text("")
os.environ["ANVIL_APP_YAML"] = str(PROJECT / "anvil.yaml")  # the mock's tables follow the app's own schema
sys.path[:0] = [str(HERE / "mock"), str(_tmp)]
import anvil.server  # noqa: E402
import anvil.users  # noqa: E402
from anvil.tables import app_tables as T  # noqa: E402

M = {p.stem: importlib.import_module("app." + p.stem) for p in sorted((PROJECT / "server_code").glob("*.py"))}
now = dt.datetime.now(dt.timezone.utc)


def call(name, *args):
    r = anvil.server.call(name, *args)
    json.dumps(r)  # strict: must be JSON-able
    return r


def as_user(row):
    anvil.users.CURRENT[0] = row
    anvil.server.session.use(row.get_id() if row is not None else None)


def denied(name, *args):
    try:
        call(name, *args)
    except anvil.server.PermissionDenied:
        return True
    return False


def ok(r, msg=""):
    assert isinstance(r, dict) and r.get("ok"), (msg, r)
    return r


def bad(r, msg=""):
    assert isinstance(r, dict) and r.get("ok") is False and r.get("error"), (msg, r)
    return r


def C_ROW(story_id):
    return T.stories.get_by_id(story_id)


def person(email, name=None, **kw):
    return T.users.add_row(email=email, enabled=True, signed_up=now, display_name=name, **kw)


# ---------------------------------------------------------------------------------- accounts
admin = person("arkulinskis@gmail.com", "The Admin")
ana = person("ana@example.com", "Ana")
bob = person("bob@example.com")

as_user(None)
assert call("get_me") is None
assert denied("update_profile", "X")
as_user(admin)
assert call("get_me")["is_admin"] is True, "ADMIN_EMAILS become admins on first sign-in"
as_user(ana)
me = call("get_me")
assert me["name"] == "Ana" and me["is_admin"] is False
assert ana["last_seen"] is not None
as_user(bob)
assert call("get_me")["name"] == "Bob", "a name comes from the email when none is set"
bad(call("update_profile", " x "))
assert ok(call("update_profile", "  Bob   Stone "))["me"]["name"] == "Bob Stone"

# ---------------------------------------------------------------------------------- feedback
as_user(None)
bad(call("submit_feedback", "bug", "hi"))
ok(call("submit_feedback", "bug", "The button is broken", "guest@example.com", {"page": "#home", "evil": "x" * 9999}))
fb = T.feedback.search()[0]
assert fb["name"] == "Guest" and fb["email"] == "guest@example.com" and "evil" not in fb["context"] and fb["status"] == "new"
for i in range(4):
    ok(call("submit_feedback", "idea", "Idea number %d" % i))
bad(call("submit_feedback", "idea", "One too many this hour"), "rate limit")
as_user(ana)
ok(call("submit_feedback", "nonsense-kind", "Signed-in feedback"))
assert T.feedback.get(message="Signed-in feedback")["kind"] == "other"
assert denied("list_feedback")
as_user(admin)
lst = call("list_feedback")
assert lst["counts"]["new"] == 6 and len(lst["items"]) == 6
fid = lst["items"][0]["id"]
ok(call("set_feedback_status", fid, "done", "Fixed it"))
assert call("list_feedback", "done")["items"][0]["note"] == "Fixed it"
bad(call("set_feedback_status", fid, "weird"))
bad(call("set_feedback_status", "nope", "done"))
ok(call("delete_feedback", fid))
assert len(call("list_feedback")["items"]) == 5

# ---------------------------------------------------------------------------------- admin
as_user(ana)
for fn, args in [("admin_overview", ()), ("list_users", ()), ("set_admin", (bob.get_id(), True)), ("demo_load", ()), ("demo_remove", ())]:
    assert denied(fn, *args), fn
as_user(admin)
ov = call("admin_overview")
assert ov["users"] == 3 and ov["admins"] == 1 and ov["feedback_new"] == 5 and ov["pro"] == 0
assert len(call("list_users")["users"]) == 3 and len(call("list_users", "bob")["users"]) == 1
ok(call("set_admin", bob.get_id(), True))
assert bob["is_admin"] is True
bad(call("set_admin", admin.get_id(), False), "can't remove your own admin")
ok(call("set_enabled", bob.get_id(), False))
assert bob["enabled"] is False
bad(call("set_enabled", admin.get_id(), False))
ok(call("set_enabled", bob.get_id(), True))
ok(call("set_admin", bob.get_id(), False))
assert bob["is_admin"] is False

# ---------------------------------------------------------------------------------- demo data + library
import base64, struct, zlib  # noqa: E402


def png(w, h):
    raw = b"".join(b"\x00" + b"\xff\x4f\x8b" * w for _ in range(h))
    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) +
            chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b""))


def data_url(b, mime="image/png"):
    return "data:%s;base64,%s" % (mime, base64.b64encode(b).decode())


as_user(None)
lib = call("library")
assert M["DemoData"].state() == "loaded" and lib["total"] == len(M["DemoStories"].DEMO), "demo loads on first visit"
assert lib["featured"] and all(c["status"] == "public" for c in lib["stories"])
assert all("@" not in json.dumps(c) for c in lib["stories"]), "no emails in the library"
assert call("library", "train")["total"] == 1 and call("library", None, "Comedy")["total"] == 1
assert [c["title"] for c in call("library", None, None, "new")["stories"]][0] == "Lantern Night, Again"
slug = [c for c in lib["stories"] if c["title"] == "The Last Train Home"][0]["slug"]
play = ok(call("get_play", slug))
assert play["data"]["start"] == "t_start" and play["liked"] is False and not play["story"]["can_edit"]
bad(call("get_play", "nope"))
bad(call("get_play", slug, True), "guests can't play drafts")
plays = play["story"]["plays"]
ok(call("record_play", slug, "start"))
ok(call("record_play", slug, "start"))
assert call("get_play", slug)["story"]["plays"] == plays + 1, "a play counts once per visit"
ok(call("record_play", slug, "ending", "t_secret"))
assert call("get_play", slug)["ending_counts"]["t_secret"] >= 1
assert denied("toggle_like", slug)
bad(call("report_story", slug, "x"))
ok(call("report_story", slug, "This scene is too scary for the Everyone rating."))
assert len(call("creator_page", slug)["stories"]) == 3, "Jules's other novels"
cherry_slug = [c for c in lib["stories"] if c["title"] == "Cherry Blossom Promise"][0]["slug"]
assert len(call("creator_page", cherry_slug)["stories"]) == 2, "Mika's other novels"

# ---------------------------------------------------------------------------------- the studio
for fn, args in [("studio_home", ()), ("create_story", ("X",)), ("get_story", ("x",)), ("save_story", ("x", {})),
                 ("upload_image", ("x", "")), ("publish_story", ("x",)), ("delete_story", ("x",)), ("update_bio", ("hi",))]:
    assert denied(fn, *args), fn
as_user(ana)
assert call("get_me")["plan"] == "free" and call("get_me")["limits"]["long"] == 600
ok(call("update_bio", "  I write   ghost stories "))
assert call("get_me")["bio"] == "I write ghost stories"
home = call("studio_home")
assert home["stories"] == [] and home["limits"]["novels"] == 5
bad(call("create_story", " "))
st = ok(call("create_story", "My Ghost Story"))["story"]
assert st["status"] == "draft" and st["title"] == "My Ghost Story"
ed = ok(call("get_story", st["id"]))
data = ed["data"]
assert data["start"] == "s_start" and data["scenes"][0]["steps"], "a blank novel has one scene to start from"
starter = ok(call("create_story", "From the starter", "starter", "landscape"))["story"]
sd = call("get_story", starter["id"])["data"]
assert sd["settings"]["orientation"] == "landscape" and len(sd["scenes"]) >= 8 and starter["stats"]["endings"] == 3

# save: cleaning keeps known fields only, with sane types
data["scenes"].append({"id": "s2", "name": "<b>Second</b>", "x": "12", "y": None, "evil": "x",
                       "steps": [{"t": "say", "who": "c_you", "text": "Hello <script>", "k": "z1", "if": "trust >= 2", "bad": 1},
                                 {"t": "launch_missiles"}, {"t": "bg", "img": "javascript:alert(1)"},
                                 {"t": "set", "var": "trust", "op": "+", "val": 1}],
                       "choices": [{"id": "ch1", "text": "Go back", "to": "s_start", "set": [{"var": "trust", "op": "+", "val": 2}, {"var": "2bad"}]}],
                       "ending": {"kind": "weird", "title": ""}, "timer": 999})
data["vars"].append({"name": "trust", "type": "number", "init": "3"})
data["vars"].append({"name": "bad name!", "type": "flag"})
data["settings"]["orientation"] = "sideways"
r = ok(call("save_story", st["id"], data))
assert r["stats"]["scenes"] == 2 and r["stats"]["endings"] == 1
sv = call("get_story", st["id"])["data"]
s2 = [x for x in sv["scenes"] if x["id"] == "s2"][0]
assert "evil" not in s2 and s2["x"] == 12 and s2["timer"] == 60 and s2["ending"]["kind"] == "good" and s2["ending"]["title"] == "The End"
assert [x["t"] for x in s2["steps"]] == ["say", "bg", "set"] and s2["steps"][1]["img"] == "" and "bad" not in s2["steps"][0]
assert s2["steps"][0]["text"] == "Hello <script>", "text is stored raw; the browser escapes it"
assert s2["choices"][0]["set"] == [{"var": "trust", "op": "+", "val": 2}]
assert [v["name"] for v in sv["vars"]] == ["player", "trust"] and sv["vars"][1]["init"] == 3
assert sv["settings"]["orientation"] == "portrait"
bad(call("save_story", st["id"], "nope"))
bad(call("save_story", st["id"], {"scenes": [{"id": "big", "steps": [{"t": "note", "text": "x" * 1000}] * 1000}]}), "too big")

# meta + publish
bad(call("update_story_meta", st["id"], {"title": "x"}))
ok(call("update_story_meta", st["id"], {"title": "My Ghost Story", "blurb": "Boo.", "genre": "Nope", "tags": ["Ghosts", "  ", "x" * 50], "cover": "evil"}))
bad(call("publish_story", st["id"], "public"), "a genre is needed")
meta = ok(call("update_story_meta", st["id"], {"genre": "Horror", "rating": "Teen", "cover": "demo:bg-library"}))["story"]
assert meta["genre"] == "Horror" and meta["tags"] == ["ghosts", "x" * 24] and meta["cover"] == "demo:bg-library"
bad(call("publish_story", st["id"], "everyone"))
pub = ok(call("publish_story", st["id"], "unlisted"))["story"]
assert pub["status"] == "unlisted"
as_user(None)
assert ok(call("get_play", pub["slug"]))["data"]["start"] == "s_start", "unlisted novels play by link"
assert call("library", "ghost")["total"] == 0, "unlisted novels aren't in the library"
as_user(ana)
ok(call("publish_story", st["id"], "public"))
assert call("library", "ghost")["total"] == 1
data2 = call("get_story", st["id"])["data"]
data2["scenes"][0]["name"] = "Changed after publishing"
ok(call("save_story", st["id"], data2))
as_user(None)
assert call("get_play", pub["slug"])["data"]["scenes"][0]["name"] == "Opening", "players see the published snapshot"
as_user(ana)
assert call("get_play", pub["slug"], True)["data"]["scenes"][0]["name"] == "Changed after publishing", "the owner can play the draft"
assert [c for c in call("studio_home")["stories"] if c["id"] == st["id"]][0]["changes"] is True
ok(call("record_play", pub["slug"], "start"))
assert call("get_play", pub["slug"])["story"]["plays"] == 0, "creators' own plays don't count"

# likes
lk = ok(call("toggle_like", slug))
assert lk["liked"] is True
assert call("get_play", slug)["liked"] is True
assert ok(call("toggle_like", slug))["liked"] is False

# someone else can't touch Ana's novel
as_user(bob)
for fn, args in [("get_story", (st["id"],)), ("save_story", (st["id"], data)), ("update_story_meta", (st["id"], {"title": "Mine now"})),
                 ("publish_story", (st["id"],)), ("unpublish_story", (st["id"],)), ("duplicate_story", (st["id"],)),
                 ("upload_image", (st["id"], data_url(png(10, 10))))]:
    bad(call(fn, *args), fn)
ok(call("delete_story", st["id"]))
assert C_ROW(st["id"]) is not None, "bob's delete did nothing"

# pictures: the plan limits are checked on the real width and height
as_user(ana)
bad(call("upload_image", st["id"], "not a data url"))
bad(call("upload_image", st["id"], data_url(b"GIF89a" + b"0" * 40, "image/gif")))
bad(call("upload_image", st["id"], data_url(png(500, 700))), "too big for Free")
bad(call("upload_image", st["id"], data_url(png(601, 300))), "too long for Free")
img = ok(call("upload_image", st["id"], data_url(png(400, 600)), "Ghost", "sprite"))["image"]
assert img["w"] == 400 and img["h"] == 600 and img["kind"] == "sprite"
land = ok(call("upload_image", st["id"], data_url(png(600, 400)), "Hall", "bg"))["image"]
assert land["w"] == 600
assert len(call("get_story", st["id"])["images"]) == 2
ep = anvil.server.ENDPOINTS["/img"]
resp = ep(k=img["key"])
assert resp.status == 200 and resp.body.get_bytes()[:4] == b"\x89PNG" and "max-age" in resp.headers["Cache-Control"]
assert ep(k="i000000000000").status == 404 and ep(k="../etc").status == 404
ok(call("update_image", img["id"], "Ghost girl", "cg"))
assert [i for i in call("get_story", st["id"])["images"] if i["id"] == img["id"]][0]["kind"] == "cg"
as_user(bob)
bad(call("update_image", img["id"], "x"))
bad(call("delete_image", img["id"]))
as_user(admin)
ok(call("set_plan", ana.get_id(), "pro"))
as_user(ana)
assert call("get_me")["plan"] == "pro"
big = ok(call("upload_image", st["id"], data_url(png(1200, 1800)), "Big", "bg"))["image"]
bad(call("upload_image", st["id"], data_url(png(1300, 1800))), "too big even for Pro")
ok(call("delete_image", big["id"]))

# sounds: real audio formats only, the plan's size limit, served by key
mp3 = b"ID3\x04\x00\x00\x00\x00\x00\x00" + b"\x00" * 2000
ogg = b"OggS" + b"\x00" * 500
as_user(None)
assert denied("upload_sound", st["id"], data_url(mp3, "audio/mpeg"))
as_user(admin)
ok(call("set_plan", ana.get_id(), "free"))
as_user(ana)
bad(call("upload_sound", st["id"], "nope"))
bad(call("upload_sound", st["id"], data_url(b"<html>not audio</html>", "audio/mpeg")), "sniffed, not trusted")
bad(call("upload_sound", st["id"], data_url(b"ID3" + b"\x00" * (1100 * 1024), "audio/mpeg")), "over the Free size")
snd = ok(call("upload_sound", st["id"], data_url(mp3, ""), "Theme song", "music", 93.4))["sound"]
assert snd["kind"] == "music" and snd["seconds"] == 93.4 and snd["key"].startswith("a")
fx = ok(call("upload_sound", st["id"], data_url(ogg, "audio/ogg"), "Door creak", "weird", "x"))["sound"]
assert fx["kind"] == "music" and fx["seconds"] == 0
assert sorted(x["name"] for x in call("get_story", st["id"])["sounds"]) == ["Door creak", "Theme song"]
aep = anvil.server.ENDPOINTS["/audio"]
r_ = aep(k=snd["key"])
assert r_.status == 200 and r_.body.content_type == "audio/mpeg" and r_.body.get_bytes()[:3] == b"ID3"
assert aep(k="a123").status == 404 and aep(k=img["key"]).status == 404
ok(call("update_sound", fx["id"], "Creaky door", "sound"))
assert [x for x in call("get_story", st["id"])["sounds"] if x["id"] == fx["id"]][0]["kind"] == "sound"
as_user(bob)
bad(call("upload_sound", st["id"], data_url(mp3)))
bad(call("update_sound", fx["id"], "mine"))
bad(call("delete_sound", fx["id"]))
as_user(ana)

# a mini-game step and music steps that use the uploaded files survive cleaning
gd = call("get_story", st["id"])["data"]
gd["vars"].append({"name": "won_game", "type": "flag", "init": False})
gd["scenes"][0]["steps"] += [
    {"t": "music", "track": snd["key"], "k": "m1"}, {"t": "sfx", "name": fx["key"], "k": "m2"},
    {"t": "game", "game": "tictactoe", "diff": 7, "title": "Duel", "c1": "#ff0000", "c2": "red", "c3": "#000000",
     "win": "s_start", "lose": "nowhere!", "retry": 1, "skip": False, "var": "won_game", "k": "g1", "extra": "x"},
    {"t": "game", "game": "pinball", "k": "g2"}]
ok(call("save_story", st["id"], gd))
steps = call("get_story", st["id"])["data"]["scenes"][0]["steps"]
g1, g2 = [x for x in steps if x["t"] == "game"]
assert g1 == {"t": "game", "game": "tictactoe", "diff": 2, "title": "Duel", "prompt": "", "c1": "#ff0000", "c2": "", "c3": "#000000", "win": "s_start",
              "lose": None, "retry": True, "skip": False, "var": "won_game", "k": "g1"} or (g1["c2"] == "" and g1["lose"] is None and g1["diff"] == 2), g1
assert g2["game"] == "timing" and g2["diff"] == 0, "an unknown game falls back to Perfect timing"
assert [x["track"] for x in steps if x["t"] == "music"] == [snd["key"]]

# duplicate: the copy gets its own picture keys
dup = ok(call("duplicate_story", st["id"]))["story"]
dd = call("get_story", dup["id"])
assert dup["status"] == "draft" and len(dd["images"]) == 2 and {i["key"] for i in dd["images"]}.isdisjoint({img["key"], land["key"]})
assert len(dd["sounds"]) == 2 and snd["key"] not in json.dumps(dd["data"]) and dd["sounds"][0]["key"] in json.dumps(dd["data"]) or dd["sounds"][1]["key"] in json.dumps(dd["data"]), "copied sounds get new keys"
d3 = dd["data"]
d3["scenes"][0]["steps"].append({"t": "bg", "img": land["key"], "k": "q1"})
ok(call("save_story", dup["id"], d3))
ok(call("delete_story", dup["id"]))
assert call("get_story", dup["id"]).get("ok") is False

# novel limit
as_user(admin)
ok(call("set_plan", ana.get_id(), "free"))
as_user(ana)
ok(call("create_story", "Three"))
ok(call("create_story", "Four"))
ok(call("create_story", "Five"))
bad(call("create_story", "Six"), "Free has 5 novels at most")

# ---------------------------------------------------------------------------------- admin: novels, reports, plans, demo
as_user(ana)
for fn, args in [("admin_stories", ()), ("admin_set_story", (st["id"], "featured", True)), ("list_reports", ()),
                 ("resolve_report", ("x", "dismiss")), ("set_plan", (ana.get_id(), "pro"))]:
    assert denied(fn, *args), fn
as_user(admin)
ov = call("admin_overview")
assert ov["novels"] >= len(M["DemoStories"].DEMO) + 2 and ov["reports_open"] == 1 and ov["published"] == len(M["DemoStories"].DEMO) + 1
NDEMO = len(M["DemoStories"].DEMO)
assert len(call("admin_stories")["stories"]) == NDEMO + 1 and len(call("admin_stories", None, "all")["stories"]) >= NDEMO + 5
ok(call("admin_set_story", st["id"], "featured", True))
assert any(c["title"] == "My Ghost Story" for c in call("library")["featured"])
bad(call("admin_set_story", st["id"], "owner", True))
bad(call("set_plan", ana.get_id(), "platinum"))
reps = call("list_reports")["reports"]
assert len(reps) == 1 and reps[0]["story"]["slug"] == slug
ok(call("resolve_report", reps[0]["id"], "hide"))
as_user(None)
assert call("library", "train")["total"] == 0 and call("get_play", slug).get("ok") is False, "hidden novels are taken down"
as_user(admin)
assert call("get_play", slug)["ok"], "admins can still open it"
ok(call("admin_set_story", call("get_play", slug)["story"]["id"], "hidden", False))
bad(call("resolve_report", "nope", "dismiss"))
assert call("list_reports", "all")["reports"][0]["status"] == "hidden"

as_user(ana)
ok(call("toggle_like", cherry_slug))
as_user(admin)
ok(call("demo_remove"))
assert M["DemoData"].state() == "removed" and call("library")["total"] == 1, "removing demo data keeps real novels"
assert not T.users.search(is_demo=True) and not T.likes.search()
as_user(None)
call("library")
assert M["DemoData"].state() == "removed", "removed demo data doesn't come back by itself"
as_user(admin)
ok(call("demo_load"))
ok(call("demo_load"))
assert call("library")["total"] == 1 + len(M["DemoStories"].DEMO), "reloading replaces the demo instead of doubling it"

# every demo novel is valid: the start scene exists, every target exists, every ending is reachable
for d in M["DemoStories"].DEMO:
    sd = M["Stories"].clean_story(d[7]())
    ids = {x["id"] for x in sd["scenes"]}
    assert sd["start"] in ids, d[1]
    for x in sd["scenes"]:
        for c in x["choices"]:
            assert c["to"] in ids, (d[1], c)
        assert x["next"] is None or x["next"] in ids, (d[1], x["id"])
        for stp in x["steps"]:
            if stp["t"] == "jump":
                assert stp["to"] in ids, (d[1], stp)
        assert x["choices"] or x["next"] or x["ending"] or any(stp["t"] == "jump" for stp in x["steps"]), (d[1], "dead end", x["id"])
        for stp in x["steps"]:
            if stp["t"] == "game":
                assert stp["game"] in M["Stories"].GAMES and (not stp["win"] or stp["win"] in ids) and (not stp["lose"] or stp["lose"] in ids), (d[1], stp)
                assert not stp["var"] or any(v["name"] == stp["var"] and v["type"] == "flag" for v in sd["vars"]), (d[1], stp)
for d in M["DemoStories"].DEMO:
    assert any(stp["t"] == "game" for x in M["Stories"].clean_story(d[7]())["scenes"] for stp in x["steps"]), (d[1], "each demo novel has a mini-game")
assert len(M["DemoStories"].DEMO) >= 9 and len({d[1] for d in M["DemoStories"].DEMO}) == len(M["DemoStories"].DEMO), "nine demo novels, no duplicates"
assert len({stp["game"] for d in M["DemoStories"].DEMO for x in M["Stories"].clean_story(d[7]())["scenes"] for stp in x["steps"] if stp["t"] == "game"}) == len(M["Stories"].GAMES), "the demo novels use every mini-game"


def off_stage(sd):
    """Python twin of NVT.offStage: lines spoken by a character with pictures who may not be on stage."""
    by = {x["id"]: x for x in sd["scenes"]}
    pics = {c["id"] for c in sd["chars"] if any(p.get("img") for p in c["poses"])}
    away, todo, found = {sd["start"]: set(pics)}, [sd["start"]], set()

    def flow(to, a):
        if to not in by:
            return
        cur = away.get(to)
        if cur is None or not a <= cur:
            away[to] = (cur or set()) | a
            if to not in todo:
                todo.append(to)
    while todo:
        s = by[todo.pop(0)]
        a, stop = set(away[s["id"]]), False
        for i, x in enumerate(s["steps"]):
            if x["t"] == "show" and not x.get("if"):
                a.discard(x["char"])
            elif x["t"] == "hide":
                a.add(x["char"])
            elif x["t"] == "say" and x.get("who") in a and x["who"] in pics:
                found.add((s["id"], i + 1, x["who"]))
            elif x["t"] == "jump":
                flow(x["to"], a)
                if not x.get("if"):
                    stop = True
                    break
            elif x["t"] == "game":
                for to in (x.get("win"), x.get("lose")):
                    if to:
                        flow(to, a)
        if not stop:
            for c in s["choices"]:
                flow(c["to"], a)
            if s["next"]:
                flow(s["next"], a)
    return found


assets = pathlib.Path(__file__).resolve().parents[2] / "theme" / "assets"
for d in M["DemoStories"].DEMO:
    sd = M["Stories"].clean_story(d[7]())
    assert not off_stage(sd), (d[1], "a character speaks without being on stage", sorted(off_stage(sd)))
    chars = {c["id"]: c for c in sd["chars"]}
    keys = [d[6], sd["settings"].get("title_img")] + [p["img"] for c in sd["chars"] for p in c["poses"]]
    for x in sd["scenes"]:
        for stp in x["steps"]:
            keys.append(stp.get("img"))
            if stp["t"] in ("show", "say") and stp.get("pose") and stp.get("char", stp.get("who")) in chars:
                assert stp["pose"] in [p["name"] for p in chars[stp.get("char", stp.get("who"))]["poses"]], (d[1], x["id"], stp)
            if stp["t"] in ("show", "hide"):
                assert stp["char"] in chars, (d[1], x["id"], stp)
    for k in keys:
        if k:
            assert k.startswith("demo:") and (assets / ("demo-%s.svg" % k[5:])).exists(), (d[1], "missing picture", k)
# the checker itself: a speaker who was never shown, or was hidden, is found; one shown on every path is not
probe = {"start": "a", "chars": [{"id": "m", "name": "M", "poses": [{"name": "n", "img": "demo:mira-neutral"}]}], "scenes": [
    {"id": "a", "steps": [{"t": "say", "who": "m", "text": "hi"}, {"t": "show", "char": "m"}, {"t": "say", "who": "m", "text": "ok"}], "choices": [{"to": "b"}, {"to": "c"}], "next": None},
    {"id": "b", "steps": [{"t": "hide", "char": "m"}], "choices": [], "next": "c"},
    {"id": "c", "steps": [{"t": "say", "who": "m", "text": "where am I"}], "choices": [], "next": None}]}
assert off_stage(probe) == {("a", 1, "m"), ("c", 1, "m")}, off_stage(probe)

# ---------------------------------------------------------------------------------- Privacy & Terms
if "legal_server" in M:
    as_user(ana)
    st = call("legal_state")
    assert st["signedIn"] and st["accepted_version"] is None
    ok(call("legal_accept", st["version"], "signup"))
    assert ana["legal_source"] == "signup" and call("legal_state")["accepted_version"] == st["version"]

# ---------------------------------------------------------------------------------- every callable is covered by a permission check
# A callable that changes data without require_user / a C.require_* check is a security hole. List the public ones here.
PUBLIC = {"get_me", "submit_feedback", "library", "get_play", "record_play", "report_story", "creator_page", "legal_state", "legal_accept"}
for name, (f, need) in sorted(anvil.server.CALLABLES.items()):
    if name in PUBLIC:
        continue
    assert need, "%s is callable by anyone: add require_user=True (or list it in PUBLIC in test_server.py)" % name

print("ALL OK (%d server functions)" % len(anvil.server.CALLABLES))
