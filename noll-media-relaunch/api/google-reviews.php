<?php
/*
 * Liefert die Google-Bewertungen von noll media als JSON für das
 * Zitat-Modul auf der Startseite (js/google-reviews.js).
 *
 * Zwei Quellen (Einstellung 'source' in config.php):
 *
 *  - 'business' (empfohlen): Google Business Profile API. Liefert ALLE
 *    Bewertungen des eigenen Unternehmensprofils, inkl. Gesamtwertung.
 *    Braucht OAuth-Zugang (client_id, client_secret, refresh_token) und
 *    Account-/Standort-ID – einrichten mit tools/google-reviews/setup.py,
 *    Anleitung in GOOGLE-REVIEWS.md.
 *
 *  - 'places': Google Places API (New). Nur API-Key + Place ID nötig, aber
 *    Google gibt höchstens 5 Bewertungen zurück (Auswahl durch Google).
 *
 *  - 'auto' (Standard): 'business', sobald ein refresh_token eingetragen
 *    ist, sonst 'places'. Schlägt 'business' fehl, wird 'places' versucht.
 *
 * Ergebnis wird für cache_ttl Sekunden zwischengespeichert; schlägt ein
 * Abruf fehl, wird der letzte gültige Stand weiter ausgeliefert.
 * Antwortformat (unverändert für das Frontend):
 *   { rating, ratingCount, placeUrl, reviews:[{text,rating,author,authorUrl,time,url}], updated, source }
 */
header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

$configFile = __DIR__ . '/config.php';
if (!is_file($configFile)) {
    http_response_code(503);
    echo json_encode(['error' => 'config.php fehlt – siehe config.sample.php']);
    exit;
}
$cfg = require $configFile;

$cacheDir  = __DIR__ . '/cache';
$cacheFile = $cacheDir . '/google-reviews.json';
$ttl = (int)($cfg['cache_ttl'] ?? 21600);
$forceRefresh = isset($_GET['refresh']) && !empty($cfg['allow_refresh']);

// 1) Frischer Cache vorhanden → direkt ausliefern
if (!$forceRefresh && is_file($cacheFile) && (time() - filemtime($cacheFile)) < $ttl) {
    header('Cache-Control: public, max-age=600');
    readfile($cacheFile);
    exit;
}

/* ---------------------------------------------------------------- HTTP */

function http_request(string $method, string $url, array $headers = [], ?string $body = null): array {
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        $opts = [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER     => $headers,
            CURLOPT_TIMEOUT        => 8,
            CURLOPT_CUSTOMREQUEST  => $method,
        ];
        if ($body !== null) $opts[CURLOPT_POSTFIELDS] = $body;
        curl_setopt_array($ch, $opts);
        $res  = curl_exec($ch);
        $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        return [$code, $res === false ? null : $res];
    }
    $http = ['method' => $method, 'header' => implode("\r\n", $headers), 'timeout' => 8, 'ignore_errors' => true];
    if ($body !== null) $http['content'] = $body;
    $res = @file_get_contents($url, false, stream_context_create(['http' => $http]));
    $code = 0;
    if (isset($http_response_header[0]) && preg_match('/\s(\d{3})\s/', $http_response_header[0], $m)) $code = (int)$m[1];
    return [$code, $res === false ? null : $res];
}

function http_json(string $method, string $url, array $headers = [], ?string $body = null): ?array {
    [$code, $res] = http_request($method, $url, $headers, $body);
    if ($res === null || $code !== 200) return null;
    $data = json_decode($res, true);
    return is_array($data) ? $data : null;
}

/* ------------------------------------------------------------ Hilfen */

// "vor 3 Monaten" o. ä. aus einem ISO-Datum
function relative_time_de(string $iso): string {
    $ts = strtotime($iso);
    if (!$ts) return '';
    $d = time() - $ts;
    $units = [
        [365 * 86400, 'Jahr', 'Jahren'],
        [30 * 86400,  'Monat', 'Monaten'],
        [7 * 86400,   'Woche', 'Wochen'],
        [86400,       'Tag', 'Tagen'],
    ];
    foreach ($units as [$sec, $one, $many]) {
        $n = (int)floor($d / $sec);
        if ($n >= 1) return 'vor ' . ($n === 1 ? ($one === 'Woche' ? 'einer' : 'einem') . " $one" : "$n $many");
    }
    return 'heute';
}

