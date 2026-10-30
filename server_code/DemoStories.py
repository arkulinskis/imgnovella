"""The demo novels (and the "starter" template new creators can copy). They use only the built-in art
(demo:* pictures, drawn by tools/make_art.py), so they need no uploads. Each function returns a story
document in the shape Stories.clean_story keeps.

They show off the features: name input, conditional lines, choice effects, locked choices with hints,
"once" choices around a hub scene, a timed choice, conditional jumps, CGs, chapter cards, music moods,
sound effects and several kinds of ending.
"""
_n = [0]


def _k():
    _n[0] += 1
    return "d%d" % _n[0]


def say(who, text, pose=None, cond=None):
    d = {"t": "say", "who": who, "text": text, "k": _k()}
    if pose:
        d["pose"] = pose
    if cond:
        d["if"] = cond
    return d


def nar(text, cond=None):
    return say(None, text, None, cond)


def step(t, cond=None, **kw):
    d = {"t": t, "k": _k()}
    d.update(kw)
    if cond:
        d["if"] = cond
    return d


def bg(img, fx="fade"):
    return step("bg", img="demo:" + img, fx=fx)


def show(char, pose, pos="center", fx="dissolve", cond=None):
    return step("show", cond, char=char, pose=pose, pos=pos, fx=fx)


def hide(char, fx="dissolve"):
    return step("hide", char=char, fx=fx)


def setv(var, op, val, cond=None):
    return step("set", cond, var=var, op=op, val=val)


def choice(cid, text, to, cond="", mode="hide", hint="", once=False, effects=None):
    return {"id": cid, "text": text, "to": to, "if": cond, "mode": mode, "hint": hint, "once": once, "set": effects or []}


def eff(var, op, val):
    return {"var": var, "op": op, "val": val}


def scene(sid, name, x, y, steps, choices=None, nxt=None, ending=None, timer=0, timeout=None, note=""):
    return {"id": sid, "name": name, "x": x, "y": y, "steps": steps, "choices": choices or [], "next": nxt,
            "ending": ending, "timer": timer, "timeout": timeout, "note": note}


def end(kind, title, text):
    return {"kind": kind, "title": title, "text": text}


def char(cid, name, color, base, poses):
    return {"id": cid, "name": name, "color": color, "poses": [{"name": p, "img": "demo:%s-%s" % (base, p)} for p in poses]}


EXPR = ["neutral", "happy", "sad", "surprised", "angry", "shy"]


