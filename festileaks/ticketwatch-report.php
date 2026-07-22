<?php
/**
 * Ticket Watch — report endpoint.
 *
 * Receives one price measurement (posted by the Tampermonkey userscript
 * running in the browser that visits the Ticketmaster page) and appends
 * it to ticketwatch-data.json. Not routed through WordPress on purpose —
 * this only needs a shared-secret check and a JSON file, so it stays a
 * plain script instead of a WP REST route.
 */

// ======================= CONFIG - PAS DIT AAN INDIEN GEWENST =======================
const REPORT_SECRET = 'RIJlyg3UdcYTmWc0sZZ1k1o9PN1YhVMx_kGWCfGqROk';
const DATA_FILE = __DIR__ . '/ticketwatch-data.json';
const MAX_HISTORY_POINTS = 5000;
const PRICE_THRESHOLD = 300; // stuur een ntfy-melding als de laagste prijs hieronder komt
const NTFY_TOPIC = ''; // laat leeg om ntfy-meldingen uit te schakelen
const NTFY_SERVER = 'https://ntfy.sh';
// =====================================================================================

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Alleen POST is toegestaan.']);
    exit;
}

$authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
$providedSecret = preg_match('/^Bearer\s+(.+)$/i', $authHeader, $m) ? $m[1] : '';
if (!hash_equals(REPORT_SECRET, $providedSecret)) {
    http_response_code(401);
    echo json_encode(['error' => 'Ongeldig of ontbrekend secret.']);
    exit;
}

$raw = file_get_contents('php://input');
$point = json_decode($raw, true);

if (!is_array($point) || !isset($point['timestamp']) || !is_string($point['timestamp'])) {
    http_response_code(400);
    echo json_encode(['error' => 'Ongeldige payload.']);
    exit;
}

function numOrNull($v) {
    return is_numeric($v) ? (float) $v : null;
}

$cleanPoint = [
    'timestamp' => substr((string) $point['timestamp'], 0, 40),
    'lowest' => numOrNull($point['lowest'] ?? null),
    'highest' => numOrNull($point['highest'] ?? null),
    'average' => numOrNull($point['average'] ?? null),
    'totalTickets' => isset($point['totalTickets']) ? max(0, (int) $point['totalTickets']) : 0,
    'totalListings' => isset($point['totalListings']) ? max(0, (int) $point['totalListings']) : 0,
];

$fp = fopen(DATA_FILE, 'c+');
if (!$fp) {
    http_response_code(500);
    echo json_encode(['error' => 'Kon data-bestand niet openen.']);
    exit;
}

flock($fp, LOCK_EX);

$existingRaw = stream_get_contents($fp);
$history = json_decode($existingRaw, true);
if (!is_array($history) || !isset($history['points']) || !is_array($history['points'])) {
    $history = ['points' => [], 'lastNotifiedPrice' => null];
}

$history['points'][] = $cleanPoint;
if (count($history['points']) > MAX_HISTORY_POINTS) {
    $history['points'] = array_slice($history['points'], -MAX_HISTORY_POINTS);
}

$notified = false;
if ($cleanPoint['lowest'] !== null && $cleanPoint['lowest'] <= PRICE_THRESHOLD) {
    $last = $history['lastNotifiedPrice'] ?? null;
    if ($last === null || $cleanPoint['lowest'] < $last) {
        $history['lastNotifiedPrice'] = $cleanPoint['lowest'];
        $notified = true;
    }
}

ftruncate($fp, 0);
rewind($fp);
fwrite($fp, json_encode($history, JSON_PRETTY_PRINT));
fflush($fp);
flock($fp, LOCK_UN);
fclose($fp);

if ($notified && NTFY_TOPIC !== '') {
    $ch = curl_init(NTFY_SERVER . '/' . NTFY_TOPIC);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => sprintf(
            'Doorverkoopticket gevonden voor € %.2f (drempel: € %d). Snel checken!',
            $cleanPoint['lowest'],
            PRICE_THRESHOLD
        ),
        CURLOPT_HTTPHEADER => ['Title: Ticket goedkoop!', 'Priority: urgent', 'Tags: moneybag,tada'],
        CURLOPT_TIMEOUT => 5,
        CURLOPT_RETURNTRANSFER => true,
    ]);
    curl_exec($ch);
    curl_close($ch);
}

echo json_encode(['ok' => true, 'totalPoints' => count($history['points'])]);
