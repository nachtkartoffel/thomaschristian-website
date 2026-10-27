/* ==========================================================================
   Cases — die eine Liste, aus der die Seite alle Case-Verweise baut:
     · Startseite: der Cases-Slider oben (index.html)
     · Cases-Übersicht: die Projektliste mit Filter (cases.html)
     · Case-Detailseiten: "Weitere Projekte" unten (case-*.html)
   Ausgegeben von js/cases.js, das vor js/main.js geladen wird.

   NEUEN CASE EINPFLEGEN
   1. Detailseite anlegen (z. B. case-kunde.html, Vorlage: case-ursa-chemie.html)
      und in deren "Weitere Projekte" data-cases-current="<slug>" setzen.
   2. Hier einen Eintrag ergänzen. Die Reihenfolge der Liste ist die
      Reihenfolge überall auf der Seite.
   3. Platzhalter (page: null) erscheinen nur in der Übersicht und füllen den
      Slider / "Weitere Projekte" auf, solange es zu wenige echte Cases gibt.
      Sobald die Seite eines Platzhalters fertig ist: page, image, intro
      eintragen – fertig.

   Felder
     slug     eindeutiger Kurzname (wie im Dateinamen der Detailseite)
     title    Kundenname
     page     Detailseite, oder null für einen Platzhalter
     client   eine Zeile: was wir gemacht haben
     intro    zwei, drei Sätze für die Übersicht
     filter   Kategorien der Übersicht: websites, werbung, content, social, seo
     tags     drei Schlagworte unter dem Bild im Startseiten-Slider
     image    Key Visual (Übersicht, Slider, Weitere Projekte)
     alt      Alternativtext zum Key Visual
   ========================================================================== */
window.NOLL_CASES = [
  {
    slug: 'ursa-chemie',
    title: 'URSA Chemie',
    page: 'case-ursa-chemie.html',
    client: 'Dynamische Website mit Karriereportal',
    intro: 'Für die URSA Chemie haben wir die Website von Grund auf neu gedacht – mit klarer Leistungsstruktur, eigenem Bildkonzept und einem System, das das Team selbst pflegen kann. Dazu ein Karriereportal, das das Team zeigt und Bewerbungen direkt anstößt.',
    filter: ['websites', 'content', 'seo'],
    tags: ['Industrie', 'Website', 'Content'],
    image: 'images/cases/ursa-hero.jpg',
    alt: 'Website der URSA Chemie auf dem Smartphone'
  },
  {
    slug: 'westerwald-bank',
    title: 'Westerwald Bank',
    page: 'case-westerwald-bank.html',
    client: 'Mobile-first Website für Immobilien',
    intro: 'Für die Immobiliengesellschaft der Westerwald Bank haben wir einen Webauftritt gebaut, der Kaufen, Verkaufen und Beratung an einem Ort zusammenführt – mobil gedacht, regional verankert und mit kurzen Wegen zum persönlichen Ansprechpartner.',
    filter: ['websites', 'seo'],
    tags: ['Immobilien', 'Website', 'SEO'],
    image: 'images/cases/wwb-hero.jpg',
    alt: 'Website der Immobiliengesellschaft der Westerwald Bank auf dem Laptop'
  },
  {
    slug: 'marx-jansen',
    title: 'Marx & Jansen',
    page: 'case-marx-jansen.html',
    client: 'Website mit Online-Bereich für Mandanten',
    intro: 'Mit dem Relaunch der Website der Marx & Jansen Steuerberatungsgesellschaft haben wir die Auszeichnung als „Digitale Kanzlei“ auch sichtbar gemacht. Mandanten finden ihren eigenen Online-Bereich mit Ansprechpartnern, digitalen Tools, FAQs und Downloads – und buchen Termine direkt online.',
    filter: ['websites'],
    tags: ['Steuerberatung', 'Website', 'Online-Portal'],
    image: 'images/cases/mj-hero.jpg',
    alt: 'Startseite der Website von Marx & Jansen'
  },

  // ---- Platzhalter: noch ohne Detailseite ------------------------------------
  {
    slug: 'awo-rheinland',
    title: 'AWO Rheinland',
    page: null,
    client: 'Website & Social-Media-Auftritt',
    intro: '',
    filter: ['websites', 'social'],
    tags: ['Web', 'Branding', 'Marketing'],
    image: 'images/mockup_case.jpg',
    alt: ''
  },
  {
    slug: 'versus-performance',
    title: 'Versus Performance',
    page: null,
    client: 'Social Ads, die Reichweite in Anfragen verwandeln',
    intro: '',
    filter: ['werbung', 'social'],
    tags: ['Web', 'Branding', 'Marketing'],
    image: 'images/mockup_case.jpg',
    alt: ''
  },
  {
    slug: 'textkracher',
    title: 'textkracher',
    page: null,
    client: 'Website mit Content, der für sich spricht',
    intro: '',
    filter: ['websites', 'content'],
    tags: ['Web', 'Branding', 'Marketing'],
    image: 'images/mockup_case.jpg',
    alt: ''
  },
  {
    slug: 'muenz',
    title: 'münz',
    page: null,
    client: 'Website, Ads & SEO aus einer Hand',
    intro: '',
    filter: ['websites', 'werbung', 'seo'],
    tags: ['Web', 'Branding', 'Marketing'],
    image: 'images/mockup_case.jpg',
    alt: ''
  }
];
