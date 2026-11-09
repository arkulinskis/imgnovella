from anvil import *

from ._anvil_designer import StudioTemplate
from ... import router, state


class Studio(StudioTemplate):
    """#studio (home after signing in): the creator's novels (cover, status, numbers, Edit / Play / Duplicate /
    Delete), totals, the plan card, and New novel (Dialogs/NewNovel: blank or the starter story, portrait or
    landscape)."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        self.list.add_event_handler("x-duplicate", self._duplicate)
        self.list.add_event_handler("x-delete", self._delete)
        state.heading(self.hello, 1)
        self.load()

    def load(self):
        d = state.call("studio_home")
        if not d:
            return
        me = state.me() or {}
        first = (me.get("name") or "there").split(" ")[0]
        stories, t, L = d["stories"], d["totals"], d["limits"]
        self.hello.text = ("Welcome back, %s!" if stories else "Let's make your first novel, %s!") % first
        self.lead.text = ("Pick up where you left off, or start something new." if stories
                          else "Start blank, or from a finished example you can pull apart and remix.")
        self.stats.visible = bool(stories)
        self.t_novels.text = str(t["novels"])
        self.t_published.text = str(t["published"])
        self.t_plays.text = "{:,}".format(t["plays"])
        self.t_likes.text = "{:,}".format(t["likes"])
        self.list.items = stories
        self.count_line.text = "%d of %d on %s" % (len(stories), L["novels"], L["label"])
        self.plan_card.visible = L.get("plan") != "pro"
        self.plan_line.text = ("Pictures up to 400 × 600, %d novels, %d pictures each, and a small \"Made with "
                               "ImgNovella\" credit on exports." % (L["novels"], L["images"]))

    def _new(self):
        from ...Dialogs.NewNovel import NewNovel
        r = alert(NewNovel(), buttons=[], role="app-dialog", dismissible=True)
        if r:
            state.toast("Created! Have fun.", "ok")
            router.go("edit", r["id"], "map" if r["template"] == "starter" else "write")

    @handle("new_button", "click")
    def new_button_click(self, **event_args):
        self._new()

    def new_tile_click(self, event):
        self._new()

    def _duplicate(self, story=None, **event_args):
        if story and state.call("duplicate_story", story["id"]):
            state.toast("Duplicated", "ok")
            self.load()

    def _delete(self, story=None, **event_args):
        if not story:
            return
        if confirm("Its scenes, pictures, likes and stats are deleted for good.", title='Delete "%s"?' % story["title"],
                   buttons=[("Cancel", False), ("Delete", True)], role="app-dialog"):
            if state.call("delete_story", story["id"]):
                state.toast("Deleted")
                self.load()
