# Laptop-Modell (Case-Detailseiten)

`scene.py` baut das Laptop der Case-Seiten komplett per Script in Blender:
eigenes, markenfreies Design mit abgerundeten Kanten, einzelnen Tasten,
Trackpad, Scharnier und Display. Daraus entsteht `models/laptop.glb`, das
`js/case-laptop.js` live im Browser rendert (three.js).

## Modell neu erzeugen (z. B. nach Änderungen an Maßen oder Materialien)

Voraussetzung: Blender 4.2+ (oder `pip install bpy`).

    blender -b -P scene.py -- /tmp/out --export ../../models/laptop.glb
    python3 -c "import base64;open('../../models/laptop.glb.js','w').write('window.NOLL_LAPTOP_GLB=\"'+base64.b64encode(open('../../models/laptop.glb','rb').read()).decode()+'\";')"

`laptop.glb.js` ist dieselbe Datei als Base64 – so funktioniert die Seite
auch per Doppelklick (file://), wo Browser das Nachladen von .glb blockieren.

Wichtig für das Script auf der Seite: der Scharnier-Knoten heißt
`lid_pivot`, das Display-Rechteck `display` (darüber liegt das HTML).

Ohne `--export` rendert `scene.py` dieselbe Szene als Bildsequenz mit
Cycles (Produktshot-Qualität, z. B. für Stills oder ein Video).