// Google hängt bei fremdsprachigen Bewertungen Übersetzungen an:
// "Text\n\n(Translated by Google)\nÜbersetzung" bzw. "(Original)\nText".
// Wir zeigen immer den Originaltext.
function original_comment(string $c): string {
    if (preg_match('/\((?:Original)\)\s*(.+)$/su', $c, $m)) return trim($m[1]);
    $parts = preg_split('/\s*\((?:Translated by Google|Übersetzt von Google)\)\s*/u', $c);
    return trim($parts[0] ?? $c);
}

/* -------------------------------------------- Quelle: Business Profile */

function business_access_token(array $cfg, string $cacheDir): ?string {
    $tokFile = $cacheDir . '/google-token.json';
    if (is_file($tokFile)) {
        $t = json_decode((string)file_get_contents($tokFile), true);
        if (!empty($t['access_token']) && ($t['expires_at'] ?? 0) > time() + 60) return $t['access_token'];
    }
    $data = http_json('POST', 'https://oauth2.googleapis.com/token',
        ['Content-Type: application/x-www-form-urlencoded'],
        http_build_query([
            'client_id'     => $cfg['client_id'],
            'client_secret' => $cfg['client_secret'],
            'refresh_token' => $cfg['refresh_token'],
            'grant_type'    => 'refresh_token',
        ]));
    if (empty($data['access_token'])) return null;
    @file_put_contents($tokFile, json_encode([
        'access_token' => $data['access_token'],
        'expires_at'   => time() + (int)($data['expires_in'] ?? 3600),
    ]), LOCK_EX);
    return $data['access_token'];
}

function fetch_business(array $cfg, string $cacheDir): ?array {
    foreach (['client_id', 'client_secret', 'refresh_token', 'account_id', 'location_id'] as $k) {
        if (empty($cfg[$k]) || strpos((string)$cfg[$k], 'HIER_') === 0) return null;
    }
    $token = business_access_token($cfg, $cacheDir);
    if (!$token) return null;

    $stars = ['ONE' => 1, 'TWO' => 2, 'THREE' => 3, 'FOUR' => 4, 'FIVE' => 5];
    $base  = 'https://mybusiness.googleapis.com/v4/accounts/' . rawurlencode((string)$cfg['account_id'])
           . '/locations/' . rawurlencode((string)$cfg['location_id']) . '/reviews';
    $placeUrl = $cfg['place_url'] ?? '';

    $raw = []; $avg = null; $total = null; $pageToken = '';
    for ($page = 0; $page < 4; $page++) {           // max. 200 Bewertungen
        $q = ['pageSize' => 50, 'orderBy' => 'updateTime desc'];
        if ($pageToken !== '') $q['pageToken'] = $pageToken;
        $data = http_json('GET', $base . '?' . http_build_query($q), ['Authorization: Bearer ' . $token]);
        if ($data === null) { if ($page === 0) return null; break; }
        $avg   = $data['averageRating']   ?? $avg;
        $total = $data['totalReviewCount'] ?? $total;
        foreach ($data['reviews'] ?? [] as $r) $raw[] = $r;
        $pageToken = $data['nextPageToken'] ?? '';
        if ($pageToken === '') break;
    }

    $reviews = [];
    foreach ($raw as $r) {
        $reviewer = $r['reviewer'] ?? [];
        $reviews[] = [
            'text'      => original_comment((string)($r['comment'] ?? '')),
            'rating'    => $stars[$r['starRating'] ?? ''] ?? 0,
            'author'    => !empty($reviewer['isAnonymous']) ? 'Google-Nutzer:in' : ($reviewer['displayName'] ?? ''),
            'authorUrl' => '',
            'time'      => relative_time_de((string)($r['createTime'] ?? '')),
            'url'       => $placeUrl,
            'date'      => $r['createTime'] ?? '',
        ];
    }
    return [
        'rating'      => $avg !== null ? round((float)$avg, 1) : null,
        'ratingCount' => $total,
        'placeUrl'    => $placeUrl,
        'reviews'     => $reviews,
        'source'      => 'business',
    ];
}

