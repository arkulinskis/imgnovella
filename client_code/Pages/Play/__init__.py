import json

from anvil import *
import anvil.server
from anvil.js import window

from ._anvil_designer import PlayTemplate
from ... import nv, router, state


def _loose(x):
    """Server replies are plain dicts; this keeps the validator from guessing narrower types."""
    return x


class Play(PlayTemplate):
    """#play/<slug>[/draft]: play a published novel (anyone), or the owner's draft. The player (Components/Player,
    theme/assets/nv-runtime.js), then the details: like, share, edit (creator), how many plays, the endings this reader
    found on this device and how readers' endings split, report, and "More by" the same creator. A play counts when
    the reader presses Start (record_play); drafts never count."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        self.slug = args[0] if args else ""
        self.draft = len(args) > 1 and args[1] == "draft"
        self.R = _loose(None)
        self.main.visible = self.more_box.visible = False
        self.error_box.visible = False
        state.heading(self.title, 1)
        try:
            r = _loose(anvil.server.call("get_play", self.slug, self.draft))
        except Exception as e:
            r = _loose({"ok": False, "error": "Something went wrong. Please try again."})
            print("get_play: %r" % e)
        if not r or not r.get("ok"):
            self.error_text.text = str((r or {}).get("error") or "This novel doesn't exist.")
            self.error_box.visible = True
            return
        self.R = r
        c = r["story"]
        window.document.title = c["title"] + " · ImgNovella"
        self.main.visible = True
        self.stage.classes["landscape"] = (r["data"].get("settings") or {}).get("orientation") == "landscape"
        self._draw()
        self.player.play(r["data"], ("draft-" if r.get("draft") else "") + self.slug, c["title"], c["author"],
                         self._started, self._ended)
        self._more()

    def leave(self):
        self.player.stop()

    # ---- the details
    def _mine(self):
        """Endings this reader reached on this device (the player's own storage)."""
        try:
            p = json.loads(window.localStorage.getItem("nvp:" + ("draft-" if self.draft else "") + self.slug) or "{}")
            return p.get("endings") or {}
        except Exception:
            return {}

    def _draw(self):
        R = self.R
        c = R["story"]
        s = c.get("stats") or {}
        self.draft_note.visible = bool(R.get("draft"))
        self.genre.text = c.get("genre") or "Story"
        self.rating.text = c.get("rating") or "Everyone"
        self.featured.visible = bool(c.get("featured"))
        self.title.text = c["title"]
        self.by.text = "by " + c["author"]
        self.bio.text = c.get("author_bio") or ""
        self.bio.visible = bool(c.get("author_bio"))
        self.blurb.text = c.get("blurb") or ""
        self.blurb.visible = bool(c.get("blurb"))
        self.tags.items = c.get("tags") or []
        self.tags.visible = bool(c.get("tags"))
        self._like_button()
        self.edit_link.visible = bool(c.get("can_edit"))
        if c.get("can_edit"):
            state.set_attr(self.edit_link, "href", router.href("edit", c["id"]))
        self.report_button.visible = not c.get("can_edit")
        self.plays.text = "{:,}".format(c.get("plays") or 0)
        self.endings.text = str(s.get("endings") or 0)
        self.minutes.text = "~%d" % (s.get("minutes") or 1)
        self._draw_endings()

    def _like_button(self):
        R = self.R
        liked = bool(R.get("liked"))
        self.like_button.text = "%s · %d" % ("Liked" if liked else "Like", R["story"].get("likes") or 0)
        self.like_button.role = ["btn", "btn-primary", "pl-liked", "ic-heart"] if liked else ["btn", "ic-heart"]
        state.set_control_attr(self.like_button, "aria-pressed", "true" if liked else "false")

    def _draw_endings(self):
        R = self.R
        scenes = [x for x in (R["data"].get("scenes") or []) if x.get("ending")]
        mine = self._mine()
        counts = R.get("ending_counts") or {}
        total = sum(counts.get(x["id"], 0) for x in scenes)
        kinds = nv.py_value(window.NV.ENDING_KINDS) or {}
        rows = []
        for x in scenes:
            e = x["ending"]
            n = counts.get(x["id"], 0)
            rows.append({"kind": e.get("kind") or "neutral", "kind_label": kinds.get(e.get("kind"), "Ending"),
                         "found": bool(mine.get(x["id"])), "title": str(window.NV.plain(e.get("title") or "", {})),
                         "pct": round(n * 100.0 / total) if total else 0, "total": total})
        self.ends_card.visible = bool(rows)
        self.ends.items = rows
        self.found.text = "· you found %d of %d" % (len([r for r in rows if r["found"]]), len(rows))

    def _more(self):
        try:
            m = state.call_quiet("creator_page", self.slug)
        except Exception:
            m = None
        stories = (m or {}).get("stories") or []
        self.more_box.visible = bool(stories)
        self.more_title.text = "More by " + self.R["story"]["author"]
        self.more.items = stories

    # ---- the player's hooks
    def _started(self):
        if not self.R.get("draft"):
            try:
                anvil.server.call_s("record_play", self.slug, "start")
            except Exception as e:
                print("record_play: %r" % e)

    def _ended(self, scene_id):
        if not self.R.get("draft"):
            try:
                anvil.server.call_s("record_play", self.slug, "ending", scene_id)
            except Exception as e:
                print("record_play: %r" % e)
        self._draw_endings()

    # ---- buttons
    @handle("like_button", "click")
    def like_button_click(self, **event_args):
        if not state.me():
            router.remember_after(window.location.hash)
            state.toast("Sign in to like novels")
            router.go("auth")
            return
        r = state.call("toggle_like", self.slug)
        if r:
            self.R["liked"] = r["liked"]
            self.R["story"]["likes"] = r["likes"]
            self._like_button()

    @handle("share_button", "click")
    def share_button_click(self, **event_args):
        c = self.R["story"]
        link = window.location.origin + window.location.pathname + "#play/" + self.slug
        if getattr(window.navigator, "share", None):
            try:
                window.navigator.share(nv.js_value({"title": c["title"], "text": 'Play "%s" on ImgNovella' % c["title"],
                                                    "url": link}))
            except Exception:
                pass  # the reader closed the share sheet
        else:
            nv.copy_text(link)

    @handle("report_button", "click")
    def report_button_click(self, **event_args):
        from ...Dialogs.Report import Report
        alert(Report(slug=self.slug), buttons=[], role="app-dialog", dismissible=True)
