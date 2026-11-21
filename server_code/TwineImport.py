"""Import from Twine: Twee source (Twee 3 / Twee 2) or a published Twine 2 story (.html) -> an ImgNovella story document.

- passages -> scenes (map positions from Twine when it has them, otherwise a grid by distance from the start)
- links [[Target]], [[Text|Target]], [[Text->Target]], [[Target<-Text]] -> choices (max 12 per scene)
- <<goto "X">> / (go-to: "X") -> "then go to"
- "Name: line" -> a character line, when Name speaks at least twice (those names become the cast)
- <<set $x to 5>>, <<set $x += 1>>, (set: $x to it + 1) -> variables + Change-variable steps
- $var / _var in text -> [var] (ImgNovella's interpolation)
- passages with no way out -> endings; any other macro -> a Writer's note so nothing is silently lost
The caller runs Stories.clean_story on the result, which enforces every size limit.
"""
import html
import json
import re
from html.parser import HTMLParser

MAX_SCENES = 400
SKIP_NAMES = {"StoryTitle", "StoryData", "StoryInit", "StoryCaption", "StoryMenu", "StoryBanner", "StoryAuthor",
              "StorySubtitle", "PassageReady", "PassageDone", "PassageHeader", "PassageFooter", "StoryIncludes"}
SKIP_TAGS = {"script", "stylesheet", "widget", "Twine.private", "annotation", "header", "footer", "startup", "debug-startup"}
LINK = re.compile(r"\[\[(.+?)\]\]")
SPEAKER = re.compile(r"^\s*(?:\*\*|'')?([A-Z][A-Za-z0-9 .'\-]{0,19}?)(?:\*\*|'')?\s*:\s+(.+)$")
SET_SC = re.compile(r"<<\s*set\s+(.+?)>>", re.S)
SET_HL = re.compile(r"\(\s*(?:set|put)\s*:\s*(.+?)\)", re.S)
GOTO = re.compile(r"""<<\s*goto\s+(?:\[\[)?["']?([^"'\]>]+)["']?(?:\]\])?\s*>>|\(\s*go-?to\s*:\s*["']([^"']+)["']\s*\)""", re.I)
MACRO = re.compile(r"<<[^<>]*>>|\((?:if|else-?if|unless|else|display|print|link|link-goto|click|replace|append|prepend|"
                   r"either|cond|nth|for|loop|live|stop|show|hide|transition|t8n|align|font|colou?r|text-colou?r|"
                   r"text-style|css|move|history|visited|alert|prompt|confirm|dropdown|cycling-link|seq-link|"
                   r"save-game|load-game|undo|restart|reload|goto|go-to)\s*:[^()]*\)", re.I)
TAG = re.compile(r"</?[A-Za-z][^>]*>")
VAR_REF = re.compile(r"[$_]([A-Za-z_][A-Za-z0-9_]{0,31})")