/* --------------------------------------------------- Quelle: Places API */

function fetch_places(array $cfg): ?array {
    if (empty($cfg['api_key']) || empty($cfg['place_id']) || strpos((string)$cfg['api_key'], 'HIER_') === 0) return null;
    $url = 'https://places.googleapis.com/v1/places/' . rawurlencode($cfg['place_id'])
         . '?languageCode=' . rawurlencode($cfg['language'] ?? 'de');
    $place = http_json('GET', $url, [
        'X-Goog-Api-Key: ' . $cfg['api_key'],
        'X-Goog-FieldMask: rating,userRatingCount,googleMapsUri,reviews',
    ]);
    if ($place === null) return null;
    $reviews = [];
    foreach ($place['reviews'] ?? [] as $r) {
        $reviews[] = [
            // Originaltext bevorzugen (nicht von Google übersetzt)
            'text'      => trim($r['originalText']['text'] ?? $r['text']['text'] ?? ''),
            'rating'    => (int)($r['rating'] ?? 0),
            'author'    => $r['authorAttribution']['displayName'] ?? '',
            'authorUrl' => $r['authorAttribution']['uri'] ?? '',
            'time'      => $r['relativePublishTimeDescription'] ?? '',
            'url'       => $r['googleMapsUri'] ?? ($place['googleMapsUri'] ?? ''),
        ];
    }
    return [
        'rating'      => $place['rating'] ?? null,
        'ratingCount' => $place['userRatingCount'] ?? null,
        'placeUrl'    => $cfg['place_url'] ?? ($place['googleMapsUri'] ?? ''),
        'reviews'     => $reviews,
        'source'      => 'places',
    ];
}

/* ------------------------------------------------------------- Ablauf */

$source = $cfg['source'] ?? 'auto';
$result = null;
if ($source === 'business' || ($source === 'auto' && !empty($cfg['refresh_token']))) {
    $result = fetch_business($cfg, $cacheDir);
}
if ($result === null && $source !== 'business') {
    $result = fetch_places($cfg);
}

if ($result === null) {
    // Fehler → alten Cache weiter nutzen, falls vorhanden
    if (is_file($cacheFile)) { readfile($cacheFile); exit; }
    http_response_code(502);
    echo json_encode(['error' => 'Google-Bewertungen konnten nicht geladen werden']);
    exit;
}

// Filtern: Sterne, Länge, leere Texte; neueste zuerst; Anzahl begrenzen
$minRating  = (int)($cfg['min_rating'] ?? 5);
$maxLength  = (int)($cfg['max_length'] ?? 0);
$maxReviews = (int)($cfg['max_reviews'] ?? 8);
$exclude    = array_map('mb_strtolower', $cfg['exclude_authors'] ?? []);
$reviews = [];
foreach ($result['reviews'] as $r) {
    if ($r['rating'] < $minRating || $r['text'] === '') continue;
    if ($maxLength > 0 && mb_strlen($r['text']) > $maxLength) continue;
    if (in_array(mb_strtolower($r['author']), $exclude, true)) continue;
    unset($r['date']);
    $reviews[] = $r;
    if ($maxReviews > 0 && count($reviews) >= $maxReviews) break;
}

$out = json_encode([
    'rating'      => $result['rating'],
    'ratingCount' => $result['ratingCount'],
    'placeUrl'    => $result['placeUrl'],
    'reviews'     => $reviews,
    'updated'     => date('c'),
    'source'      => $result['source'],
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

@file_put_contents($cacheFile, $out, LOCK_EX);
header('Cache-Control: public, max-age=600');
echo $out;
