<?php
/*
 * Google-Bewertungen – Konfiguration
 * ----------------------------------
 * Diese Datei nach api/config.php kopieren und die Werte eintragen.
 * config.php wird von PHP ausgeführt, nicht ausgeliefert – Zugangsdaten
 * sind also nicht im Browser sichtbar. Anleitung: GOOGLE-REVIEWS.md
 */
return [
    // 'auto' = Business Profile API, sobald refresh_token gesetzt ist,
    // sonst Places API. Alternativ fest 'business' oder 'places'.
    'source' => 'auto',

    /* --- Business Profile API (empfohlen: alle Bewertungen) ------------
       Werte liefert tools/google-reviews/setup.py */
    'client_id'     => 'HIER_CLIENT_ID_EINTRAGEN',
    'client_secret' => 'HIER_CLIENT_SECRET_EINTRAGEN',
    'refresh_token' => '',
    'account_id'    => 'HIER_ACCOUNT_ID_EINTRAGEN',   // nur die Zahl, ohne "accounts/"
    'location_id'   => 'HIER_LOCATION_ID_EINTRAGEN',  // nur die Zahl, ohne "locations/"

    // Link "x Bewertungen auf Google" bzw. bei den einzelnen Zitaten.
    // setup.py gibt den Maps-Link des Profils aus.
    'place_url'     => 'https://www.google.com/maps/search/?api=1&query=noll+media+Montabaur',

    /* --- Places API (Fallback, max. 5 Bewertungen) ---------------------- */
    'api_key'  => 'HIER_API_KEY_EINTRAGEN',
    'place_id' => 'HIER_PLACE_ID_EINTRAGEN',
    'language' => 'de',

    /* --- Anzeige -------------------------------------------------------- */
    // Nur Bewertungen mit mindestens so vielen Sternen anzeigen.
    'min_rating'  => 5,
    // Sehr lange Bewertungen passen nicht ins große Zitat (Zeichen). 0 = egal.
    'max_length'  => 280,
    // Höchstens so viele Bewertungen im Wechsel zeigen (neueste zuerst).
    'max_reviews' => 8,
    // Bewertungen dieser Namen ausblenden (z. B. Mitarbeitende).
    'exclude_authors' => [],

    // Zwischenspeicher in Sekunden.
    'cache_ttl' => 6 * 3600,
    // true = ?refresh=1 lädt sofort neu (zum Testen, danach wieder false).
    'allow_refresh' => false,
];