# ------------------------------------------------------------------------------------------- 1. Cherry Blossom Promise
def cherry():
    return {
        "settings": {"orientation": "portrait", "textbox": "sakura", "accent": "#ff4f8b", "font": "rounded", "cps": 45,
                     "title_img": "demo:cover-cherry", "title_music": "romance",
                     "credits": "Story: Mika Rowan\nArt: the ImgNovella starter pack\nMade with ImgNovella"},
        "chars": [char("mira", "Mira", "#ff4f8b", "mira", EXPR), char("sol", "Sol", "#ff9a3c", "sol", EXPR),
                  {"id": "you", "name": "[player]", "color": "#26a7a1", "poses": []}],
        "vars": [{"name": "player", "type": "text", "init": "Aki", "note": "The reader's name"},
                 {"name": "courage", "type": "number", "init": 0, "note": "Goes up each time you reach out to Mira"},
                 {"name": "saw_sketch", "type": "flag", "init": False, "note": "You admitted you peeked at her drawings"},
                 {"name": "promised", "type": "flag", "init": False, "note": "You promised to come on Friday"}],
        "start": "c_start",
        "scenes": [
            scene("c_start", "Petals on the path", 0, 0, [
                step("card", title="Cherry Blossom Promise", sub="Spring. The first week of term."),
                bg("bg-sakura-park"), step("music", track="calm"),
                nar("The cherry trees along the river path burst into bloom overnight."),
                step("input", var="player", prompt="What's your name?", dflt="Aki"),
                nar("Every spring I tell myself I'll stop and actually look at them. Every spring, I'm late for something."),
                step("sfx", name="whoosh"), step("fx", name="shake"),
                nar("A gust of wind{w=0.4}, and a storm of paper flies past my face."),
                show("mira", "surprised"),
                say("mira", "Ah! My sketches! No no no no no{w=0.3}, not the river!"),
            ], [choice("c1", "Chase the sketches down with her", "c_chase", effects=[eff("courage", "+", 1)]),
                choice("c2", "Keep walking. You're already late.", "c_late")]),
            scene("c_chase", "Paper chase", -240, 190, [
                step("sfx", name="sparkle"),
                show("mira", "happy"),
                say("mira", "You caught the last one! You're fast, um..."),
                say("you", "[player]."),
                say("mira", "[player]! I'm Mira. Thank you, *really*. These are for the art club exhibition."),
                show("mira", "shy", fx="none"),
                say("mira", "...You didn't look at them, did you? They're not finished."),
            ], [choice("c3", "Admit you peeked. They're beautiful.", "c_tree", effects=[eff("courage", "+", 1), eff("saw_sketch", "=", True)]),
                choice("c4", "Promise you didn't look.", "c_tree")]),
            scene("c_late", "The long way round", 240, 190, [
                bg("bg-classroom"),
                nar("I make it to class with a minute to spare. Somehow, it doesn't feel like winning."),
                show("sol", "happy", "right"),
                say("sol", "Yo, [player]! You look like you lost a fight with a tree."),
                show("sol", "neutral", "right", "none"),
                say("sol", "Did you hear? Someone in art club lost half their exhibition sketches in the river this morning."),
                nar("A strange weight settles in my chest.", "courage == 0"),
            ], [choice("c5", "Find the art club after school", "c_club", effects=[eff("courage", "+", 1)]),
                choice("c6", "Not my problem.", "c_wind")]),
            scene("c_tree", "Under the oldest tree", -240, 380, [
                show("mira", "neutral"),
                say("mira", "Beautiful? Nobody's ever said that about my drawings before.", "happy", "saw_sketch"),
                say("mira", "Good. Then you'll see them for the first time at the exhibition. Deal?", "happy", "not saw_sketch"),
                say("mira", "It's on Friday evening, under the oldest tree by the river."),
                show("mira", "shy", fx="none"),
                say("mira", "Would you... come?"),
            ], [choice("c7", "\"I'll be there. I promise.\"", "c_friday", effects=[eff("courage", "+", 1), eff("promised", "=", True)]),
                choice("c8", "\"Maybe, if I'm free.\"", "c_friday")]),
            scene("c_club", "Art club, after hours", 240, 380, [
                bg("bg-library"), show("mira", "sad"),
                say("mira", "Thirty sketches, gone. The exhibition is on Friday."),
                nar("She doesn't know me. But she looks exactly how I felt this morning."),
            ], [choice("c9", "Offer to help her redraw them", "c_friday", effects=[eff("courage", "+", 1), eff("promised", "=", True)]),
                choice("c10", "Tell her it'll be okay, then leave", "c_friends")]),
            scene("c_friday", "Friday", 0, 570, [
                step("card", title="Friday", sub="The exhibition"),
                bg("bg-sakura-night"), step("music", track="romance"),
                step("jump", to="c_friends", **{"if": "courage < 2"}),
                show("mira", "happy"),
                say("mira", "You came! I wasn't sure you would."),
                say("mira", "Silly. You promised, didn't you?", "shy", "promised"),
                say("mira", "This is the last drawing. I finished it last night."),
                step("cg", img="demo:cg-promise"),
                nar("It's the two of us, under this very tree, petals everywhere."),
                step("cg", img=""),
            ], [choice("c11", "Tell her how you feel", "c_promise", cond="courage >= 3", mode="lock", hint="You need a little more courage"),
                choice("c12", "Tell her the drawing is perfect", "c_friends")], timer=12, timeout="c12"),
            scene("c_promise", "The Promise", -240, 760, [
                show("mira", "shy"),
                say("mira", "...Then let's make it a promise. Every spring, under this tree."),
                step("sfx", name="chime"),
            ], ending=end("true", "The Promise", "Some promises are written in petals. Yours was written in both of your sketchbooks.")),
            scene("c_friends", "Just friends", 0, 760, [
                bg("bg-sakura-night"), show("mira", "happy"),
                say("mira", "Friends who look at cherry blossoms together. I like that, [player]."),
            ], ending=end("neutral", "Friends Under the Blossoms", "Not every spring story is a love story. This one is still a good one.")),
            scene("c_wind", "Petals in the wind", 480, 570, [
                bg("bg-rooftop-sunset"), step("music", track="sad"),
                nar("By Friday, the blossoms are gone. I never do find out whose sketches they were."),
            ], ending=end("bad", "Petals in the Wind", "Some chances only blow past once.")),
        ]}


