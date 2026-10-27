#!/usr/bin/env python3
"""
Schreibt data/google-reviews.json – für Hosting OHNE PHP (z. B. GitHub Pages).
Liest die Zugangsdaten aus api/config.php, holt die Bewertungen über die
Business Profile API und filtert sie genauso wie api/google-reviews.php.

  python3 tools/google-reviews/export_json.py

Mit PHP-Hosting ist das nicht nötig – dort holt api/google-reviews.php die
Bewertungen automatisch. js/google-reviews.js nimmt die JSON-Datei nur,
wenn der PHP-Endpunkt nicht antwortet.
"""
import json, os, re, sys, time, urllib.parse, urllib.request
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
cfg_txt = open(os.path.join(ROOT, "api", "config.php"), encoding="utf-8").read()

def opt(key, default=None):
    m = re.search(r"'%s'\s*=>\s*'([^']*)'" % key, cfg_txt) or re.search(r"'%s'\s*=>\s*([0-9]+)" % key, cfg_txt)
    return m.group(1) if m else default

def orig(c):
    m = re.search(r"\(Original\)\s*(.+)$", c, re.S)
    if m: return m.group(1).strip()
    return re.split(r"\s*\((?:Translated by Google|Übersetzt von Google)\)\s*", c)[0].strip()

def rel(iso):
    try: ts = datetime.fromisoformat(iso.replace("Z", "+00:00")).timestamp()
    except Exception: return ""
    d = time.time() - ts
    for sec, one, many in [(365*86400, "Jahr", "Jahren"), (30*86400, "Monat", "Monaten"), (7*86400, "Woche", "Wochen"), (86400, "Tag", "Tagen")]:
        n = int(d // sec)
        if n >= 1: return "vor " + ((("einer" if one == "Woche" else "einem") + " " + one) if n == 1 else f"{n} {many}")
    return "heute"

tok = json.load(urllib.request.urlopen("https://oauth2.googleapis.com/token", urllib.parse.urlencode({
    "client_id": opt("client_id"), "client_secret": opt("client_secret"),
    "refresh_token": opt("refresh_token"), "grant_type": "refresh_token"}).encode(), timeout=20))["access_token"]
base = f"https://mybusiness.googleapis.com/v4/accounts/{opt('account_id')}/locations/{opt('location_id')}/reviews"
raw, page, avg, total = [], "", None, None
for _ in range(4):
    q = {"pageSize": 50, "orderBy": "updateTime desc"}
    if page: q["pageToken"] = page
    d = json.load(urllib.request.urlopen(urllib.request.Request(base + "?" + urllib.parse.urlencode(q), headers={"Authorization": "Bearer " + tok}), timeout=20))
    raw += d.get("reviews", []); avg = d.get("averageRating", avg); total = d.get("totalReviewCount", total)
    page = d.get("nextPageToken", "")
    if not page: break

stars = {"ONE": 1, "TWO": 2, "THREE": 3, "FOUR": 4, "FIVE": 5}
min_r, max_len, max_n = int(opt("min_rating", 5)), int(opt("max_length", 0)), int(opt("max_reviews", 8))
place = opt("place_url", "")
out = []
for r in raw:
    text, rating = orig(r.get("comment", "")), stars.get(r.get("starRating"), 0)
    if rating < min_r or not text or (max_len and len(text) > max_len): continue
    rv = r.get("reviewer", {})
    out.append({"text": text, "rating": rating,
                "author": "Google-Nutzer:in" if rv.get("isAnonymous") else rv.get("displayName", ""),
                "authorUrl": "", "time": rel(r.get("createTime", "")), "url": place})
    if max_n and len(out) >= max_n: break

dst = os.path.join(ROOT, "data", "google-reviews.json")
json.dump({"rating": round(avg, 1) if avg is not None else None, "ratingCount": total, "placeUrl": place,
           "reviews": out, "updated": datetime.now(timezone.utc).isoformat(timespec="seconds"), "source": "static"},
          open(dst, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
# Gleicher Stand als JS (für die Vorschau per file://, dort ist fetch blockiert)
data = json.load(open(dst, encoding="utf-8"))
with open(os.path.join(ROOT, "js", "google-reviews-data.js"), "w", encoding="utf-8") as f:
    f.write("/* Statischer Stand der Google-Bewertungen (Fallback, z. B. lokal per file://).\n"
            "   Neu erzeugen: python3 tools/google-reviews/export_json.py */\n")
    f.write("window.NOLL_GOOGLE_REVIEWS = " + json.dumps(data, ensure_ascii=False, indent=2) + ";\n")
print(f"{len(out)} Bewertungen → data/google-reviews.json + js/google-reviews-data.js")
