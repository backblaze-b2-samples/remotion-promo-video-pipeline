"""Shot-card library and storyboard presets, served straight from shared JSON.

`packages/shared/src/shot-cards.json` and `storyboard-presets.json` are read by
`packages/remotion` (to draw the cards) and by this API (to serve them to the
UI). There is deliberately **no second registry** in Python or TypeScript —
adding a card means editing one JSON file and one TSX component.
"""

import logging

from fastapi import APIRouter, HTTPException

from app.types.library import LibraryError, presets, shot_card_library

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/shot-cards")
def shot_cards_endpoint():
    """The 10 implemented cards, plus SFX and accent options.

    `upstream_card_count` is the full video-shotcraft taxonomy (104); this sample
    implements one card from each of its 10 categories and links upstream for the
    rest.
    """
    try:
        library = shot_card_library()
    except LibraryError as e:
        raise HTTPException(status_code=500, detail=str(e)) from None
    return {
        "cards": library["cards"],
        "sfx": library["sfx"],
        "accents": library["accents"],
        "upstream": library["upstream"],
        "upstream_card_count": library["upstream_card_count"],
        "attribution": library["attribution"],
    }


@router.get("/storyboard-presets")
def storyboard_presets_endpoint():
    try:
        return [
            {
                "id": preset["id"],
                "label": preset["label"],
                "description": preset["description"],
                "duration_frames": preset["duration_frames"],
                "shot_count": len(preset["shots"]),
                "shots": preset["shots"],
            }
            for preset in presets()
        ]
    except LibraryError as e:
        raise HTTPException(status_code=500, detail=str(e)) from None
