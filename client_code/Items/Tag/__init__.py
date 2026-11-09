from anvil import *

from ._anvil_designer import TagTemplate


class Tag(TagTemplate):
    """Play page: one of the novel's tags (item = the tag text)."""

    def __init__(self, **properties):
        super().__init__(**properties)
