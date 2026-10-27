# models/laptop.glb

Laptop der Case-Detailseiten (`js/case-laptop.js`, three.js).

**Modell:** „MacBook Pro M3 Space Black 16" Free" von EV_car2013 auf Sketchfab
https://sketchfab.com/3d-models/macbook-pro-m3-space-black-16-free-6b46aa09dc4d4e90a79ea06f1d0aa719
Angegebene Lizenz: CC BY 4.0 – Namensnennung erforderlich (z. B. im Impressum/Credits).

**Achtung vor dem Livegang:** Das Modell ist sehr wahrscheinlich Apples eigenes
AR-Modell (USDZ von apple.com), das ein Dritter hochgeladen hat. Die CC-Lizenz
stammt dann nicht vom Rechteinhaber; dazu kommen Apples Design-/Markenrechte
(z. B. das Logo auf dem Deckel). Für Präsentationen unkritisch – für die
öffentliche Website bitte vorher klären.

**Original:** `assets/macbook_pro_m3_space_black_16_free.glb` (17,7 MB).
**Optimiert** (gltf-transform): Texturen auf max. 1024 px als WebP, Geometrie
meshopt-komprimiert, ungenutzte UV-Sätze entfernt → 2,2 MB.
`laptop.glb.js` ist dieselbe Datei als Base64, damit die Seite auch per
Doppelklick (file://) läuft.

Knoten, die das Script benutzt (siehe `MODEL` in js/case-laptop.js):
`ctmNimOYaZdxEUt` = Deckel-Gruppe, `eVdSUYIqmtLvNwc` = Display-Panel.

# models/phone.glb

Smartphone der Case-Detailseite Westerwald Bank (`js/case-phone.js`, three.js).

**Modell:** „iPhone 16 Pro Max“ von MajdyModels (@MG990) auf Sketchfab
https://sketchfab.com/3d-models/iphone-16-pro-max-41a071ae12794b668502f58d1e0fd1a3
Angegebene Lizenz: CC BY 4.0 – Namensnennung erforderlich (z. B. im Impressum/Credits).
Gleicher Hinweis wie beim Laptop: Apples Design-/Markenrechte (Form, Logo auf
der Rückseite) vor dem Livegang klären.

**Original:** `iphone_16_pro_max.glb` (7,8 MB, Sketchfab-Export).
**Optimiert** (gltf-transform optimize, meshopt, WebP ≤ 1024 px) → `phone.glb`, 0,4 MB.
`phone.glb.js` ist dieselbe Datei als Base64 (für file://).
Das Script findet das Display über das Material `screen.001`; alles andere wird gemessen.
Das Key Visual `images/cases/wwb-hero.jpg` ist ein Standbild aus derselben Szene
(Pose über `data-still` an der Section, siehe js/case-phone.js).

# models/ipad.glb

iPad der Case-Detailseite Marx & Jansen (`js/case-ipad.js`, three.js), quer,
mit Apple Pencil, der über die Seite wischt.

**Modell:** „iPad Pro 4th generation 2020 + Apple Pencil“ von Sketchfab
(Original: `ipad_pro_4th_generation_2020__apple_pencil.glb`, 47 MB).
Lizenz und Urheber bitte auf der Sketchfab-Seite des Modells prüfen und – wie
bei Laptop und iPhone – Namensnennung im Impressum/Credits ergänzen. Gleicher
Hinweis zu Apples Design-/Markenrechten (Form, Logo) vor dem Livegang.

**Optimiert** (gltf-transform: resize ≤ 1024 px, WebP, weld, meshopt; bewusst
ohne simplify/dedup, damit Gehäuse und Materialnamen intakt bleiben) →
`ipad.glb`, 3,8 MB. `ipad.glb.js` ist dieselbe Datei als Base64 (für file://).
Das Script findet Display (Material `screen`), Deckglas (`screen_glass`,
ausgeblendet) und Stift (`Apple_Pencil`) über die Materialnamen; alles andere
wird gemessen. Das Standbild `images/cases/mj-hero-ipad.jpg` (derzeit nicht eingebunden) stammt aus
derselben Szene (Pose über `data-still` an der Section, siehe js/case-ipad.js).