# ------------------------------------------------------------------------------------------- 2. The Last Train Home
def train():
    return {
        "settings": {"orientation": "landscape", "textbox": "midnight", "accent": "#8fe3df", "font": "sans", "cps": 40,
                     "title_img": "demo:bg-station-night", "title_music": "mystery",
                     "credits": "Story: Jules Okafor\nMade with ImgNovella"},
        "chars": [char("ren", "Ren", "#8a93d6", "ren", EXPR), char("kuro", "Kuro", "#ffd24a", "kuro", ["neutral", "happy", "surprised"]),
                  {"id": "cond", "name": "Conductor", "color": "#8fe3df", "poses": [{"name": "neutral", "img": "demo:stranger-neutral"}, {"name": "smile", "img": "demo:stranger-smile"}]}],
        "vars": [{"name": "clues", "type": "number", "init": 0, "note": "Things you noticed on the platform"},
                 {"name": "ticket", "type": "flag", "init": False, "note": "Found the ticket under the bench"},
                 {"name": "fed_cat", "type": "flag", "init": False, "note": "Made friends with Kuro"}],
        "start": "t_start",
        "scenes": [
            scene("t_start", "Platform 0", 0, 0, [
                step("card", title="The Last Train Home", sub="11:58 PM"),
                bg("bg-station-night"), step("music", track="mystery"),
                nar("The last train should have left an hour ago."),
                show("ren", "surprised", "left"),
                say("ren", "Wait. This station doesn't *have* a platform zero."),
                show("kuro", "neutral", "right"),
                say("kuro", "Mrrp."),
                say("ren", "...And now there's a cat.", "neutral"),
            ], nxt="t_hub"),
            scene("t_hub", "Look around", 0, 190, [
                say("ren", "Okay. Think. Look around before doing anything stupid.", "neutral", "clues == 0"),
                say("ren", "What else is here?", "neutral", "clues > 0"),
            ], [choice("t1", "Read the timetable", "t_table", once=True),
                choice("t2", "Look under the bench", "t_bench", once=True),
                choice("t3", "Pet the cat", "t_cat", once=True),
                choice("t4", "Wait for the train", "t_midnight")]),
            scene("t_table", "The timetable", -380, 380, [
                show("ren", "neutral", "left", "none"),
                say("ren", "Every line says the same thing: {color=#8fe3df}LAST TRAIN, 00:00, HOME{/color}."),
                setv("clues", "+", 1),
                say("ren", "Home. Whose home?", "sad"),
            ], nxt="t_hub"),
            scene("t_bench", "Under the bench", -130, 380, [
                step("sfx", name="chime"),
                nar("Something glints between the slats."),
                setv("ticket", "=", True), setv("clues", "+", 1),
                say("ren", "A ticket. One way. No destination printed.", "happy"),
            ], nxt="t_hub"),
            scene("t_cat", "The cat", 130, 380, [
                show("kuro", "happy", "right", "none"),
                say("kuro", "Mrrrrrp!"),
                nar("The cat leans into my hand, then drops something at my feet: a tiny key shaped like a fish."),
                setv("fed_cat", "=", True), setv("clues", "+", 1),
            ], nxt="t_hub"),
            scene("t_midnight", "Midnight", 0, 570, [
                step("sfx", name="bell"), step("fx", name="flash"),
                hide("kuro"), show("cond", "neutral", "right"),
                say("cond", "Tickets, please."),
                say("ren", "I... think I have one?", "surprised", "ticket"),
            ], [choice("t5", "Show the ticket", "t_board", cond="ticket", mode="lock", hint="You don't have a ticket"),
                choice("t6", "Ask where the train goes", "t_question"),
                choice("t7", "Run for the stairs", "t_missed")], timer=10, timeout="t6"),
            scene("t_board", "All aboard", -240, 760, [
                step("cg", img="demo:cg-train"),
                say("cond", "Home, of course. Wherever that is for you.", "smile"),
                step("jump", to="t_secret", **{"if": "fed_cat and clues >= 3"}),
                step("cg", img=""),
            ], nxt="t_home"),
            scene("t_question", "The question", 240, 760, [
                show("cond", "neutral", "right", "none"),
                say("cond", "Where it always goes. In circles."),
                say("ren", "That's... not comforting.", "sad"),
            ], [choice("t8", "Board anyway", "t_endless"), choice("t9", "Step back from the edge", "t_missed")]),
            scene("t_home", "Home at last", -380, 950, [
                bg("bg-bedroom"), step("music", track="calm"),
                nar("I wake up in my own bed, still holding a ticket with no destination."),
            ], ending=end("good", "Home at Last", "Some trains only run for people who are lost.")),
            scene("t_secret", "Kuro's secret", -130, 950, [
                step("cg", img=""), show("kuro", "happy", "center"),
                say("kuro", "Took you long enough, human."),
                say("ren", "THE CAT TALKS?!", "surprised"),
                say("kuro", "The cat *drives*. Sit down, we're going somewhere much better than home."),
            ], ending=end("secret", "Kuro's Secret", "You found every clue and made a friend. The conductor was never the one in charge.")),
            scene("t_endless", "The endless line", 130, 950, [
                step("music", track="tension"), step("fx", name="fade"),
                nar("The doors close. The next station is Platform 0. So is the one after that."),
            ], ending=end("bad", "The Endless Line", "Never board a train that won't say where it's going.")),
            scene("t_missed", "Missed it", 380, 950, [
                bg("bg-station-night"), hide("cond"),
                nar("The train pulls away without me. In the morning, Platform 0 is gone. So is the cat."),
            ], ending=end("neutral", "Missed It", "Maybe it's better not to know.")),
        ]}


