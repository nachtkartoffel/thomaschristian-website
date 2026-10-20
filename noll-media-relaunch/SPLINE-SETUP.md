# Laptop-Animation mit Spline

Die Bühne auf den Case-Seiten (`#caseMacbook`) kann eine Spline-Szene abspielen.
Licht, Materialien, Modell und Bildschirminhalt gestaltest du in Spline;
die Website scrubbt die Animation beim Scrollen (`js/case-spline.js`).

Solange keine Szene eingetragen ist, läuft das eingebaute three.js-Laptop.

## 1. Szene anlegen

1. In Spline (spline.design) ein neues File öffnen – oder in der Community
   nach „Laptop“ / „MacBook“ suchen und **Remix** klicken.
   Vor dem Kundeneinsatz: Lizenz bzw. Nutzungsrechte der Community-Datei prüfen.
2. Hintergrund auf **Schwarz (#000000)** stellen, damit die Szene nahtlos in
   die Seite übergeht.

## 2. Objekte benennen (wichtig)

Das Script sucht Objekte über ihren Namen in der Ebenenliste:

| Name      | Was                                                                  |
| --------- | -------------------------------------------------------------------- |
| `Lid`     | Deckel (als Gruppe, Drehpunkt am Scharnier)                          |
| `Camera`  | die Kamera der Szene                                                 |
| `Website` | Fläche mit dem Website-Screenshot auf dem Display (optional)         |

## 3. States anlegen

Jedes Objekt bekommt **States** (rechte Seitenleiste → States → „+“).
Der **Base State** ist immer der Anfang.

| Objekt    | Base State                    | Weitere States                                                      |
| --------- | ----------------------------- | ------------------------------------------------------------------- |
| `Lid`     | geschlossen                   | `Open` – aufgeklappt                                                |
| `Camera`  | Blick schräg von oben         | `Open` – frontal aufs offene Laptop · `Zoom` – Display füllt das Bild · `Out` – wieder herausgezoomt |
| `Website` | oberer Teil der Seite sichtbar | `Scroll` – Screenshot nach oben verschoben (optional)              |

Die State-Namen müssen **genau so** geschrieben sein (Groß-/Kleinschreibung).

## 4. Ablauf beim Scrollen

| Scroll-Fortschritt | Was passiert                     | Objekte → State      |
| ------------------ | -------------------------------- | -------------------- |
| 0 – 20 %           | Deckel öffnet                    | Lid, Camera → Open   |
| 20 – 38 %          | Kamera fährt aufs Display        | Camera → Zoom        |
| 40 – 80 %          | Website scrollt auf dem Display  | Website → Scroll     |
| 82 – 100 %         | Kamera fährt heraus              | Camera → Out         |

Anpassen ohne Code-Änderung: an der Section ein `data-spline-timeline`
mit eigenen Schritten setzen, z. B. ohne Website-Scroll:

    data-spline-timeline='[
      {"state":"Open","from":0,"to":0.25,"objects":["Lid","Camera"]},
      {"state":"Zoom","from":0.25,"to":0.5,"objects":["Camera"]},
      {"state":"Out","from":0.8,"to":1,"objects":["Camera"]}]'

## 5. Export & Einbinden

1. In Spline: **Export → Code → Vanilla JS**.
2. In den Play-Einstellungen Orbit, Pan und Zoom der Kamera **ausschalten**,
   sonst fängt die Szene das Scrollen ab.
3. Die URL (`https://prod.spline.design/…/scene.splinecode`) kopieren.
4. In `case-ursa-chemie.html` bei `data-spline-scene="…"` eintragen.

Ob beim kostenlosen Spline-Plan ein Spline-Logo eingeblendet wird, siehe die
aktuellen Spline-Tarife. Die Szene und das Script werden aus dem Internet geladen,
die Seite braucht dafür eine Verbindung. Kann die Szene nicht geladen werden,
zeigt die Bühne den Website-Screen flach.

## Fehlersuche

Browser-Konsole öffnen (Cmd+Alt+I → Konsole). Meldungen mit `[case-spline]`
sagen z. B., welches Objekt nicht gefunden wurde oder welcher State fehlt.
