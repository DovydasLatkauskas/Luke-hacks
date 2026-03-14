from typing import TypedDict


class Venue(TypedDict):
    id: str
    name: str
    slot: list[str]
    address: str
    neighbourhood: str
    lat: float
    lng: float
    price_band: str
    vibe: str
    dietary_notes: str
    description: str
    tags: list[str]


VENUES: list[Venue] = [
    # Pre-drinks / bars
    {
        "id": "bramble-bar",
        "name": "Bramble Bar",
        "slot": ["pre_drinks", "bar"],
        "address": "16a Queen St, New Town",
        "neighbourhood": "New Town",
        "lat": 55.9547, "lng": -3.1965,
        "price_band": "mid",
        "vibe": "relaxed",
        "dietary_notes": "cocktails only, no food",
        "description": "Underground speakeasy-style cocktail bar, no sign above the door. Edinburgh institution.",
        "tags": ["cocktails", "underground", "no food", "intimate", "dark"],
    },
    {
        "id": "tigerlily",
        "name": "Tigerlily",
        "slot": ["pre_drinks", "bar"],
        "address": "125 George St, New Town",
        "neighbourhood": "New Town",
        "lat": 55.9536, "lng": -3.2001,
        "price_band": "splurge",
        "vibe": "lively",
        "dietary_notes": "cocktail menu, bar snacks available",
        "description": "Opulent New Town bar with plush booths, popular for group pre-drinks and cocktails.",
        "tags": ["glamorous", "cocktails", "booths", "loud", "group-friendly"],
    },
    {
        "id": "the-devils-advocate",
        "name": "The Devil's Advocate",
        "slot": ["pre_drinks", "bar"],
        "address": "9 Advocates Close, Old Town",
        "neighbourhood": "Old Town",
        "lat": 55.9494, "lng": -3.1907,
        "price_band": "mid",
        "vibe": "classic",
        "dietary_notes": "whisky bar, light bites",
        "description": "Converted Victorian pump house in a historic close, exceptional whisky selection.",
        "tags": ["whisky", "historic", "close", "atmospheric", "Old Town"],
    },
    {
        "id": "panda-and-sons",
        "name": "Panda & Sons",
        "slot": ["pre_drinks", "bar"],
        "address": "79 Queen St, New Town",
        "neighbourhood": "New Town",
        "lat": 55.9543, "lng": -3.1988,
        "price_band": "mid",
        "vibe": "hipster",
        "dietary_notes": "cocktails, no food",
        "description": "Speakeasy hidden behind a barber shop front, inventive seasonal cocktails.",
        "tags": ["speakeasy", "cocktails", "creative", "hidden", "small"],
    },
    {
        "id": "scotts-bar",
        "name": "Scott's Bar",
        "slot": ["pre_drinks", "bar"],
        "address": "202 Rose St, New Town",
        "neighbourhood": "New Town",
        "lat": 55.9527, "lng": -3.1989,
        "price_band": "budget",
        "vibe": "classic",
        "dietary_notes": "traditional pub, pies available",
        "description": "Old Rose Street boozer, cheap pints, no-nonsense atmosphere, good for kicking the night off.",
        "tags": ["traditional pub", "cheap", "Rose Street", "no-frills", "classic"],
    },
    {
        "id": "the-huxley",
        "name": "The Huxley",
        "slot": ["pre_drinks", "bar"],
        "address": "1-3 Rutland St, West End",
        "neighbourhood": "West End",
        "lat": 55.9507, "lng": -3.2084,
        "price_band": "mid",
        "vibe": "relaxed",
        "dietary_notes": "food served until late, vegetarian options",
        "description": "Relaxed pub-bar near Lothian Road with a solid whisky list and late food menu.",
        "tags": ["whisky", "late food", "relaxed", "West End", "pub-bar"],
    },
    # Dinner venues
    {
        "id": "ondine",
        "name": "Ondine",
        "slot": ["dinner"],
        "address": "2 George IV Bridge, Old Town",
        "neighbourhood": "Old Town",
        "lat": 55.9480, "lng": -3.1909,
        "price_band": "splurge",
        "vibe": "romantic",
        "dietary_notes": "seafood focus, some vegetarian options, no vegan mains",
        "description": "Upscale Scottish seafood restaurant with crustacean bar and views over Grassmarket.",
        "tags": ["seafood", "fine dining", "Scottish", "romantic", "crustacean bar"],
    },
    {
        "id": "dishoom",
        "name": "Dishoom Edinburgh",
        "slot": ["dinner"],
        "address": "3a St Andrew Square, New Town",
        "neighbourhood": "New Town",
        "lat": 55.9535, "lng": -3.1878,
        "price_band": "mid",
        "vibe": "lively",
        "dietary_notes": "extensive vegetarian and vegan menu, halal",
        "description": "Bombay cafe-style restaurant, reliably good for groups, strong vegetarian/vegan offering.",
        "tags": ["Indian", "vegetarian-friendly", "vegan", "halal", "group-friendly", "busy"],
    },
    {
        "id": "the-ivy",
        "name": "The Ivy Edinburgh",
        "slot": ["dinner"],
        "address": "41-43 George St, New Town",
        "neighbourhood": "New Town",
        "lat": 55.9534, "lng": -3.1995,
        "price_band": "splurge",
        "vibe": "romantic",
        "dietary_notes": "full vegetarian and vegan menu available",
        "description": "Classic brasserie atmosphere, reliable for celebrations and groups who want to impress.",
        "tags": ["brasserie", "classic", "celebration", "smart", "varied menu"],
    },
    {
        "id": "the-witchery",
        "name": "The Witchery by the Castle",
        "slot": ["dinner"],
        "address": "Castlehill, Royal Mile, Old Town",
        "neighbourhood": "Old Town",
        "lat": 55.9498, "lng": -3.1968,
        "price_band": "splurge",
        "vibe": "romantic",
        "dietary_notes": "Scottish menu, limited vegetarian",
        "description": "Gothic candlelit dining rooms beside Edinburgh Castle. The most theatrical restaurant in the city.",
        "tags": ["gothic", "romantic", "Scottish", "castle", "theatrical", "special occasion"],
    },
    {
        "id": "timberyard",
        "name": "Timberyard",
        "slot": ["dinner"],
        "address": "10 Lady Lawson St, Grassmarket",
        "neighbourhood": "Grassmarket",
        "lat": 55.9465, "lng": -3.1982,
        "price_band": "splurge",
        "vibe": "hipster",
        "dietary_notes": "full vegetarian tasting menu available, fermentation-forward",
        "description": "Farm-to-table tasting menus in a converted Victorian warehouse. Edinburgh's best for foodies.",
        "tags": ["tasting menu", "sustainable", "vegetarian", "industrial", "seasonal"],
    },
    {
        "id": "contini",
        "name": "Contini George Street",
        "slot": ["dinner"],
        "address": "103 George St, New Town",
        "neighbourhood": "New Town",
        "lat": 55.9534, "lng": -3.2003,
        "price_band": "mid",
        "vibe": "relaxed",
        "dietary_notes": "good vegetarian pasta, limited vegan",
        "description": "Italian all-day restaurant in a Georgian banking hall, great for easy group bookings.",
        "tags": ["Italian", "pasta", "group-friendly", "Georgian", "relaxed"],
    },
    # Late bars
    {
        "id": "cold-town-house",
        "name": "Cold Town House",
        "slot": ["bar"],
        "address": "4 Grassmarket, Old Town",
        "neighbourhood": "Grassmarket",
        "lat": 55.9470, "lng": -3.1936,
        "price_band": "budget",
        "vibe": "lively",
        "dietary_notes": "craft beer bar, bar snacks",
        "description": "Rooftop terrace bar overlooking Grassmarket with huge Edinburgh craft beer selection.",
        "tags": ["craft beer", "rooftop", "Grassmarket", "views", "lively"],
    },
    {
        "id": "sneaky-petes",
        "name": "Sneaky Pete's",
        "slot": ["bar"],
        "address": "73 Cowgate, Old Town",
        "neighbourhood": "Old Town",
        "lat": 55.9477, "lng": -3.1892,
        "price_band": "budget",
        "vibe": "lively",
        "dietary_notes": "drinks only",
        "description": "Tiny underground club on the Cowgate, electronic music, very late licence.",
        "tags": ["club", "electronic", "late", "Cowgate", "underground", "cheap"],
    },
    {
        "id": "the-voodoo-rooms",
        "name": "The Voodoo Rooms",
        "slot": ["bar"],
        "address": "19a West Register St, New Town",
        "neighbourhood": "New Town",
        "lat": 55.9532, "lng": -3.1873,
        "price_band": "mid",
        "vibe": "lively",
        "dietary_notes": "cocktail bar, no food late",
        "description": "Art Nouveau ballroom above Cafe Royal, live bands and DJs Thursday to Sunday.",
        "tags": ["live music", "ballroom", "Art Nouveau", "dancing", "New Town"],
    },
]

VENUE_BY_ID: dict[str, Venue] = {v["id"]: v for v in VENUES}


def format_venues_for_prompt() -> str:
    lines = []
    for v in VENUES:
        slots = "/".join(v["slot"])
        lines.append(
            f"- [{v['id']}] {v['name']} ({slots}) | {v['neighbourhood']} | "
            f"£{'£' * ['budget','mid','splurge'].index(v['price_band'])} | "
            f"vibe: {v['vibe']} | dietary: {v['dietary_notes']} | {v['description']}"
        )
    return "\n".join(lines)


def get_venue_for_slot(slot: str, exclude_ids: list[str] | None = None) -> Venue | None:
    exclude_ids = exclude_ids or []
    for v in VENUES:
        if slot in v["slot"] and v["id"] not in exclude_ids:
            return v
    return None
