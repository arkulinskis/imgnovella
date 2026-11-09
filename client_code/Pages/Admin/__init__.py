from anvil import *

from ._anvil_designer import AdminTemplate
from ... import state

TABS = ["overview", "feedback", "novels", "reports", "users", "demo"]


class Admin(AdminTemplate):
    """#admin/<tab>: overview numbers, the old feedback inbox (incl. Pro requests), novels (feature / take down),
    readers' reports, users (Pro plan, admin, active) and the demo data. Each tab is its own address."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        self.tab = args[0] if args and args[0] in TABS else "overview"
        self._filter = "new"
        self._novel_filter = "published"
        self._report_filter = "open"
        parts = {"overview": self.overview_part, "feedback": self.feedback_part, "novels": self.novels_part,
                 "reports": self.reports_part, "users": self.users_part, "demo": self.demo_part}
        tabs = {"overview": self.tab_overview, "feedback": self.tab_feedback, "novels": self.tab_novels,
                "reports": self.tab_reports, "users": self.tab_users, "demo": self.tab_demo}
        for name in TABS:
            parts[name].visible = name == self.tab
            tabs[name].classes["on"] = name == self.tab
        self.feedback_panel.add_event_handler("x-changed", self._feedback_changed)
        self.reports_panel.add_event_handler("x-changed", self._reports_changed)
        state.set_control_attr(self.novel_search, "aria-label", "Search novels")
        state.set_control_attr(self.search_box, "aria-label", "Search people")
        getattr(self, "_" + self.tab)()

    # ---- overview
    def _overview(self):
        d = state.call("admin_overview")
        if not d:
            return
        for label, key in ((self.s_users, "users"), (self.s_pro, "pro"), (self.s_novels, "novels"),
                           (self.s_published, "published"), (self.s_images, "images"),
                           (self.s_feedback, "feedback_new"), (self.s_reports, "reports_open")):
            label.text = str(d.get(key, 0))
        self.s_plays.text = "{:,}".format(d.get("plays", 0))
        self.demo_line.text = "Demo data is %s (%d demo people). Manage it in the Demo data tab." % (
            d["demo"]["state"], d["demo"]["counts"].get("users", 0))

    # ---- feedback
    def _feedback(self):
        d = state.call("list_feedback", None)
        if not d:
            return
        items = [i for i in d["items"] if self._filter == "all" or i["status"] == self._filter]
        self.feedback_panel.items = items
        self.no_feedback.visible = not items
        labels = {"new": "New", "read": "Read", "done": "Done", "all": "All"}
        for key, el in (("new", self.f_new), ("read", self.f_read), ("done", self.f_done), ("all", self.f_all)):
            n = len(d["items"]) if key == "all" else d["counts"].get(key, 0)
            el.text = "%s (%d)" % (labels[key], n)
            el.role = ["seg", "on"] if key == self._filter else ["seg"]

    def _set_filter(self, value):
        self._filter = value
        self._feedback()

    @handle("f_new", "click")
    def f_new_click(self, **event_args):
        self._set_filter("new")

    @handle("f_read", "click")
    def f_read_click(self, **event_args):
        self._set_filter("read")

    @handle("f_done", "click")
    def f_done_click(self, **event_args):
        self._set_filter("done")

    @handle("f_all", "click")
    def f_all_click(self, **event_args):
        self._set_filter("all")

    def _feedback_changed(self, **event_args):
        self._feedback()

    # ---- novels
    def _novels(self):
        d = state.call("admin_stories", (self.novel_search.text or "").strip() or None, self._novel_filter)
        if not d:
            return
        self.novels_panel.items = d["stories"]
        self.no_novels.visible = not d["stories"]
        for key, el in (("published", self.n_published), ("featured", self.n_featured), ("hidden", self.n_hidden),
                        ("all", self.n_all)):
            el.role = ["seg", "on"] if key == self._novel_filter else ["seg"]

    def _set_novel_filter(self, value):
        self._novel_filter = value
        self._novels()

    @handle("n_published", "click")
    def n_published_click(self, **event_args):
        self._set_novel_filter("published")

    @handle("n_featured", "click")
    def n_featured_click(self, **event_args):
        self._set_novel_filter("featured")

    @handle("n_hidden", "click")
    def n_hidden_click(self, **event_args):
        self._set_novel_filter("hidden")

    @handle("n_all", "click")
    def n_all_click(self, **event_args):
        self._set_novel_filter("all")

    @handle("novel_search", "pressed_enter")
    def novel_search_pressed_enter(self, **event_args):
        self._novels()

    @handle("novel_search_button", "click")
    def novel_search_button_click(self, **event_args):
        self._novels()

    # ---- reports
    def _reports(self):
        d = state.call("list_reports", self._report_filter)
        if not d:
            return
        self.reports_panel.items = d["reports"]
        self.no_reports.visible = not d["reports"]
        for key, el in (("open", self.r_open), ("all", self.r_all)):
            el.role = ["seg", "on"] if key == self._report_filter else ["seg"]

    @handle("r_open", "click")
    def r_open_click(self, **event_args):
        self._report_filter = "open"
        self._reports()

    @handle("r_all", "click")
    def r_all_click(self, **event_args):
        self._report_filter = "all"
        self._reports()

    def _reports_changed(self, **event_args):
        self._reports()

    # ---- users
    def _users(self, query=None):
        d = state.call("list_users", query or None)
        if not d:
            return
        self.users_panel.items = d["users"]
        self.users_count.text = state.plural(d["total"], "person", "people")

    @handle("search_box", "pressed_enter")
    def search_box_pressed_enter(self, **event_args):
        self._users(self.search_box.text)

    @handle("search_button", "click")
    def search_button_click(self, **event_args):
        self._users(self.search_box.text)

    # ---- demo data
    def _demo(self):
        d = state.call("admin_overview")
        if not d:
            return
        demo = d["demo"]
        counts = ", ".join("%s %s" % (v, k) for k, v in demo["counts"].items())
        self.demo_status.text = "Status: %s · %s" % (demo["state"], counts)
        self.demo_load_button.text = "Reload demo data" if demo["state"] == "loaded" else "Load demo data"

    @handle("demo_load_button", "click")
    def demo_load_button_click(self, **event_args):
        if confirm("Demo people and novels are added (any old demo rows are replaced).", title="Load the demo data?",
                   buttons=[("Cancel", False), ("Load", True)], role="app-dialog"):
            if state.call("demo_load"):
                state.toast("Done", "ok")
                self._demo()

    @handle("demo_remove_button", "click")
    def demo_remove_button_click(self, **event_args):
        if confirm("Every demo row is deleted. Real data stays.", title="Remove the demo data?",
                   buttons=[("Cancel", False), ("Remove", True)], role="app-dialog"):
            if state.call("demo_remove"):
                state.toast("Done", "ok")
                self._demo()
