# Social Wall (Startseite, Sektion #insights)

Ersetzt die drei statischen Blog-Teaser durch eine Sammlung echter Beiträge
von Instagram (@noll.media), LinkedIn (noll media GmbH) und YouTube
(@noll.christian).

## Verhalten
- **Isotope-Masonry** im 4-Spalten-Raster der Seite (3 ≤1200px, 2 ≤860px).
  Querformat (YouTube) belegt 2 Spalten.
- **Filter** Alle / Instagram / LinkedIn / YouTube – Kanäle ohne Beiträge
  werden ausgeblendet (LinkedIn hat aktuell noch keine Beiträge).
- **Statische Beiträge:** Thumbnail mit weißer Kontur. Klick (oder
  Enter/Leertaste) dreht die Karte → weiße Rückseite mit schwarzem Text,
  Datum und Link zum Original. Nochmal klicken dreht zurück.
- **Videos:** Reels (`<video muted loop playsinline>`) und YouTube
  (youtube-nocookie, stumm, Autoplay, Schleife) starten erst, wenn die
  Kachel im Bild ist, und pausieren außerhalb. Auch Videokarten drehen um.
- 12 Kacheln beim Start, „Mehr anzeigen“ lädt jeweils 8 nach.
- `prefers-reduced-motion`: kein 3D-Flip (Überblendung), kein Autoplay.

## Dateien
| Datei | Zweck |
|---|---|
| `js/social-wall.js` | Baut die Kacheln, Isotope, Flip, Video-Steuerung |
| `js/vendor/isotope.pkgd.min.js` | Isotope 3.0.6 (lokal, kein CDN) |
| `js/social-wall-data.js` | Statischer Stand (Fallback, z. B. lokal per `file://`) |
| `data/social-wall.json` | Gleicher Stand als JSON + LinkedIn-Beiträge (`"linkedin": []`) |
| `api/social-wall.php` | Live-Endpunkt: Instagram Graph API + YouTube-RSS + LinkedIn aus JSON, gecacht |
| `api/social-config.sample.php` | Vorlage → als `api/social-config.php` mit Token anlegen |
| `images/social/` | Lokale Cover (`ig-<shortcode>.jpg`, `yt-<id>.jpg`) und optional Videos |
| `tools/social-wall/build_static_data.py` | Erzeugt `social-wall-data.js` + `data/social-wall.json` neu |

## Live-Betrieb (empfohlen)
1. In einer Meta-App „Instagram API with Instagram Login“ einrichten, das
   Business-/Creator-Konto @noll.media verbinden, einen **Long-Lived Token**
   erzeugen.
2. `api/social-config.sample.php` → `api/social-config.php` kopieren, Token
   eintragen. Der Token wird danach automatisch alle 30 Tage verlängert
   (`api/cache/ig-token.json`).
3. YouTube braucht nichts (öffentlicher RSS-Feed, Kanal-ID ist hinterlegt).
4. Test: `/api/social-wall.php?refresh=1`

Dann kommen neue Posts automatisch, Reels laufen als echte MP4 stumm im Grid.
Ohne Token liefert der Endpunkt YouTube live + Instagram aus dem statischen Stand.

## Statischer Stand pflegen
- Reel-Video lokal ergänzen: MP4 als `images/social/ig-<shortcode>.mp4`
  ablegen und im Datensatz `"video": "images/social/ig-<shortcode>.mp4"` setzen.
- LinkedIn-Beitrag: in `data/social-wall.json` unter `"linkedin"` eintragen:
  `{"id":"li-1","url":"…","date":"2026-10-20T09:00:00Z","text":"…","image":"images/social/li-1.jpg","ratio":"4/5"}`
  (`image` optional – ohne Bild wird der Text auf der Vorderseite gezeigt).
  Hinweis: LinkedIn erscheint so nur über den PHP-Endpunkt; für die
  `file://`-Vorschau zusätzlich in `js/social-wall-data.js` eintragen.

## Zu klären vor Livegang
- **Isotope-Lizenz:** GPLv3 bzw. für kommerzielle Nutzung die Isotope
  Commercial License (metafizzy.co, einmalig).
- **DSGVO:** YouTube-Embeds laden Inhalte von Google – auch mit
  youtube-nocookie gehört das in die Datenschutzerklärung bzw. hinter das
  Consent-Banner. Instagram-Medien kommen über den PHP-Endpunkt direkt vom
  Meta-CDN; wer das vermeiden will, kann sie serverseitig spiegeln.
- **Lokale Vorschau:** YouTube-Videos spielen nur auf http(s) (unter `file://`
  bleibt das Vorschaubild stehen – YouTube verlangt einen Referrer).
