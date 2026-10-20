<?php
/*
 * Social Wall – liefert die Beiträge für #insights auf der Startseite
 * (js/social-wall.js) als JSON.
 *
 * Quellen
 *  - Instagram: Instagram API mit Instagram-Login (graph.instagram.com),
 *    benötigt einen Long-Lived Access Token des Kontos @noll.media.
 *    Der Token wird automatisch verlängert (gültig 60 Tage, Refresh ab
 *    Tag 30) und in cache/ig-token.json fortgeschrieben.
 *  - YouTube: öffentlicher RSS-Feed des Kanals (kein API-Key nötig).
 *  - LinkedIn: Die Community-Management-API ist nur für freigegebene Apps
 *    zugänglich – Beiträge werden deshalb in data/social-wall.json unter
 *    "linkedin" gepflegt und hier zusammengeführt.
 *
 * Antwort wird cache_ttl Sekunden zwischengespeichert. Schlägt eine Quelle
 * fehl, wird für sie der letzte gültige Stand bzw. data/social-wall.json
 * verwendet – die Wall bleibt also nie leer.
 */
header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

$root       = dirname(__DIR__);
$configFile = __DIR__ . '/social-config.php';
$cfg = is_file($configFile) ? require $configFile : [];
$cfg += [
    'instagram_token'    => '',
    'youtube_channel_id' => 'UCsRhGT7Y4WO6q1BM7h0Lf2g',
    'instagram_limit'    => 24,
    'youtube_limit'      => 10,
    'cache_ttl'          => 3 * 3600,
];

$cacheDir  = __DIR__ . '/cache';
$cacheFile = $cacheDir . '/social-wall.json';
$ttl       = (int)$cfg['cache_ttl'];
if (!is_dir($cacheDir)) @mkdir($cacheDir, 0755, true);

// 1) Frischer Cache → direkt ausliefern
if (is_file($cacheFile) && (time() - filemtime($cacheFile)) < $ttl && !isset($_GET['refresh'])) {
    header('Cache-Control: public, max-age=600');
    readfile($cacheFile);
    exit;
}

function http_get(string $url, int $timeout = 8): ?string {
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_TIMEOUT        => $timeout,
            CURLOPT_USERAGENT      => 'noll-media-social-wall/1.0',
        ]);
        $body = curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        return ($body !== false && $code === 200) ? $body : null;
    }
    $ctx  = stream_context_create(['http' => ['timeout' => $timeout, 'ignore_errors' => false]]);
    $body = @file_get_contents($url, false, $ctx);
    return $body === false ? null : $body;
}

function iso_date(string $s): string {
    $t = strtotime($s);
    return $t ? gmdate('Y-m-d\TH:i:s\Z', $t) : $s;
}

/* ---------- Instagram ---------- */
function instagram_token(array $cfg, string $cacheDir): string {
    $file = $cacheDir . '/ig-token.json';
    $state = is_file($file) ? json_decode((string)file_get_contents($file), true) : null;
    $token = $state['token'] ?? $cfg['instagram_token'];
    if (!$token) return '';
    $refreshedAt = (int)($state['refreshed_at'] ?? 0);
    // Long-Lived Tokens laufen nach 60 Tagen ab → spätestens alle 30 Tage erneuern
    if (time() - $refreshedAt > 30 * 86400) {
        $res = http_get('https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=' . rawurlencode($token));
        $data = $res ? json_decode($res, true) : null;
        if (!empty($data['access_token'])) {
            $token = $data['access_token'];
            @file_put_contents($file, json_encode(['token' => $token, 'refreshed_at' => time()]));
        } elseif (!$state) {
            @file_put_contents($file, json_encode(['token' => $token, 'refreshed_at' => time()]));
        }
    }
    return $token;
}

