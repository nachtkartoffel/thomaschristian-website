<?php
/*
 * Liefert die Google-Bewertungen von noll media als JSON für das
 * Zitat-Modul auf der Startseite (js/google-reviews.js).
 *
 * Quelle: Google Places API (New), Place Details. Google gibt dort
 * höchstens 5 Bewertungen zurück (die "relevantesten"), daraus werden
 * die mit min_rating Sternen gefiltert. Ergebnis wird für cache_ttl
 * Sekunden zwischengespeichert; schlägt ein Abruf fehl, wird der letzte
 * gültige Stand weiter ausgeliefert.
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

$cacheFile = __DIR__ . '/cache/google-reviews.json';
$ttl = (int)($cfg['cache_ttl'] ?? 21600);

// 1) Frischer Cache vorhanden → direkt ausliefern
if (is_file($cacheFile) && (time() - filemtime($cacheFile)) < $ttl) {
    header('Cache-Control: public, max-age=600');
    readfile($cacheFile);
    exit;
}

// 2) Bei Google abrufen
function fetch_place(array $cfg): ?array {
    $url = 'https://places.googleapis.com/v1/places/' . rawurlencode($cfg['place_id'])
         . '?languageCode=' . rawurlencode($cfg['language'] ?? 'de');
    $headers = [
        'X-Goog-Api-Key: ' . $cfg['api_key'],
        'X-Goog-FieldMask: rating,userRatingCount,googleMapsUri,reviews',
    ];
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER     => $headers,
            CURLOPT_TIMEOUT        => 8,
        ]);
        $body = curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
    } else {
        $ctx = stream_context_create(['http' => [
            'header' => implode("\r\n", $headers), 'timeout' => 8, 'ignore_errors' => true,
        ]]);
        $body = @file_get_contents($url, false, $ctx);
        $code = 0;
        if (isset($http_response_header[0]) && preg_match('/\s(\d{3})\s/', $http_response_header[0], $m)) $code = (int)$m[1];
    }
    if ($body === false || $code !== 200) return null;
    $data = json_decode($body, true);
    return is_array($data) ? $data : null;
}

$place = fetch_place($cfg);

if ($place === null) {
    // 3) Fehler → alten Cache weiter nutzen, falls vorhanden
    if (is_file($cacheFile)) { readfile($cacheFile); exit; }
    http_response_code(502);
    echo json_encode(['error' => 'Google-Bewertungen konnten nicht geladen werden']);
    exit;
}

$minRating = (int)($cfg['min_rating'] ?? 5);
$maxLength = (int)($cfg['max_length'] ?? 0);
$reviews = [];
foreach ($place['reviews'] ?? [] as $r) {
    if ((int)($r['rating'] ?? 0) < $minRating) continue;
    // Originaltext bevorzugen (nicht von Google übersetzt)
    $text = trim($r['originalText']['text'] ?? $r['text']['text'] ?? '');
    if ($text === '') continue;
    if ($maxLength > 0 && mb_strlen($text) > $maxLength) continue;
    $reviews[] = [
        'text'       => $text,
        'rating'     => (int)$r['rating'],
        'author'     => $r['authorAttribution']['displayName'] ?? '',
        'authorUrl'  => $r['authorAttribution']['uri'] ?? '',
        'time'       => $r['relativePublishTimeDescription'] ?? '',
        'url'        => $r['googleMapsUri'] ?? ($place['googleMapsUri'] ?? ''),
    ];
}

$out = json_encode([
    'rating'      => $place['rating'] ?? null,
    'ratingCount' => $place['userRatingCount'] ?? null,
    'placeUrl'    => $place['googleMapsUri'] ?? '',
    'reviews'     => $reviews,
    'updated'     => date('c'),
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

@file_put_contents($cacheFile, $out, LOCK_EX);
header('Cache-Control: public, max-age=600');
echo $out;