# ------------------------------------------------------------------------------------------- 3. Rooftop Club
def rooftop():
    return {
        "settings": {"orientation": "portrait", "textbox": "paper", "accent": "#ff9a3c", "font": "rounded", "cps": 50,
                     "title_img": "demo:cover-rooftop", "title_music": "upbeat",
                     "credits": "Story: Saoirse Vale\nMade with ImgNovella"},
        "chars": [char("sol", "Sol", "#ff9a3c", "sol", EXPR), char("mira", "Mira", "#ff4f8b", "mira", EXPR), char("ren", "Ren", "#8a93d6", "ren", EXPR)],
        "vars": [{"name": "snacks", "type": "number", "init": 0, "note": "Snacks brought to the club"},
                 {"name": "title", "type": "text", "init": "Member", "note": "Your club title"}],
        "start": "r_start",
        "scenes": [
            scene("r_start", "The proposal", 0, 0, [
                bg("bg-rooftop-sunset"), step("music", track="upbeat"),
                show("sol", "happy"),
                say("sol", "I'm founding a club. The **Rooftop Club**. Members: me. And you, as of now."),
            ], [choice("r1", "\"What does the club do?\"", "r_plan"),
                choice("r2", "\"Do I get a title?\"", "r_plan", effects=[eff("title", "=", "Vice President")])]),
            scene("r_plan", "Club activities", 0, 190, [
                say("sol", "Congratulations, [title]!", "happy", "title == \"Vice President\""),
                say("sol", "We eat lunch. On the roof. Officially."),
                show("sol", "neutral", "right", "none"), show("mira", "surprised", "left"),
                say("mira", "Is that... allowed?"),
                say("sol", "It is now that we're a club!", "happy"),
            ], [choice("r3", "Bring strawberry buns for everyone", "r_inspect", effects=[eff("snacks", "+", 3)]),
                choice("r4", "Bring only your own lunch", "r_inspect")]),
            scene("r_inspect", "The inspection", 0, 380, [
                step("card", title="One week later"),
                step("sfx", name="knock"), hide("mira", "none"),
                show("ren", "angry", "left"),
                say("ren", "Student council. I'm here to inspect the so-called \"Rooftop Club\"."),
                say("ren", "...Are those strawberry buns?", "shy", "snacks >= 3"),
            ], [choice("r5", "Offer Ren a bun", "r_good", cond="snacks >= 3", mode="lock", hint="You have nothing to share"),
                choice("r6", "Argue that rooftops are a human right", "r_bad")]),
            scene("r_good", "Club approved", -200, 570, [
                show("ren", "happy", "left", "none"),
                say("ren", "Club approved. I'll be... checking in. Daily. For safety reasons."),
                say("sol", "That's three members and a bun budget!", "happy"),
            ], ending=end("good", "Three Members and a Bun", "The Rooftop Club meets every lunchtime. Attendance: perfect.")),
            scene("r_bad", "Banned", 200, 570, [
                show("ren", "angry", "left", "none"), step("fx", name="shake"),
                say("ren", "Rooftops are a *fire exit*. The club is cancelled."),
                say("sol", "...We'll meet in the stairwell. Secretly. The Stairwell Club.", "sad"),
            ], ending=end("bad", "Banned from the Roof", "History will remember the Stairwell Club. Probably.")),
        ]}