function fetch_instagram(array $cfg, string $cacheDir): ?array {
    $token = instagram_token($cfg, $cacheDir);
    if (!$token) return null;
    $fields = 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,children{media_type,media_url,thumbnail_url}';
    $url = 'https://graph.instagram.com/me/media?fields=' . rawurlencode($fields)
         . '&limit=' . (int)$cfg['instagram_limit'] . '&access_token=' . rawurlencode($token);
    $res = http_get($url);
    $data = $res ? json_decode($res, true) : null;
    if (!isset($data['data']) || !is_array($data['data'])) return null;

    $items = [];
    foreach ($data['data'] as $m) {
        $type = $m['media_type'] ?? 'IMAGE';
        $first = $m;
        if ($type === 'CAROUSEL_ALBUM' && !empty($m['children']['data'][0])) {
            $first = $m['children']['data'][0];
        }
        $isVideo = ($first['media_type'] ?? '') === 'VIDEO';
        $isReel  = strpos($m['permalink'] ?? '', '/reel/') !== false;
        $items[] = [
            'id'      => 'ig-' . $m['id'],
            'network' => 'instagram',
            'type'    => $isVideo ? 'video' : 'image',
            'url'     => $m['permalink'] ?? 'https://www.instagram.com/noll.media/',
            'image'   => $isVideo ? ($first['thumbnail_url'] ?? null) : ($first['media_url'] ?? null),
            'video'   => $isVideo ? ($first['media_url'] ?? null) : null,
            // Graph API liefert keine Maße: Reels 9:16, sonst Instagram-Standard 4:5
            'ratio'   => ($isVideo || $isReel) ? '9/16' : '4/5',
            'date'    => iso_date($m['timestamp'] ?? ''),
            'text'    => $m['caption'] ?? '',
        ];
    }
    return $items;
}

/* ---------- YouTube (RSS) ---------- */
function fetch_youtube(array $cfg): ?array {
    if (!$cfg['youtube_channel_id']) return null;
    $xml = http_get('https://www.youtube.com/feeds/videos.xml?channel_id=' . rawurlencode($cfg['youtube_channel_id']));
    if (!$xml) return null;
    $feed = @simplexml_load_string($xml);
    if (!$feed) return null;
    $items = [];
    foreach ($feed->entry as $entry) {
        $yt    = $entry->children('http://www.youtube.com/xml/schemas/2015');
        $media = $entry->children('http://search.yahoo.com/mrss/');
        $id    = (string)$yt->videoId;
        if (!$id) continue;
        $link  = (string)$entry->link['href'];
        $desc  = (string)$media->group->description;
        // Kapitelmarken etc. abschneiden – auf der Karte reichen die ersten Absätze
        $desc  = trim(preg_split('/\n\s*(⏱|\d{1,2}:\d{2}\s)/u', $desc)[0]);
        $items[] = [
            'id'        => 'yt-' . $id,
            'network'   => 'youtube',
            'type'      => strpos($link, '/shorts/') !== false ? 'youtube-short' : 'youtube',
            'youtubeId' => $id,
            'url'       => $link ?: 'https://www.youtube.com/watch?v=' . $id,
            'image'     => 'https://i.ytimg.com/vi/' . $id . '/maxresdefault.jpg',
            'ratio'     => strpos($link, '/shorts/') !== false ? '9/16' : '16/9',
            'date'      => iso_date((string)$entry->published),
            'title'     => (string)$entry->title,
            'text'      => mb_substr($desc, 0, 700),
        ];
        if (count($items) >= (int)$cfg['youtube_limit']) break;
    }
    foreach ($items as &$it) if ($it['type'] === 'youtube-short') $it['type'] = 'youtube';
    return $items;
}

/* ---------- Zusammenführen ---------- */
$static = json_decode((string)@file_get_contents($root . '/data/social-wall.json'), true) ?: [];
$staticItems = $static['items'] ?? [];
$byNetwork = fn(array $list, string $n) => array_values(array_filter($list, fn($i) => ($i['network'] ?? '') === $n));
$previous = is_file($cacheFile) ? (json_decode((string)file_get_contents($cacheFile), true)['items'] ?? []) : [];

$instagram = fetch_instagram($cfg, $cacheDir)
          ?? ($byNetwork($previous, 'instagram') ?: $byNetwork($staticItems, 'instagram'));
$youtube   = fetch_youtube($cfg)
          ?? ($byNetwork($previous, 'youtube') ?: $byNetwork($staticItems, 'youtube'));
$linkedin  = array_map(fn($i) => $i + ['network' => 'linkedin', 'type' => !empty($i['image']) ? 'image' : 'text'],
                       $static['linkedin'] ?? []);

$items = array_merge($instagram, $youtube, $linkedin);
usort($items, fn($a, $b) => strcmp($b['date'] ?? '', $a['date'] ?? ''));

$out = json_encode(['generated' => gmdate('c'), 'items' => $items], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
@file_put_contents($cacheFile, $out, LOCK_EX);
header('Cache-Control: public, max-age=600');
echo $out;
