# Google-Bewertungen (Startseite, Sektion #kundenzitate)

## Stand (26.10.2026)
Eingerichtet und getestet: Projekt „noll media Website“ (noll-media-website),
OAuth-App „In Produktion“, Desktop-Client, Zugang für busenkellthomas@gmail.com.
`api/config.php` ist fertig ausgefüllt (Konto 109244729891780051294,
Standort 8080942889881253330). Abruf liefert 10 Bewertungen, Schnitt 5,0.

**Mit PHP-Hosting:** `api/` inkl. `config.php` hochladen – fertig, die Seite
aktualisiert sich alle 6 h von selbst.

**Ohne PHP (z. B. GitHub Pages):** Die Seite nimmt automatisch
`data/google-reviews.json`. Neu erzeugen mit
`python3 tools/google-reviews/export_json.py` (aktualisiert sich dann nicht
von selbst).

Das große Zitat auf der Startseite zeigt echte 5-Sterne-Bewertungen von
Google im Wechsel (Punkte zum Durchklicken, darunter „4,9 von 5 Sternen ·
xx Bewertungen auf Google“). Ohne Konfiguration bleibt das statische Zitat stehen.

## Dateien
| Datei | Zweck |
|---|---|
| `api/google-reviews.php` | Holt die Bewertungen serverseitig, filtert, cacht (6 h) |
| `api/config.sample.php` | Vorlage → als `api/config.php` anlegen (nicht ins Git!) |
| `js/google-reviews.js` | Zeigt die Bewertungen im Zitat-Modul |
| `tools/google-reviews/setup.py` | Einmalige OAuth-Einrichtung, gibt die config-Zeilen aus |

Besucher laden nichts von Google – der Abruf läuft nur auf dem Server.

## Quelle A: Business Profile API (empfohlen – alle Bewertungen)

1. **API-Zugang beantragen** (dauert meist einige Tage)
   - In der [Google Cloud Console](https://console.cloud.google.com/) ein
     Projekt anlegen, z. B. „noll media Website“, Projektnummer notieren.
   - Zugang beantragen: <https://developers.google.com/my-business/content/prereqs>
     → „Request access to the API“. Das Unternehmensprofil muss bestätigt
     und seit mindestens 60 Tagen aktiv sein, die Website muss eingetragen sein.
   - Bis zur Freigabe liegt das Kontingent bei 0 – vorher schlägt jeder Abruf fehl.
2. **APIs aktivieren** (APIs & Dienste → Bibliothek)
   - My Business Account Management API
   - My Business Business Information API
   - Google My Business API (erscheint erst nach der Freigabe)
3. **OAuth einrichten** (APIs & Dienste → OAuth-Zustimmungsbildschirm)
   - Typ „Extern“, App-Name, Support-Mail, fertig.
   - **Veröffentlichungsstatus auf „In Produktion“ stellen.** Im Testmodus
     verfällt der Token nach 7 Tagen und die Bewertungen verschwinden.
     (Eine Google-Prüfung ist nicht nötig, die Warnung „nicht überprüfte
     App“ beim Anmelden einfach über „Erweitert“ bestätigen.)
   - Anmeldedaten → „OAuth-Client-ID erstellen“ → Typ **Desktop-App** →
     JSON herunterladen.
4. **Einrichtung am Mac**
   ```
   cd ~/Desktop/noll-media-relaunch_v02
   python3 tools/google-reviews/setup.py ~/Downloads/client_secret_XXX.json
   ```
   Im Browser mit dem Google-Konto anmelden, das das Profil von noll media
   verwaltet. Das Skript prüft den Zugriff und gibt die Zeilen für die config aus.
5. **Auf dem Server**: `api/config.sample.php` → `api/config.php`, Zeilen
   eintragen, hochladen. Testen: `allow_refresh => true`, dann
   `/api/google-reviews.php?refresh=1` aufrufen – `"source":"business"`
   heißt, es läuft. Danach `allow_refresh` wieder auf `false`.

## Quelle B: Places API (Fallback – max. 5 Bewertungen)
API-Key mit „Places API (New)“ + Place ID in `api/config.php` eintragen,
`refresh_token` leer lassen. Google wählt die 5 Bewertungen selbst aus.
Hinweis: Laut Google-Nutzungsbedingungen dürfen Places-Inhalte eigentlich
nicht zwischengespeichert werden – ein Grund mehr für Quelle A.

## Einstellungen (`api/config.php`)
- `min_rating` (5) – nur Bewertungen ab so vielen Sternen
- `max_length` (280) – längere Texte passen nicht ins Zitat-Layout
- `max_reviews` (8) – so viele wechseln sich ab, neueste zuerst
- `exclude_authors` – Namen ausblenden (z. B. Mitarbeitende)
- `cache_ttl` – Zwischenspeicher in Sekunden (Standard 6 h)

## Hinweise
- `api/config.php` enthält Zugangsdaten → nicht ins Git-Repo, nur auf den Server.
- `api/cache/` muss für PHP beschreibbar sein (wird per .htaccess gesperrt).
- Den Bereich in der Datenschutzerklärung kurz erwähnen (Bewertungsinhalte
  stammen von Google). Da Besucher keine Verbindung zu Google aufbauen,
  ist kein Consent nötig.
