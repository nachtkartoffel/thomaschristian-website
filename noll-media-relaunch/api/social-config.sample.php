<?php
/*
 * Social Wall – Konfiguration
 * ---------------------------
 * Nach api/social-config.php kopieren und Werte eintragen. Die Datei wird
 * von PHP ausgeführt, nicht ausgeliefert – der Token bleibt serverseitig.
 */
return [
    // Long-Lived Access Token für @noll.media (Instagram API mit Instagram-Login).
    // Einmalig in der Meta-App erzeugen (Anleitung: SOCIAL-WALL.md).
    // Wird danach automatisch verlängert (cache/ig-token.json).
    'instagram_token'    => '',

    // YouTube-Kanal @noll.christian
    'youtube_channel_id' => 'UCsRhGT7Y4WO6q1BM7h0Lf2g',

    'instagram_limit'    => 24,
    'youtube_limit'      => 10,

    // Instagram-Medien-URLs laufen nach einigen Tagen ab – nicht zu hoch setzen.
    'cache_ttl'          => 3 * 3600,
];
