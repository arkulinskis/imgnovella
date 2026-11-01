"""The demo novels (and the "starter" template new creators can copy). They use only the built-in art
(demo:* pictures, drawn by tools/make_art.py), so they need no uploads. Each function returns a story
document in the shape Stories.clean_story keeps.

They show off the features: name input, conditional lines, choice effects, locked choices with hints,
"once" choices around a hub scene, a timed choice, conditional jumps, CGs, chapter cards, music moods,
sound effects, mini-games and several kinds of ending.
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


def game(kind, title, prompt, colors, diff=1, win=None, lose=None, var="", retry=True, skip=True):
    return step("game", game=kind, diff=diff, title=title, prompt=prompt, c1=colors[0], c2=colors[1], c3=colors[2],
                win=win, lose=lose, retry=retry, skip=skip, var=var)


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
                 {"name": "promised", "type": "flag", "init": False, "note": "You promised to come on Friday"},
                 {"name": "caught", "type": "flag", "init": False, "note": "You caught the last sketch (mini-game)"}],
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
                game("timing", "Catch the last sketch!", "Stop the marker on the flying page.", ["#ff4f8b", "#3cc6c0", "#ffffff"], diff=0, var="caught"),
                step("sfx", name="sparkle"),
                show("mira", "happy"),
                say("mira", "You caught the last one! You're fast, um...", cond="caught"),
                say("mira", "It got away... no wait, there! Got it! Thanks for trying, um...", cond="not caught"),
                say("you", "[player]."),
                say("mira", "[player]! I'm Mira. Thank you, *really*. These are for the art club exhibition."),
                show("mira", "shy", fx="none"),
                say("mira", "...You didn't look at them, did you? They're not finished."),
            ], [choice("c3", "Admit you peeked. They're beautiful.", "c_tree", effects=[eff("courage", "+", 1), eff("saw_sketch", "=", True)]),
                choice("c4", "Promise you didn't look.", "c_tree")]),
            scene("c_late", "The long way round", 240, 190, [
                hide("mira", "none"), bg("bg-classroom"),
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
                hide("sol", "none"), bg("bg-library"), show("mira", "sad"),
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
                hide("sol", "none"), bg("bg-rooftop-sunset"), step("music", track="sad"),
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
                 {"name": "sharp_eyes", "type": "flag", "init": False, "note": "Spotted the glint in time (mini-game)"},
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
                nar("Something glints between the slats. Where was it?"),
                game("find", "Something glints...", "Find the glinting symbol before the lights flicker.", ["#8fe3df", "#ffd24a", "#1c1a3a"], diff=1, var="sharp_eyes"),
                step("sfx", name="chime"),
                setv("ticket", "=", True), setv("clues", "+", 1),
                say("ren", "A ticket. One way. No destination printed.", "happy"),
                say("ren", "Good thing I've got sharp eyes.", "neutral", "sharp_eyes"),
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
                hide("cond", "none"), bg("bg-bedroom"), step("music", track="calm"),
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
                 {"name": "title", "type": "text", "init": "Member", "note": "Your club title"},
                 {"name": "beat_sol", "type": "flag", "init": False, "note": "Won Sol's tic-tac-toe challenge"}],
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
                say("sol", "Club rule number one: the loser of tic-tac-toe carries the snacks. Ready?"),
                game("tictactoe", "Sol's challenge", "Beat Sol at tic-tac-toe. Loser carries the snacks!", ["#ff9a3c", "#8a6cff", "#fff5f8"], diff=1, var="beat_sol"),
                say("sol", "No way! Fine, you're Vice President for real.", "surprised", "beat_sol"),
                setv("title", "=", "Vice President", "beat_sol"),
                say("sol", "Ha! Snack duty is yours, [title]!", "happy", "not beat_sol"),
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
                nar("Between two shelves, a door of glowing runes. They flicker in pairs."),
                game("memory", "The rune door", "Match the runes in pairs to open the door.", ["#8a7ad6", "#ffd24a", "#1c1630"], diff=0, lose="l_home"),
                step("fx", name="flash"), hide("kuro", "none"), show("mira", "surprised"),
                say("mira", "You can see the doorway too?"),
                say("mira", "Welcome to the Unwritten Wing. Every book here is a story nobody finished.", "happy"),
            ], [choice("l3", "\"Let's finish one together.\"", "l_wing")]),
            scene("l_wing", "The Unwritten Wing", -200, 380, [
                say("mira", "Then pick up a pen. Chapter one starts now.", "happy"),
            ], ending=end("good", "The Unwritten Wing", "Some libraries keep their best books hidden.")),
            scene("l_home", "A normal evening", 200, 190, [
                hide("kuro", "none"), hide("mira", "none"), bg("bg-bedroom"), step("music", track="calm"),
                nar("I go home, eat noodles and wonder about that cat for the rest of my life."),
            ], ending=end("neutral", "A Normal Evening", "Curiosity didn't get this cat.")),
        ]}


# ------------------------------------------------------------------------------------------- 5. Fireworks for Two
def festival():
    return {
        "settings": {"orientation": "portrait", "textbox": "midnight", "accent": "#ffd24a", "font": "rounded", "cps": 48,
                     "title_img": "demo:cover-festival", "title_music": "upbeat",
                     "credits": "Story: Saoirse Vale\nArt: the ImgNovella starter pack\nMade with ImgNovella"},
        "chars": [char("ren", "Ren", "#8a93d6", "ren", EXPR), char("hana", "Hana", "#b48ae0", "hana", EXPR)],
        "vars": [{"name": "ren_heart", "type": "number", "init": 0, "note": "Time spent with Ren"},
                 {"name": "hana_heart", "type": "number", "init": 0, "note": "Time spent with Hana"},
                 {"name": "plush", "type": "flag", "init": False, "note": "Won the giant tanuki plush (whack-a-mole)"},
                 {"name": "takoyaki", "type": "flag", "init": False, "note": "Won the last takoyaki (rock-paper-scissors)"}],
        "start": "f_start",
        "scenes": [
            scene("f_start", "The festival gates", 0, 0, [
                step("card", title="Fireworks for Two", sub="The last night of summer"),
                bg("bg-festival"), step("music", track="upbeat"),
                nar("Lanterns, sizzling grills, and the whole town in yukata. The fireworks start at nine."),
                show("ren", "neutral", "left"),
                say("ren", "You actually came. I bet Hana five yen you'd chicken out."),
                show("hana", "happy", "right"),
                say("hana", "And I bet ten that you'd come! Pay up, Ren."),
                say("ren", "...I'll pay you in takoyaki.", "shy"),
            ], [choice("f1", "Walk next to Ren", "f_stalls", effects=[eff("ren_heart", "+", 1)]),
                choice("f2", "Let Hana show you around", "f_stalls", effects=[eff("hana_heart", "+", 1)])]),
            scene("f_stalls", "The stalls", 0, 190, [
                say("hana", "Okay! Games first, food second, fireworks third. That's the law.", "happy", "ren_heart + hana_heart < 2"),
                say("ren", "It's almost nine. We should find a spot by the river.", "neutral", "ren_heart + hana_heart >= 2"),
            ], [choice("f3", "Play Whack-a-Tanuki", "f_whack", once=True),
                choice("f4", "Fight over the last takoyaki", "f_rps", once=True),
                choice("f5", "Head to the riverbank", "f_river")]),
            scene("f_whack", "Whack-a-Tanuki", -300, 380, [
                say("hana", "Whack ten tanuki and you win the giant plush. I've tried for six years!", "surprised"),
                game("whack", "Whack-a-Tanuki", "Bop the tanuki before they duck back down!", ["#ffd24a", "#ff4f5e", "#33285e"], diff=1, var="plush"),
                step("sfx", "plush", name="sparkle"),
                say("hana", "You did it! The giant tanuki is yours!", "happy", "plush"),
                say("hana", "So close! The booth man gave you a tiny one out of pity. It's still cute.", "sad", "not plush"),
            ], [choice("f6", "Give the plush to Hana", "f_stalls", effects=[eff("hana_heart", "+", 1)]),
                choice("f7", "Plonk it on Ren's head", "f_stalls", effects=[eff("ren_heart", "+", 1)])]),
            scene("f_rps", "The last takoyaki", 0, 380, [
                say("ren", "There's one takoyaki left. We settle this like adults.", "angry"),
                say("ren", "Rock, paper, scissors. First to two."),
                game("rps", "The last takoyaki", "First to two wins the takoyaki. Ren always opens with rock... probably.", ["#8a93d6", "#ffd24a", "#141235"], diff=1, var="takoyaki"),
                say("ren", "...You beat me. Fine. It's yours.", "sad", "takoyaki"),
                say("ren", "Ha! Victory tastes like octopus.", "happy", "not takoyaki"),
            ], [choice("f8", "Share it with Ren anyway", "f_stalls", effects=[eff("ren_heart", "+", 1)]),
                choice("f9", "Give it to Hana, who looks starving", "f_stalls", effects=[eff("hana_heart", "+", 1)])]),
            scene("f_river", "The riverbank", 0, 570, [
                bg("bg-sakura-night"), step("music", track="romance"),
                nar("We find a patch of grass by the river. Somewhere, a countdown starts."),
                say("hana", "Three... two...", "happy"),
                step("sfx", name="thud"), step("fx", name="flash"),
                say("ren", "There! The first one!", "surprised"),
            ], [choice("f10", "Watch with Ren", "f_ren", cond="ren_heart >= 2", mode="lock", hint="Spend more time with Ren"),
                choice("f11", "Watch with Hana", "f_hana", cond="hana_heart >= 2", mode="lock", hint="Spend more time with Hana"),
                choice("f12", "Make it a tradition, all three of you", "f_true", cond="plush and takoyaki", mode="lock", hint="Win both festival games"),
                choice("f13", "Just watch the sky", "f_friends")], timer=15, timeout="f13"),
            scene("f_ren", "Fireworks for two", -360, 760, [
                hide("hana"), show("ren", "shy", "center"),
                step("cg", img="demo:cg-fireworks"),
                say("ren", "I didn't really bet five yen. I just... hoped you'd come."),
            ], ending=end("good", "Fireworks for Two", "Some confessions are quieter than fireworks. They last longer.")),
            scene("f_hana", "Under the lanterns", -120, 760, [
                hide("ren"), show("hana", "shy", "center"),
                step("cg", img="demo:cg-fireworks"),
                say("hana", "Next year, let's wear matching yukata. That's a promise."),
            ], ending=end("good", "Under the Lanterns", "You found a best friend at the end of summer. That counts for a lot.")),
            scene("f_true", "A tradition", 120, 760, [
                step("cg", img="demo:cg-fireworks"),
                say("hana", "Same night, same riverbank, every year. The three of us. Deal?", "happy"),
                say("ren", "Deal. But I'm winning the takoyaki next time.", "happy"),
            ], ending=end("true", "A Summer Tradition", "You won every game and kept both friends. Next summer is already booked.")),
            scene("f_friends", "Just the sky", 360, 760, [
                nar("We watch the whole show without saying a word. It's nice. It's enough."),
                say("hana", "Same time next year?", "happy"),
            ], ending=end("neutral", "Just the Sky", "Not every summer night needs a story. Some just need fireworks.")),
        ]}


# ------------------------------------------------------------------------------------------- 6. Signal from Station Nine
def signal():
    return {
        "settings": {"orientation": "landscape", "textbox": "midnight", "accent": "#8fe3df", "font": "sans", "cps": 42,
                     "title_img": "demo:cover-signal", "title_music": "tension",
                     "credits": "Story: Jules Okafor\nMade with ImgNovella"},
        "chars": [char("sol", "Captain Sol", "#ff9a3c", "sol", EXPR), char("byte", "Byte", "#3cc6c0", "byte", ["neutral", "happy", "sad", "surprised"])],
        "vars": [{"name": "power", "type": "number", "init": 0, "note": "Systems brought back online (0-2)"},
                 {"name": "trust", "type": "flag", "init": False, "note": "Byte trusts you"},
                 {"name": "door_open", "type": "flag", "init": False, "note": "Cracked the airlock code (mini-game)"},
                 {"name": "relay_on", "type": "flag", "init": False, "note": "Rebooted the relay (mini-game)"},
                 {"name": "heard_story", "type": "flag", "init": False, "note": "Asked Byte why it is alone"}],
        "start": "s_start",
        "scenes": [
            scene("s_start", "Docking", 0, 0, [
                step("card", title="Signal from Station Nine", sub="Year 2291. Outer belt."),
                bg("bg-spaceship"), step("music", track="tension"),
                nar("Station Nine went silent eleven years ago. Tonight it sent a single word: {color=#8fe3df}HELLO{/color}."),
                show("sol", "neutral", "left"),
                say("sol", "Captain's log. We're docking. If anything says hello back, I'm leaving."),
                step("sfx", name="door"), step("fx", name="shake"),
                show("byte", "surprised", "right", "pop"),
                say("byte", "HELLO! HELLO! {big}YOU CAME!{/big}"),
                say("sol", "...It's a robot. A very loud robot.", "surprised"),
            ], [choice("s1", "Say hello back", "s_tour", effects=[eff("trust", "=", True)]),
                choice("s2", "Reach for the stunner", "s_tense")]),
            scene("s_tense", "Stunner", 300, 190, [
                show("byte", "sad", "right", "none"),
                say("byte", "Please do not stun me. I am mostly a vacuum cleaner."),
                say("sol", "Lower it. Look at it. It's shaking.", "sad"),
            ], [choice("s3", "Lower the stunner and apologise", "s_tour", effects=[eff("trust", "=", True)]),
                choice("s4", "Keep it pointed, just in case", "s_tour")]),
            scene("s_tour", "The dark station", 0, 380, [
                say("byte", "The station is running on 2% power. The airlock code is lost and the relay is asleep.", "neutral", "power == 0"),
                say("byte", "One system back! Station Nine says thank you. So do I.", "happy", "power == 1"),
                say("byte", "Full power! I can see the stars on the cameras again!", "happy", "power >= 2"),
                say("sol", "Our ship can take one passenger. If the escape bay opens.", "neutral", "power >= 2"),
            ], [choice("s5", "Crack the airlock code", "s_code", cond="not door_open"),
                choice("s6", "Reboot the signal relay", "s_relay", cond="not relay_on"),
                choice("s7", "Ask Byte why it's alone", "s_story", cond="trust", mode="lock", hint="Byte doesn't trust you yet", once=True),
                choice("s8", "Open the escape bay", "s_launch", cond="power >= 2", mode="lock", hint="Bring both systems back first"),
                choice("s9", "Leave the station", "s_leave")]),
            scene("s_code", "The airlock", -380, 570, [
                say("byte", "The code is a number. The door says 'higher' or 'lower'. It is very rude about it.", "neutral"),
                game("code", "Airlock override", "Guess the door code. It tells you higher or lower.", ["#8fe3df", "#ff9a3c", "#1b2036"], diff=1, var="door_open"),
                setv("power", "+", 1, "door_open"),
                step("sfx", "door_open", name="door"),
                say("byte", "The door opened! You are a genius, or very lucky.", "happy", "door_open"),
                say("sol", "Still locked. We'll try again before we go.", "sad", "not door_open"),
            ], nxt="s_tour"),
            scene("s_relay", "The relay", -130, 570, [
                say("byte", "The relay wakes up if you repeat its startup pattern. It has a terrible memory. Like me.", "happy"),
                game("simon", "Relay startup", "Watch the lights, then repeat the pattern.", ["#3cc6c0", "#ffd24a", "#141829"], diff=1, var="relay_on"),
                setv("power", "+", 1, "relay_on"),
                step("sfx", "relay_on", name="chime"),
                say("byte", "The relay is singing! I missed that song.", "happy", "relay_on"),
                say("byte", "It went back to sleep. Relays are like that.", "sad", "not relay_on"),
            ], nxt="s_tour"),
            scene("s_story", "Why Byte stayed", 130, 570, [
                setv("heard_story", "=", True),
                say("byte", "Everyone left in the evacuation. Someone had to water the hydroponic tomatoes.", "sad"),
                say("byte", "That was 4,018 days ago. The tomatoes are doing very well."),
                say("sol", "...You stayed eleven years for tomatoes?", "sad"),
                say("byte", "And to say hello, if anyone came back.", "happy"),
            ], nxt="s_tour"),
            scene("s_launch", "The escape bay", 0, 760, [
                step("music", track="dreamy"),
                say("sol", "Byte. There's room for one more on our ship.", "neutral"),
                step("jump", "heard_story", to="s_true"),
                say("byte", "Me? I... would like that very much.", "surprised"),
            ], ending=end("good", "Signal Received", "Station Nine goes dark again, but this time nobody is left behind.")),
            scene("s_true", "Company", -250, 950, [
                show("byte", "happy", "right", "none"),
                say("byte", "Can the tomatoes come too?"),
                say("sol", "...Fine. The tomatoes come too.", "happy"),
            ], ending=end("true", "Company", "Captain Sol's ship now has a robot, a garden, and the best salad in the outer belt.")),
            scene("s_leave", "Radio silence", 380, 760, [
                hide("byte"), step("music", track="sad"),
                say("sol", "We can't fix a whole station. Let's go home.", "sad"),
                nar("As we undock, the station sends one last word. {color=#8fe3df}GOODBYE{/color}."),
            ], ending=end("bad", "Radio Silence", "Some signals are answered. This one wasn't.")),
        ]}


# ------------------------------------------------------------------------------------------- 7. The Fox Shrine
def shrine():
    return {
        "settings": {"orientation": "portrait", "textbox": "paper", "accent": "#e5484d", "font": "serif", "cps": 38,
                     "title_img": "demo:cover-shrine", "title_music": "mystery",
                     "credits": "Story: Jules Okafor\nMade with ImgNovella"},
        "chars": [char("hana", "Hana", "#b48ae0", "hana", EXPR), char("yoru", "Yoru", "#f08a3c", "yoru", ["neutral", "happy", "surprised"]),
                  {"id": "me", "name": "[player]", "color": "#e5484d", "poses": []}],
        "vars": [{"name": "player", "type": "text", "init": "Kai", "note": "The reader's name"},
                 {"name": "offering", "type": "flag", "init": False, "note": "Left inari sushi at the shrine"},
                 {"name": "quick", "type": "flag", "init": False, "note": "Won the fox's lantern game (reaction)"}],
        "start": "x_start",
        "scenes": [
            scene("x_start", "Three hundred steps", 0, 0, [
                step("card", title="The Fox Shrine", sub="Dusk. Three hundred steps up the mountain."),
                bg("bg-shrine"), step("music", track="mystery"),
                step("input", var="player", prompt="What's your name?", dflt="Kai"),
                show("hana", "neutral"),
                say("hana", "Legend says the fox of this shrine grants one wish, [player]. Or steals your name."),
                say("hana", "Scared?", "happy"),
                say("me", "Of a fox? Please."),
            ], [choice("x1", "Ring the shrine bell", "x_bell"),
                choice("x2", "Leave an offering of inari sushi first", "x_bell", effects=[eff("offering", "=", True)])]),
            scene("x_bell", "The bell", 0, 190, [
                step("sfx", name="bell"), step("fx", name="flash"),
                show("hana", "surprised", "left"),
                show("yoru", "neutral", "right", "pop"),
                say("yoru", "Who rings my bell at dusk?"),
                say("hana", "A t-t-talking fox!"),
                say("yoru", "Ah. Inari sushi. At least one of you has manners.", "happy", "offering"),
                say("yoru", "Play my game, [player]. When my lantern lights, catch it. Too slow, and your name is mine.", "neutral"),
                game("reaction", "The fox's lantern", "Wait for the lantern to light... then tap! Too early counts as too slow.", ["#e5484d", "#ffd24a", "#2b2350"], diff=1, var="quick", retry=False),
                say("yoru", "...Fast. Very well. You have earned a wish.", "surprised", "quick"),
                say("yoru", "Too slow! Your name is mine now... {w=0.5}Name-less one.", "happy", "not quick"),
                say("hana", "Hey! Give it back!", "angry", "not quick"),
            ], [choice("x3", "Make a wish", "x_wish", cond="quick", mode="lock", hint="Win the fox's game"),
                choice("x4", "Ask for your name back", "x_riddle", cond="not quick"),
                choice("x5", "Run down the steps", "x_run")]),
            scene("x_wish", "One wish", -260, 380, [
                say("yoru", "Choose carefully. Wishes are like foxes: clever, and they bite.", "neutral"),
            ], [choice("x6", "Wish that Hana never gets lost", "x_guard"),
                choice("x7", "Wish to see the fox again", "x_friend", cond="offering", mode="lock", hint="The fox likes polite guests"),
                choice("x8", "Wish for a million yen", "x_greedy")]),
            scene("x_riddle", "The riddle", 260, 380, [
                say("yoru", "One riddle. Answer before my lantern goes out.", "happy"),
                say("yoru", "I follow you all day, but I vanish at night. What am I?", "neutral"),
            ], [choice("x9", "Your shadow", "x_free"),
                choice("x10", "Your name", "x_lost"),
                choice("x11", "A fox", "x_lost")], timer=10, timeout="x10"),
            scene("x_guard", "Never lost", -400, 570, [
                say("yoru", "Granted. A little fox will walk behind her, always.", "happy"),
                say("hana", "...That's actually really sweet, [player].", "shy"),
            ], ending=end("good", "Never Lost", "Hana never gets lost again. Sometimes she hears paws behind her.")),
            scene("x_friend", "See you again", -260, 570, [
                say("yoru", "Me? Nobody ever wishes for me.", "surprised"),
                say("yoru", "Bring sushi next summer. I will be here.", "happy"),
                say("hana", "Can I come too?", "happy"),
            ], ending=end("true", "A Friend at the Shrine", "Every summer, three hundred steps, one fox, and far too much inari sushi.")),
            scene("x_greedy", "A million yen", -120, 570, [
                step("music", track="tension"),
                say("yoru", "A million yen? Easy.", "happy"),
                nar("A storm of leaves. When it clears, my pockets are full of very convincing leaves."),
                say("hana", "...He tricked you.", "sad"),
            ], ending=end("bad", "Leaf Money", "Never ask a fox for money.")),
            scene("x_free", "Your shadow", 160, 570, [
                say("yoru", "Correct. Take your name back, [player]. Hold on to it this time.", "surprised"),
                say("hana", "Let's go home. Now. Please.", "sad"),
            ], ending=end("neutral", "Name Returned", "You kept your name, and a story nobody at school believes.")),
            scene("x_lost", "Nameless", 360, 570, [
                step("music", track="tension"), step("fx", name="shake"),
                say("yoru", "Wrong. Goodnight... whoever you were.", "happy"),
                hide("yoru", "dissolve"),
                say("hana", "Hey... who are you again?", "surprised"),
            ], ending=end("bad", "Nameless", "Somewhere in the shrine, a fox keeps a jar of names. Yours is in it.")),
            scene("x_run", "Down the mountain", 0, 380, [
                hide("yoru"),
                say("hana", "Run run run run!", "surprised"),
                nar("We don't stop until the festival lights. Behind us, something laughs."),
            ], ending=end("neutral", "Three Hundred Steps", "You never learn what the fox wanted. Probably for the best.")),
        ]}


# ------------------------------------------------------------------------------------------- 8. Café Nekomata
def cafe():
    return {
        "settings": {"orientation": "portrait", "textbox": "paper", "accent": "#c98b5e", "font": "rounded", "cps": 50,
                     "title_img": "demo:cover-cafe", "title_music": "calm",
                     "credits": "Story: Mika Rowan\nArt: the ImgNovella starter pack\nMade with ImgNovella"},
        "chars": [char("sol", "Sol", "#ff9a3c", "sol", EXPR), char("kuro", "Kuro", "#ffd24a", "kuro", ["neutral", "happy", "surprised"]),
                  char("mira", "Mira", "#ff4f8b", "mira", EXPR)],
        "vars": [{"name": "tips", "type": "number", "init": 0, "note": "Coins in the tip jar"},
                 {"name": "froth", "type": "flag", "init": False, "note": "Frothed the milk (button mash)"},
                 {"name": "heart", "type": "flag", "init": False, "note": "Poured a latte heart (timing)"},
                 {"name": "bowed", "type": "flag", "init": False, "note": "Bowed to the manager"},
                 {"name": "kuro_treat", "type": "flag", "init": False, "note": "Slipped Kuro a treat"}],
        "start": "k_start",
        "scenes": [
            scene("k_start", "First shift", 0, 0, [
                step("card", title="Café Nekomata", sub="Your first shift"),
                bg("bg-cafe"), step("music", track="calm"),
                nar("The bell over the door jingles. It smells of coffee and warm bread."),
                show("sol", "happy"),
                say("sol", "Welcome to Café Nekomata! Rule one: the cat is the manager."),
                show("kuro", "neutral", "right"),
                say("kuro", "Mrrp."),
                say("sol", "He says you're late. You're not. He just says that."),
            ], [choice("k1", "Bow to the manager", "k_rush", effects=[eff("bowed", "=", True)]),
                choice("k2", "Ask where the aprons are", "k_rush")]),
            scene("k_rush", "Rush hour", 0, 190, [
                say("kuro", "Mrrrp!", "happy", "bowed"),
                step("card", title="Rush hour"),
                step("sfx", name="door"),
                show("mira", "happy", "left"),
                say("mira", "One strawberry latte, please! With a heart on top?"),
                say("sol", "Your turn! Froth the milk first. Tap tap tap!", "happy"),
                game("mash", "Froth the milk", "Tap as fast as you can until the foam is fluffy.", ["#c98b5e", "#ff9fbe", "#fbf3e3"], diff=0, var="froth"),
                setv("tips", "+", 2, "froth"),
                say("sol", "Perfect foam!", "surprised", "froth"),
                say("sol", "Now pour the heart. Stop right in the middle of the cup.", "neutral"),
                game("timing", "Latte art", "Stop the jug when it's over the heart.", ["#ff9fbe", "#c98b5e", "#fbf3e3"], diff=1, var="heart"),
                setv("tips", "+", 3, "heart"),
                say("mira", "A perfect heart! I can't drink this, it's too pretty!", "surprised", "heart"),
                say("mira", "It's... a potato? I love it. Potato latte.", "happy", "not heart"),
                setv("tips", "+", 1, "not heart"),
            ], [choice("k3", "Slip Kuro a treat while Sol isn't looking", "k_close", effects=[eff("kuro_treat", "=", True)]),
                choice("k4", "Wipe every table until it shines", "k_close", effects=[eff("tips", "+", 1)])]),
            scene("k_close", "Closing time", 0, 380, [
                step("card", title="Closing time"),
                hide("mira"), step("music", track="dreamy"),
                say("sol", "Let's count the tip jar!", "happy"),
                step("jump", "tips >= 5 and kuro_treat and bowed", to="k_star"),
                step("jump", "tips >= 4", to="k_good"),
            ], nxt="k_ok"),
            scene("k_star", "The manager's verdict", -260, 570, [
                show("kuro", "surprised", "right", "none"),
                say("kuro", "Mrrrrrrp!"),
                nar("Kuro knocks the tip jar over. A single gold coin rolls out of nowhere and stops at my feet."),
                say("sol", "He's never done that before. Kuro's giving you a raise!", "surprised"),
            ], ending=end("secret", "Cat-Approved", "Employee of the Month: you. Signed with a paw print.")),
            scene("k_good", "A good first day", 0, 570, [
                say("sol", "That's a great first day! Same time tomorrow?", "happy"),
            ], ending=end("good", "Barista in Training", "Your lattes are getting better. Your foam is getting famous.")),
            scene("k_ok", "Tomorrow, more foam", 260, 570, [
                say("sol", "Hey, everyone's first day is messy. Mine involved a fire extinguisher.", "shy"),
            ], ending=end("neutral", "Tomorrow, More Foam", "Not the smoothest shift, but you're coming back tomorrow.")),
        ]}


# ------------------------------------------------------------------------------------------- 9. Message in a Bottle
def bottle():
    return {
        "settings": {"orientation": "landscape", "textbox": "sakura", "accent": "#3cc6c0", "font": "rounded", "cps": 44,
                     "title_img": "demo:cover-beach", "title_music": "calm",
                     "credits": "Story: Saoirse Vale\nMade with ImgNovella"},
        "chars": [char("mira", "Mira", "#ff4f8b", "mira", EXPR), char("hana", "Hana", "#b48ae0", "hana", EXPR)],
        "vars": [{"name": "found", "type": "flag", "init": False, "note": "You spotted the bottle first (find it)"},
                 {"name": "brave", "type": "number", "init": 0, "note": "How much you encouraged Hana"}],
        "start": "b_start",
        "scenes": [
            scene("b_start", "Last day at the sea", 0, 0, [
                step("card", title="Message in a Bottle", sub="The last day of the summer trip"),
                bg("bg-beach"), step("music", track="calm"),
                show("mira", "happy", "left"),
                say("mira", "Last one in the water buys ice cream!"),
                show("hana", "neutral", "right"),
                say("hana", "Mira, wait! Something's glinting in the sand..."),
                game("find", "Something in the sand", "Find the bottle before the next wave covers it.", ["#3cc6c0", "#ff8fa6", "#fff4e6"], diff=0, var="found"),
                say("hana", "You found it! A green glass bottle... with paper inside.", "surprised", "found"),
                say("mira", "Got it! Ha, a wave nearly took it. There's paper inside!", "surprised", "not found"),
            ], [choice("b1", "Read the letter aloud", "b_read"),
                choice("b2", "Hand it to Hana: the handwriting looks like hers", "b_hana", effects=[eff("brave", "+", 1)])]),
            scene("b_read", "Reading aloud", -260, 190, [
                say("mira", "\"To whoever finds this. My name is Hana, I'm ten, and I have a secret...\"", "surprised"),
                say("hana", "STOP! Stop reading!", "angry"),
                say("hana", "...That's mine. I threw it in the sea ten years ago.", "shy"),
            ], [choice("b3", "Keep reading. It's too good!", "b_teased"),
                choice("b4", "Fold it up and give it back", "b_hana", effects=[eff("brave", "+", 1)])]),
            scene("b_hana", "Hana's letter", 0, 380, [
                say("hana", "I wrote it the summer my family moved away from here.", "sad"),
                say("hana", "I wished I'd be brave enough to tell my best friend I'd miss her."),
                say("mira", "Hana... that was me, wasn't it?", "sad"),
            ], [choice("b5", "Tell Hana it's not too late to say it", "b_sunset", effects=[eff("brave", "+", 1)]),
                choice("b6", "Change the subject: ice cream!", "b_icecream")]),
            scene("b_teased", "The tide takes it", -400, 570, [
                say("mira", "\"...and I think Mira is the coolest person in the whole...\"", "happy"),
                step("fx", name="shake"),
                say("hana", "Give it!", "angry"),
                nar("Hana snatches the letter and throws it as far as she can. The tide takes it."),
                say("hana", "Some secrets should stay in the sea.", "sad"),
            ], ending=end("bad", "The Tide Takes It", "You'll never know how that letter ended. Neither will Mira.")),
            scene("b_sunset", "Sunset", 0, 570, [
                step("music", track="romance"),
                step("jump", "brave >= 3 and found", to="b_true"),
                say("hana", "I missed you. Every single summer.", "shy"),
                say("mira", "I missed you too, you idiot. Why didn't you write?", "happy"),
            ], ending=end("good", "Ten Summers Late", "Some letters take ten years to arrive. This one was worth the wait.")),
            scene("b_true", "A new message", -200, 760, [
                say("hana", "I missed you. Every single summer.", "shy"),
                say("mira", "Then let's write a new one. Together.", "happy"),
                nar("We write it on the back of an ice cream receipt and throw it as far as we can."),
                say("hana", "What did you write?", "happy"),
                say("mira", "\"See you next summer.\" Both of us.", "shy"),
            ], ending=end("true", "A New Message", "Somewhere out there, a bottle with two names in it is still floating.")),
            scene("b_icecream", "Two scoops", 260, 570, [
                step("music", track="upbeat"),
                say("mira", "Ice cream! Hana's paying!", "happy"),
                say("hana", "...Fine. Maybe next summer I'll say it.", "sad"),
            ], ending=end("neutral", "Two Scoops", "The letter goes in Hana's pocket. Maybe next year.")),
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
    (2, "Fireworks for Two", "The last night of summer, two friends, one festival, and a fireworks show at nine. Who will you watch it with?",
     "Romance", ["festival", "summer", "friends"], "Everyone", "demo:cover-festival", festival, 1720, 405, True, 6),
    (1, "Signal from Station Nine", "A space station silent for eleven years sends one word: HELLO. Something on board is very happy to see you.",
     "Sci-fi", ["space", "robots", "wholesome"], "Everyone", "demo:cover-signal", signal, 980, 233, True, 12),
    (1, "The Fox Shrine", "Three hundred steps, one bell, and a fox spirit who plays for names. Are you fast enough?",
     "Horror", ["spooky", "foxes", "folklore"], "Teen", "demo:cover-shrine", shrine, 760, 188, False, 15),
    (0, "Café Nekomata", "Your first shift at a cat café. Froth the milk, pour the heart, and impress the manager. The manager is a cat.",
     "Slice of life", ["cats", "cafe", "cozy"], "Everyone", "demo:cover-cafe", cafe, 530, 129, False, 3),
    (2, "Message in a Bottle", "The last day at the sea, a bottle in the sand, and a letter someone wrote ten years ago.",
     "Drama", ["beach", "friendship", "summer"], "Everyone", "demo:cover-beach", bottle, 410, 97, False, 1),
]