class _TwineHtml(HTMLParser):
    """Collects <tw-storydata> attributes and every <tw-passagedata> (name, tags, position, text)."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.story, self.passages, self._cur = {}, [], None

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "tw-storydata":
            self.story = a
        elif tag == "tw-passagedata":
            self._cur = {"pid": a.get("pid"), "name": a.get("name") or "", "tags": (a.get("tags") or "").split(),
                         "pos": a.get("position") or "", "text": ""}

    def handle_endtag(self, tag):
        if tag == "tw-passagedata" and self._cur is not None:
            self.passages.append(self._cur)
            self._cur = None

    def handle_data(self, data):
        if self._cur is not None:
            self._cur["text"] += data


def _from_html(text):
    p = _TwineHtml()
    p.feed(text)
    start_pid = p.story.get("startnode")
    start = next((x["name"] for x in p.passages if x["pid"] == start_pid), None)
    return p.story.get("name") or "", start, p.passages


def _from_twee(text):
    title, start, passages, cur = "", None, [], None
    head = re.compile(r"^::\s*(.*?)\s*(\[[^\]]*\])?\s*(\{.*\})?\s*$")
    for line in text.split("\n"):
        m = head.match(line) if line.startswith("::") else None
        if m:
            name = m.group(1).replace("\\[", "[").replace("\\]", "]").strip()
            tags = (m.group(2) or "[]")[1:-1].split()
            pos = ""
            try:
                pos = (json.loads(m.group(3)) or {}).get("position", "") if m.group(3) else ""
            except Exception:
                pos = ""
            cur = {"name": name, "tags": tags, "pos": pos, "text": ""}
            passages.append(cur)
        elif cur is not None:
            cur["text"] += line + "\n"
    for p in passages:
        if p["name"] == "StoryTitle":
            title = p["text"].strip().split("\n")[0]
        elif p["name"] == "StoryData":
            try:
                start = json.loads(p["text"]).get("start") or start
            except Exception:
                pass
    return title, start, passages


def _link(inner):
    """[[...]] contents -> (text, target)."""
    inner = inner.strip()
    if "|" in inner:
        t, to = inner.split("|", 1)
    elif "->" in inner:
        t, to = inner.split("->", 1)
    elif "<-" in inner:
        to, t = inner.split("<-", 1)
    else:
        t = to = inner
    to = re.sub(r"\]\[.*$", "", to)  # SugarCube's [[text|target][$x to 1]] setter part
    return t.strip(), to.strip()


def _value(raw):
    raw = raw.strip().rstrip(";").strip()
    low = raw.lower()
    if low in ("true", "false"):
        return "flag", low == "true"
    try:
        f = float(raw)
        return "number", int(f) if f.is_integer() else f
    except ValueError:
        pass
    if len(raw) >= 2 and raw[0] in "\"'" and raw[-1] == raw[0]:
        return "text", raw[1:-1][:200]
    return None, None


def _sets(expr):
    """One <<set ...>> / (set: ...) body -> [(var, op, type, value)] for the simple cases; others are skipped."""
    out = []
    for part in re.split(r"[;,](?![^\"']*[\"'])", expr):
        part = part.strip()
        m = re.match(r"^[$_]([A-Za-z_]\w{0,31})\s*(\+=|-=|=|to)\s*(.+)$", part)
        if not m:
            continue
        var, op, rest = m.group(1), m.group(2), m.group(3).strip()
        m2 = re.match(r"^(?:it|[$_]%s)\s*([+-])\s*(.+)$" % re.escape(var), rest)  # (set: $x to it + 1) / $x to $x - 2
        if op in ("+=", "-="):
            typ, val = _value(rest)
            if typ == "number":
                out.append((var, op[0], "number", val))
        elif m2:
            typ, val = _value(m2.group(2))
            if typ == "number":
                out.append((var, m2.group(1), "number", val))
        else:
            typ, val = _value(rest)
            if typ:
                out.append((var, "=", typ, val))
    return out


def _clean_line(s):
    s = TAG.sub("", s)
    s = html.unescape(s)
    s = s.replace("''", "**").replace("//", "*") if "http" not in s else s.replace("''", "**")
    s = VAR_REF.sub(lambda m: "[%s]" % m.group(1), s)
    return re.sub(r"[ \t]+", " ", s).strip()


def parse(text):
    """Twee or Twine HTML -> (story document, info) or raises ValueError with a friendly message."""
    text = (text or "").replace("\r\n", "\n").replace("\r", "\n")
    if "<tw-passagedata" in text:
        title, start, passages = _from_html(text)
    elif re.search(r"^::", text, re.M):
        title, start, passages = _from_twee(text)
    else:
        raise ValueError("That doesn't look like a Twine story. Paste Twee text (passages start with ::) "
                         "or choose a published Twine 2 .html file.")
    inits = {}
    for p in passages:  # StoryInit / [startup] passages hold the starting values
        if p["name"] == "StoryInit" or "startup" in p["tags"]:
            for m in list(SET_SC.finditer(p["text"])) + list(SET_HL.finditer(p["text"])):
                for var, op, typ, val in _sets(m.group(1)):
                    if op == "=":
                        inits[var] = (typ, val)
    passages = [p for p in passages if p["name"] and p["name"] not in SKIP_NAMES
                and not (set(p["tags"]) & SKIP_TAGS)][:MAX_SCENES]
    if not passages:
        raise ValueError("We couldn't find any story passages in that file.")
    ids = {p["name"]: "s%d" % (i + 1) for i, p in enumerate(passages)}

    # first pass: who speaks at least twice becomes a character
    talk = {}
    for p in passages:
        for line in p["text"].split("\n"):
            m = SPEAKER.match(TAG.sub("", line))
            if m and not LINK.search(line):
                talk[m.group(1).strip()] = talk.get(m.group(1).strip(), 0) + 1
    names = [n for n, c in sorted(talk.items(), key=lambda x: -x[1]) if c >= 2][:12]
    colors = ["#ff4f8b", "#3cc6c0", "#7a5cff", "#ff9f1c", "#2ec4b6", "#e71d36", "#4361ee", "#8ac926"]
    chars = [{"id": "c%d" % (i + 1), "name": n, "color": colors[i % len(colors)], "poses": []} for i, n in enumerate(names)]
    who = {c["name"]: c["id"] for c in chars}

    vars_ = [{"name": v, "type": t, "init": val, "note": "From Twine"} for v, (t, val) in inits.items()]
    var_types = {v: t for v, (t, val) in inits.items()}
    scenes, n_choices, n_notes, k = [], 0, 0, [0]

    def key():
        k[0] += 1
        return "t%d" % k[0]

    for p in passages:
        body = p["text"]
        steps, choices, nxt = [], [], None
        for m in list(SET_SC.finditer(body)) + list(SET_HL.finditer(body)):
            for var, op, typ, val in _sets(m.group(1)):
                if var not in var_types:
                    var_types[var] = typ
                    vars_.append({"name": var, "type": typ, "init": 0 if typ == "number" else (False if typ == "flag" else ""),
                                  "note": "From Twine"})
                steps.append({"t": "set", "var": var, "op": op, "val": val, "k": key()})
        body = SET_SC.sub("", SET_HL.sub("", body))
        for m in GOTO.finditer(body):
            target = (m.group(1) or m.group(2) or "").strip()
            if target in ids:
                nxt = ids[target]
        body = GOTO.sub("", body)
        for m in LINK.finditer(body):
            t, to = _link(m.group(1))
            if to in ids and len(choices) < 12:
                choices.append({"id": "%s_%d" % (ids[p["name"]], len(choices) + 1), "text": _clean_line(t)[:300] or to,
                                "to": ids[to], "if": "", "mode": "hide", "hint": "", "once": False, "set": []})
        body = LINK.sub("", body)
        macros = MACRO.findall(body)
        body = MACRO.sub("", body)
        lines = [x.strip() for x in body.split("\n") if x.strip()]  # Twine shows every line break: one line each
        for para in lines:
            m = SPEAKER.match(TAG.sub("", para))
            if m and m.group(1).strip() in who:
                steps.append({"t": "say", "who": who[m.group(1).strip()], "text": _clean_line(m.group(2))[:2000], "k": key()})
            else:
                txt = _clean_line(para)
                if txt:
                    steps.append({"t": "say", "text": txt[:2000], "k": key()})
        if macros:
            n_notes += 1
            steps.append({"t": "note", "text": ("Twine logic to redo here: " + " ".join(m.strip() for m in macros))[:1000], "k": key()})
        n_choices += len(choices)
        ending = None
        if not choices and not nxt:
            ending = {"kind": "neutral", "title": p["name"][:80] or "The End", "text": ""}
        x = y = None
        try:
            px, py = [float(v) for v in str(p.get("pos") or "").split(",")[:2]]
            x, y = round(px * 1.6), round(py * 1.4)
        except (TypeError, ValueError):
            pass
        scenes.append({"id": ids[p["name"]], "name": p["name"][:80], "x": x, "y": y, "note": "", "steps": steps,
                       "choices": choices, "next": nxt, "ending": ending})

    start_id = ids.get(start) or ids.get("Start") or scenes[0]["id"]
    if any(s["x"] is None for s in scenes):
        _grid(scenes, start_id)
    first = next(s for s in scenes if s["id"] == start_id)
    first["steps"].insert(0, {"t": "bg", "img": "demo:bg-sakura-park", "fx": "fade", "k": key()})
    doc = {"settings": {"orientation": "portrait", "textbox": "sakura", "accent": "#ff4f8b", "cps": 45},
           "start": start_id, "chars": chars, "vars": vars_, "scenes": scenes}
    info = {"title": title, "scenes": len(scenes), "choices": n_choices, "chars": len(chars), "vars": len(vars_),
            "notes": n_notes, "endings": len([s for s in scenes if s["ending"]])}
    return doc, info


def _grid(scenes, start_id):
    """Rows by distance from the start (breadth first); unreachable passages go in a last row."""
    by = {s["id"]: s for s in scenes}
    depth, queue = {start_id: 0}, [start_id]
    while queue:
        sid = queue.pop(0)
        s = by[sid]
        for to in [c["to"] for c in s["choices"]] + ([s["next"]] if s["next"] else []):
            if to in by and to not in depth:
                depth[to] = depth[sid] + 1
                queue.append(to)
    last = (max(depth.values()) + 1) if depth else 0
    rows = {}
    for s in scenes:
        d = depth.get(s["id"], last)
        col = rows.get(d, 0)
        rows[d] = col + 1
        s["x"], s["y"] = col * 260, d * 170