# ------------------------------------------------------------------------------------------- 4. Library After Hours
def library():
    return {
        "settings": {"orientation": "landscape", "textbox": "pixel", "accent": "#8a7ad6", "font": "serif", "cps": 40,
                     "title_img": "demo:cover-library", "title_music": "mystery",
                     "credits": "Story: Mika Rowan\nMade with ImgNovella"},
        "chars": [char("kuro", "Kuro", "#ffd24a", "kuro", ["neutral", "happy", "surprised"]), char("mira", "Mira", "#ff4f8b", "mira", EXPR)],
        "vars": [{"name": "brave", "type": "flag", "init": False, "note": ""}],
        "start": "l_start",
        "scenes": [
            scene("l_start", "Closing time", 0, 0, [
                bg("bg-library"), step("music", track="mystery"),
                nar("The library closes at nine. I did not leave at nine."),
                show("kuro", "neutral"),
                say("kuro", "Mrrp."),
                nar("A black cat walks straight into a bookshelf. *Through* it."),
            ], [choice("l1", "Follow the cat", "l_shelves", effects=[eff("brave", "=", True)]),
                choice("l2", "Go home like a normal person", "l_home")]),
            scene("l_shelves", "Between the shelves", -200, 190, [
                step("fx", name="flash"), hide("kuro", "none"), show("mira", "surprised"),
                say("mira", "You can see the doorway too?"),
                say("mira", "Welcome to the Unwritten Wing. Every book here is a story nobody finished.", "happy"),
            ], [choice("l3", "\"Let's finish one together.\"", "l_wing")]),
            scene("l_wing", "The Unwritten Wing", -200, 380, [
                say("mira", "Then pick up a pen. Chapter one starts now.", "happy"),
            ], ending=end("good", "The Unwritten Wing", "Some libraries keep their best books hidden.")),
            scene("l_home", "A normal evening", 200, 190, [
                bg("bg-bedroom"), step("music", track="calm"),
                nar("I go home, eat noodles and wonder about that cat for the rest of my life."),
            ], ending=end("neutral", "A Normal Evening", "Curiosity didn't get this cat.")),
        ]}


DEMO = [
    # (owner index, title, blurb, genre, tags, rating, cover, builder, plays, likes, featured, days ago)
    (1, "The Last Train Home", "It's 11:58 PM and the last train left an hour ago. So why is there a train on Platform 0, and why is the cat staring at you?",
     "Mystery", ["cats", "trains", "midnight", "short"], "Everyone", "demo:cover-train", train, 2290, 540, True, 9),
    (0, "Cherry Blossom Promise", "A gust of wind, a storm of sketches, and one week until the art exhibition. Will you chase the paper, or keep walking?",
     "Romance", ["school", "spring", "wholesome"], "Everyone", "demo:cover-cherry", cherry, 1284, 312, True, 21),
    (2, "Rooftop Club", "Sol is founding a club with one rule: lunch on the roof. The student council has opinions.",
     "Comedy", ["school", "friends", "snacks"], "Everyone", "demo:cover-rooftop", rooftop, 640, 141, False, 4),
    (0, "Library After Hours", "The library closes at nine. You didn't leave. Neither did the cat.",
     "Fantasy", ["books", "cats", "cozy"], "Everyone", "demo:cover-library", library, 210, 38, False, 2),
]
