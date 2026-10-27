#!/usr/bin/env python3
"""
Einmalige Einrichtung der Google Business Profile API für api/google-reviews.php.

  python3 tools/google-reviews/setup.py pfad/zu/client_secret.json

client_secret.json = OAuth-Client vom Typ "Desktop-App" aus der Google Cloud
Console (Anleitung: GOOGLE-REVIEWS.md). Das Skript öffnet den Browser, du
meldest dich mit dem Google-Konto an, das Zugriff auf das Unternehmensprofil
hat. Danach listet es Konten + Standorte und gibt die fertigen Zeilen für
api/config.php aus. Es speichert nichts und braucht nur Python 3 (keine Pakete).
"""
import http.server, json, secrets, socket, sys, threading, urllib.parse, urllib.request, webbrowser

SCOPE = "https://www.googleapis.com/auth/business.manage"

def die(msg):
    sys.exit("\n✗ " + msg)

def http_json(url, data=None, token=None):
    headers = {"Authorization": "Bearer " + token} if token else {}
    body = urllib.parse.urlencode(data).encode() if data else None
    req = urllib.request.Request(url, data=body, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        die(f"{e.code} bei {url.split('?')[0]}\n{e.read().decode(errors='replace')[:800]}")

def main():
    if len(sys.argv) != 2:
        die("Aufruf: python3 tools/google-reviews/setup.py client_secret.json")
    conf = json.load(open(sys.argv[1]))
    conf = conf.get("installed") or conf.get("web") or die("client_secret.json hat ein unbekanntes Format")
    cid, csec = conf["client_id"], conf["client_secret"]

    # Lokalen Rückruf-Server auf freiem Port starten
    s = socket.socket(); s.bind(("127.0.0.1", 0)); port = s.getsockname()[1]; s.close()
    redirect = f"http://127.0.0.1:{port}"
    state = secrets.token_urlsafe(16)
    result = {}

    class H(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            q = dict(urllib.parse.parse_qsl(urllib.parse.urlparse(self.path).query))
            if "code" in q or "error" in q:
                result.update(q)
            self.send_response(200); self.send_header("Content-Type", "text/html; charset=utf-8"); self.end_headers()
            self.wfile.write("<p style='font:16px sans-serif'>Fertig – du kannst dieses Fenster schließen.</p>".encode())
        def log_message(self, *a): pass

    srv = http.server.HTTPServer(("127.0.0.1", port), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()

    auth = "https://accounts.google.com/o/oauth2/v2/auth?" + urllib.parse.urlencode({
        "client_id": cid, "redirect_uri": redirect, "response_type": "code", "scope": SCOPE,
        "access_type": "offline", "prompt": "consent", "state": state})
    print("Browser öffnet sich – mit dem Google-Konto anmelden, das das Unternehmensprofil verwaltet.")
    print("Falls nicht, diesen Link öffnen:\n" + auth + "\n")
    webbrowser.open(auth)
    while not result:
        threading.Event().wait(0.3)
    srv.shutdown()
    if "error" in result: die("Anmeldung abgebrochen: " + result["error"])
    if result.get("state") != state: die("Ungültige Antwort (state)")

    tok = http_json("https://oauth2.googleapis.com/token", {
        "code": result["code"], "client_id": cid, "client_secret": csec,
        "redirect_uri": redirect, "grant_type": "authorization_code"})
    refresh, access = tok.get("refresh_token"), tok["access_token"]
    if not refresh: die("Kein refresh_token erhalten – App-Zugriff unter myaccount.google.com/permissions entfernen und erneut starten.")

    accounts = http_json("https://mybusinessaccountmanagement.googleapis.com/v1/accounts", token=access).get("accounts", [])
    if not accounts: die("Keine Unternehmenskonten gefunden – ist das richtige Google-Konto angemeldet?")
    found = []
    for a in accounts:
        locs = http_json(f"https://mybusinessbusinessinformation.googleapis.com/v1/{a['name']}/locations?"
                         + urllib.parse.urlencode({"readMask": "name,title,metadata", "pageSize": 100}), token=access)
        for l in locs.get("locations", []):
            found.append((a, l))
    if not found: die("Keine Standorte gefunden.")

    print("\nGefundene Standorte:")
    for i, (a, l) in enumerate(found, 1):
        print(f"  {i}. {l.get('title','?')}  ({a.get('accountName','')})")
    pick = 1
    if len(found) > 1:
        pick = int(input("Welcher Standort? Nummer: ") or 1)
    a, l = found[pick - 1]
    meta = l.get("metadata", {})

    # Kurzer Test: kommen Bewertungen an?
    acc_id, loc_id = a["name"].split("/")[1], l["name"].split("/")[1]
    test = http_json(f"https://mybusiness.googleapis.com/v4/accounts/{acc_id}/locations/{loc_id}/reviews?pageSize=1", token=access)
    print(f"\n✓ Test ok: {test.get('totalReviewCount', 0)} Bewertungen, Schnitt {test.get('averageRating', '–')}")

    print("\nDiese Zeilen in api/config.php eintragen:\n")
    print(f"    'client_id'     => '{cid}',")
    print(f"    'client_secret' => '{csec}',")
    print(f"    'refresh_token' => '{refresh}',")
    print(f"    'account_id'    => '{acc_id}',")
    print(f"    'location_id'   => '{loc_id}',")
    if meta.get("mapsUri"):
        print(f"    'place_url'     => '{meta['mapsUri']}',")
    print("\nDen refresh_token wie ein Passwort behandeln (nicht ins Git-Repo).")

if __name__ == "__main__":
    main()
