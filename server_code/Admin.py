"""Admin page callables: overview, users (admin, active, Pro plan), novels (feature, hide), reports, demo data.
Admins only. Feedback admin calls live in Feedback.py."""
import anvil.server
from anvil.tables import app_tables
import anvil.tables as tables

from . import common as C
from . import DemoData, Feedback, Stories


@anvil.server.callable(require_user=True)
def admin_overview():
    C.require_admin()
    stories = list(app_tables.stories.search())
    real_users = [u for u in app_tables.users.search() if not u["is_demo"]]
    return {"users": len(real_users),
            "admins": len(app_tables.users.search(is_admin=True)),
            "pro": len([u for u in real_users if u["plan"] == "pro"]),
            "feedback_new": Feedback.new_count(),
            "novels": len(stories),
            "published": len([s for s in stories if s["status"] in ("public", "unlisted")]),
            "plays": sum(int(s["plays"] or 0) for s in stories),
            "images": len(app_tables.images.search()),
            "reports_open": len(app_tables.reports.search(status="open")),
            "demo": {"state": DemoData.state(), "counts": DemoData.counts()}}


def _user(u):
    return {"id": u.get_id(), "email": u["email"], "name": C.name_of(u), "is_admin": C.is_admin(u),
            "enabled": u["enabled"] is not False, "joined": C.iso(u["signed_up"]), "last_seen": C.iso(u["last_seen"]),
            "plan": C.plan_of(u), "novels": len(app_tables.stories.search(owner=u))}


@anvil.server.callable(require_user=True)
def list_users(query=None):
    C.require_admin()
    query = C.text(query, 80).lower()
    rows = [u for u in app_tables.users.search(tables.order_by("signed_up", ascending=False)) if not u["is_demo"]]
    if query:
        rows = [u for u in rows if query in (u["email"] or "").lower() or query in (u["display_name"] or "").lower()]
    return {"users": [_user(u) for u in rows[:200]], "total": len(rows)}


@anvil.server.callable(require_user=True)
def set_admin(user_id, flag):
    me = C.require_admin()
    u = C.row_by_id(app_tables.users, user_id)
    if u is None:
        return C.fail("That account no longer exists.")
    if u == me and not flag:
        return C.fail("You can't remove your own admin rights.")
    u["is_admin"] = bool(flag)
    return C.ok(user=_user(u))


@anvil.server.callable(require_user=True)
def set_enabled(user_id, flag):
    me = C.require_admin()
    u = C.row_by_id(app_tables.users, user_id)
    if u is None:
        return C.fail("That account no longer exists.")
    if u == me:
        return C.fail("You can't disable your own account.")
    u["enabled"] = bool(flag)
    return C.ok(user=_user(u))


@anvil.server.callable(require_user=True)
def set_plan(user_id, plan):
    C.require_admin()
    u = C.row_by_id(app_tables.users, user_id)
    if u is None:
        return C.fail("That account no longer exists.")
    if plan not in C.PLANS:
        return C.fail("Unknown plan.")
    u["plan"] = plan
    return C.ok(user=_user(u))


# ----------------------------------------------------------------------------------------------- novels + reports
@anvil.server.callable(require_user=True)
def admin_stories(query=None, which="published"):
    me = C.require_admin()
    rows = list(app_tables.stories.search(tables.order_by("updated", ascending=False)))
    if which == "published":
        rows = [r for r in rows if r["status"] in ("public", "unlisted")]
    elif which == "featured":
        rows = [r for r in rows if r["featured"]]
    elif which == "hidden":
        rows = [r for r in rows if r["hidden"]]
    q = C.text(query, 80).lower()
    if q:
        rows = [r for r in rows if q in ((r["title"] or "") + " " + C.name_of(r["owner"])).lower()]
    out = []
    for r in rows[:150]:
        c = Stories.card(r, me)
        c["reports"] = len(app_tables.reports.search(story=r, status="open"))
        out.append(c)
    return {"stories": out, "total": len(rows)}


@anvil.server.callable(require_user=True)
def admin_set_story(story_id, field, flag):
    me = C.require_admin()
    r = C.row_by_id(app_tables.stories, story_id)
    if r is None:
        return C.fail("That novel no longer exists.")
    if field not in ("featured", "hidden"):
        return C.fail("Unknown setting.")
    r[field] = bool(flag)
    return C.ok(story=Stories.card(r, me))


@anvil.server.callable(require_user=True)
def list_reports(status="open"):
    C.require_admin()
    rows = app_tables.reports.search(tables.order_by("created", ascending=False))
    out = []
    for r in rows:
        if status != "all" and r["status"] != status:
            continue
        s = r["story"]
        out.append({"id": r.get_id(), "reason": r["reason"], "status": r["status"], "created": C.iso(r["created"]),
                    "by": C.name_of(r["user"]) if r["user"] else "Guest",
                    "story": {"id": s.get_id(), "slug": s["slug"], "title": s["title"], "author": C.name_of(s["owner"]),
                              "hidden": bool(s["hidden"])} if s else None})
    return {"reports": out[:200]}


@anvil.server.callable(require_user=True)
def resolve_report(report_id, action):
    """action: "dismiss" (nothing wrong) or "hide" (take the novel down; its creator can still edit it)."""
    C.require_admin()
    r = C.row_by_id(app_tables.reports, report_id)
    if r is None:
        return C.fail("That report no longer exists.")
    if action not in ("dismiss", "hide"):
        return C.fail("Unknown action.")
    if action == "hide" and r["story"] is not None:
        r["story"]["hidden"] = True
        for other in app_tables.reports.search(story=r["story"], status="open"):
            other["status"] = "hidden"
    r["status"] = "hidden" if action == "hide" else "dismissed"
    return C.ok()


@anvil.server.callable(require_user=True)
def demo_load():
    C.require_admin()
    DemoData.load()
    return C.ok(demo={"state": DemoData.state(), "counts": DemoData.counts()})


@anvil.server.callable(require_user=True)
def demo_remove():
    C.require_admin()
    DemoData.remove()
    return C.ok(demo={"state": DemoData.state(), "counts": DemoData.counts()})
