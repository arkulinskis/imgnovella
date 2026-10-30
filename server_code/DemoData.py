"""Demo content, so the app never looks empty: three fictional creators and four published novels (built from
DemoStories, using only the built-in art). Loaded automatically the first time anyone opens the app
(ensure_loaded), removed or reloaded from Admin -> Demo data. Removing it is remembered: it doesn't come back.

Demo users have is_demo=True and @example.com emails; they can't sign in (no password). Every demo row is
flagged is_demo=True, so remove() deletes exactly what load() added (plus likes and reports real people left
on the demo novels, which would otherwise point at deleted rows).
"""
import datetime as dt

from anvil.tables import app_tables

from . import common as C

DEMO_USERS = [
    ("Mika Rowan", "mika.demo@example.com", "Writes cozy stories about cats, books and spring."),
    ("Jules Okafor", "jules.demo@example.com", "Night trains, small mysteries, big twists."),
    ("Saoirse Vale", "saoirse.demo@example.com", "Comedy first, feelings second. Usually."),
]
# Tables that hold demo rows (each has an is_demo column). Children before parents.
DEMO_TABLES = ["likes", "stories"]


def state():
    return C.get_setting("demo", "never")  # "never" | "loaded" | "removed"


def ensure_loaded():
    """Call from the app's main data callables: loads the demo once, unless an admin removed it."""
    if state() == "never":
        load()


def load():
    from . import DemoStories, Stories
    remove(remember=False)
    users = []
    for name, email, bio in DEMO_USERS:
        u = app_tables.users.get(email=email) or app_tables.users.add_row(email=email, enabled=False)
        u.update(display_name=name, is_demo=True, bio=bio, plan="pro", signed_up=C.now() - dt.timedelta(days=60))
        users.append(u)
    for who, title, blurb, genre, tags, rating, cover, build, plays, likes, featured, days in DemoStories.DEMO:
        data = Stories.clean_story(build())
        when = C.now() - dt.timedelta(days=days)
        stats = Stories.story_stats(data)
        endings = [s for s in data["scenes"] if s.get("ending")]
        share = [0.42, 0.27, 0.19, 0.12]
        ending_counts = {s["id"]: int(plays * 0.7 * share[i % 4]) for i, s in enumerate(endings)}
        app_tables.stories.add_row(owner=users[who], slug=Stories.new_slug(), title=title, blurb=blurb, genre=genre, tags=tags,
                                   rating=rating, cover=cover, data=data, published=data, status="public", stats=stats,
                                   plays=plays, likes=likes, ending_counts=ending_counts, featured=featured, hidden=False,
                                   created=when, updated=when, published_at=when, is_demo=True)
    C.set_setting("demo", "loaded")
    return counts()


def remove(remember=True):
    for s in app_tables.stories.search(is_demo=True):
        for t in (app_tables.likes, app_tables.reports, app_tables.images):
            for x in t.search(story=s):
                x.delete()
    for name in DEMO_TABLES:
        for r in getattr(app_tables, name).search(is_demo=True):
            r.delete()
    for u in app_tables.users.search(is_demo=True):
        u.delete()
    if remember:
        C.set_setting("demo", "removed")
    return counts()


def counts():
    out = {"users": len(app_tables.users.search(is_demo=True))}
    for name in DEMO_TABLES:
        out[name] = len(getattr(app_tables, name).search(is_demo=True))
    return out
