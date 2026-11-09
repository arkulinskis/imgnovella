from anvil import *

from ._anvil_designer import LandingTemplate
from ... import state

# The app's video on the Addanapp YouTube channel (APP_MAKER/youtube/manifest.json), shown in the Watch section.
YT_VIDEO = "TV4J74A9QkE"


class Landing(LandingTemplate):
    """#landing (also "About" for members): the hero IS a visual novel scene (the starter art, Mira, drifting petals,
    the pitch as her dialogue box, the buttons as choices, a story map peeking in), the Watch section (the YouTube
    video), how it works, features, a live shelf of novels, creators vs readers, questions. Static copy lives in the
    template; the shelf comes from library()."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        me = bool(state.me())
        for el in (self.cta_member, self.creators_member, self.band_member):
            el.visible = me
        for el in (self.cta_guest, self.creators_guest, self.band_guest):
            el.visible = not me
        self.dom_nodes["yt_cover"].addEventListener("click", self._play)
        self.shelf_empty.visible = False
        try:
            d = state.call_quiet("library", None, None, "popular")
        except Exception as e:
            print("library: %r" % e)
            d = None
        stories = (d or {}).get("stories") or []
        self.shelf.items = stories[:4]
        self.shelf_empty.visible = not stories

    def _play(self, event):
        """Swap the video's cover for YouTube's player (privacy-enhanced); nothing loads from YouTube before this click."""
        self.dom_nodes["yt_frame"].innerHTML = (
            '<iframe src="https://www.youtube-nocookie.com/embed/' + YT_VIDEO + '?autoplay=1&rel=0&playsinline=1" '
            'title="ImgNovella video" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen '
            'referrerpolicy="strict-origin-when-cross-origin"></iframe>')
