<?php
/*
 * Google-Bewertungen – Konfiguration
 * ----------------------------------
 * Diese Datei nach api/config.php kopieren und die Werte eintragen.
 * config.php wird von PHP ausgeführt, nicht ausgeliefert – der API-Key
 * ist also nicht im Browser sichtbar.
 */
return [
    // Google Maps Platform API-Key mit aktivierter "Places API (New)".
    // In der Cloud Console am besten auf die Server-IP beschränken.
    'api_key'    => 'HIER_API_KEY_EINTRAGEN',

    // Place ID des Google-Unternehmensprofils von noll media.
    // Finden: https://developers.google.com/maps/documentation/places/web-service/place-id
    'place_id'   => 'HIER_PLACE_ID_EINTRAGEN',

    // Sprache, in der Google Meta-Texte ("vor 2 Monaten") liefert.
    'language'   => 'de',

    // Nur Bewertungen mit mindestens so vielen Sternen anzeigen.
    'min_rating' => 5,

    // Sehr lange Bewertungen passen nicht ins große Zitat-Layout und werden
    // übersprungen (Zeichen). 0 = keine Begrenzung.
    'max_length' => 280,

    // Wie lange die Antwort zwischengespeichert wird (Sekunden).
    // Spart API-Kosten: statt bei jedem Seitenaufruf nur alle paar Stunden.
    'cache_ttl'  => 6 * 3600,
];
