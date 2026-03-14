from __future__ import annotations
import asyncio
import hashlib
import httpx
from models import AgentState, Venue
from config import GOOGLE_MAPS_API_KEY

EDINBURGH_LAT = 55.9533
EDINBURGH_LNG = -3.1883

FIELD_MASK = ",".join([
    "places.id",
    "places.displayName",
    "places.formattedAddress",
    "places.location",
    "places.rating",
    "places.priceLevel",
    "places.editorialSummary",
    "places.servesVegetarianFood",
    "places.servesCocktails",
    "places.servesBeer",
    "places.primaryType",
    "places.currentOpeningHours.openNow",
])

PRICE_MAP = {
    "PRICE_LEVEL_FREE": "budget",
    "PRICE_LEVEL_INEXPENSIVE": "budget",
    "PRICE_LEVEL_MODERATE": "mid",
    "PRICE_LEVEL_EXPENSIVE": "splurge",
    "PRICE_LEVEL_VERY_EXPENSIVE": "splurge",
}

SLOT_QUERIES = [
    ("pre_drinks", "cocktail bar pub Edinburgh"),
    ("dinner",     "restaurant Edinburgh"),
    ("bar",        "bar club Edinburgh late night"),
]


def _parse_location_string(location: str | None) -> tuple[float, float] | None:
    """Parse 'near 55.94521, -3.18832' strings sent by the .NET layer."""
    if not location:
        return None
    try:
        parts = location.lower().replace("near", "").split(",")
        if len(parts) == 2:
            return float(parts[0].strip()), float(parts[1].strip())
    except ValueError:
        pass
    return None


def compute_centroid(agents: list[AgentState]) -> tuple[float, float]:
    coords: list[tuple[float, float]] = []
    for a in agents:
        if a.constraints.lat is not None and a.constraints.lng is not None:
            coords.append((a.constraints.lat, a.constraints.lng))
        else:
            parsed = _parse_location_string(a.constraints.location)
            if parsed:
                coords.append(parsed)
    if not coords:
        return EDINBURGH_LAT, EDINBURGH_LNG
    return (
        sum(lat for lat, _ in coords) / len(coords),
        sum(lng for _, lng in coords) / len(coords),
    )


async def _search_places(
    client: httpx.AsyncClient,
    query: str,
    slot: str,
    lat: float,
    lng: float,
    radius: float = 2000,
) -> list[Venue]:
    body = {
        "textQuery": query,
        "pageSize": 8,
        "rankPreference": "RELEVANCE",
        "locationBias": {
            "circle": {
                "center": {"latitude": lat, "longitude": lng},
                "radius": radius,
            }
        },
    }
    resp = await client.post(
        "https://places.googleapis.com/v1/places:searchText",
        json=body,
        headers={
            "X-Goog-Api-Key": GOOGLE_MAPS_API_KEY,
            "X-Goog-FieldMask": FIELD_MASK,
        },
    )
    resp.raise_for_status()
    data = resp.json()

    venues: list[Venue] = []
    for p in data.get("places", []):
        loc = p.get("location", {})
        place_lat = loc.get("latitude")
        place_lng = loc.get("longitude")
        if place_lat is None or place_lng is None:
            continue

        price_raw = p.get("priceLevel", "")
        price = PRICE_MAP.get(price_raw, "mid")

        dietary_parts = []
        if p.get("servesVegetarianFood"):
            dietary_parts.append("vegetarian options")
        if p.get("servesCocktails"):
            dietary_parts.append("cocktails")
        if p.get("servesBeer"):
            dietary_parts.append("beer")
        dietary = ", ".join(dietary_parts) if dietary_parts else "no info"

        summary = (p.get("editorialSummary") or {}).get("text", "")
        rating = p.get("rating")
        name = (p.get("displayName") or {}).get("text", "Unknown")
        address = p.get("formattedAddress", "Edinburgh")

        if not summary and rating:
            summary = f"Rated {rating}/5 on Google Maps."

        # Stable ID from place ID hash
        place_id = p.get("id", "")
        short_id = hashlib.md5(place_id.encode()).hexdigest()[:8]

        venues.append(Venue(
            id=short_id,
            name=name,
            slot=[slot],
            address=address,
            lat=place_lat,
            lng=place_lng,
            price_level=price,
            dietary_notes=dietary,
            description=summary or name,
            rating=rating,
        ))

    return venues


async def fetch_venues_for_session(
    agents: list[AgentState],
) -> tuple[list[Venue], float, float]:
    """
    Computes centroid from agent locations, searches Google Places for all
    three slot types in parallel, returns combined venue list + centroid.
    """
    centroid_lat, centroid_lng = compute_centroid(agents)

    async with httpx.AsyncClient(timeout=10) as client:
        results = await asyncio.gather(
            *[
                _search_places(client, query, slot, centroid_lat, centroid_lng)
                for slot, query in SLOT_QUERIES
            ],
            return_exceptions=True,
        )

    venues: list[Venue] = []
    for result in results:
        if isinstance(result, Exception):
            # One slot search failed — degrade gracefully, don't crash
            continue
        venues.extend(result)

    return venues, centroid_lat, centroid_lng


def format_venues_for_prompt(venues: list[Venue]) -> str:
    lines = []
    for v in venues:
        slot_str = "/".join(v.slot)
        rating_str = f" | ★{v.rating}" if v.rating else ""
        lines.append(
            f"- [{v.id}] {v.name} ({slot_str}) | {v.address} | "
            f"price: {v.price_level}{rating_str} | "
            f"dietary: {v.dietary_notes} | {v.description}"
        )
    return "\n".join(lines) if lines else "No venues found."


def get_venue_by_id(venues: list[Venue], venue_id: str) -> Venue | None:
    return next((v for v in venues if v.id == venue_id), None)


def get_fallback_venue(venues: list[Venue], slot: str, exclude_ids: list[str]) -> Venue | None:
    return next(
        (v for v in venues if slot in v.slot and v.id not in exclude_ids),
        None,
    )
