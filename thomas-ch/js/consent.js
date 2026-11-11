/* Cookie-Banner: Analytics nur nach Zustimmung. Die Wahl wird im Browser gespeichert und lässt sich
   jederzeit über „Cookie-Einstellungen“ unten links ändern.
   Einbindung von Analytics später:  window.thomasConsent.onAccept(function () { ... Skript laden ... });  */
(function () {
  "use strict";
  var KEY = "thomasch:analytics-consent:v1";
  var root = document.getElementById("consent"), panel = root.querySelector(".consent__panel");
  var status = root.querySelector(".consent__status"), prefs = root.querySelector(".consent__prefs");
  var choiceBtns = root.querySelectorAll("[data-choice]"), listeners = [], fired = false;

  /* Standard: alles abgelehnt, solange niemand aktiv zustimmt */
  function read() { var v = null; try { v = localStorage.getItem(KEY); } catch (e) {} return v === "accepted" ? "accepted" : "denied"; }
  function write(v) { try { localStorage.setItem(KEY, v); } catch (e) {} }
  function render() {
    var c = read();
    status.textContent = c === "accepted" ? "Analytics ist aktiv." : "Analytics ist nicht aktiv.";
    for (var i = 0; i < choiceBtns.length; i++) choiceBtns[i].setAttribute("aria-pressed", choiceBtns[i].getAttribute("data-choice") === c ? "true" : "false");
    prefs.hidden = !panel.hidden;         /* Button unten links, ausgeblendet solange das Banner offen ist */
    if (c === "accepted" && !fired) { fired = true; listeners.forEach(function (fn) { try { fn(); } catch (e) {} }); }
  }
  function open() { panel.hidden = false; root.classList.add("is-open"); render(); }
  function close() { panel.hidden = true; root.classList.remove("is-open"); render(); }

  for (var i = 0; i < choiceBtns.length; i++) choiceBtns[i].addEventListener("click", function () { write(this.getAttribute("data-choice")); render(); close(); prefs.focus(); });
  root.querySelector(".consent__close").addEventListener("click", function () { close(); if (!prefs.hidden) prefs.focus(); });
  prefs.addEventListener("click", function () { open(); var b = root.querySelector('[aria-pressed="true"]') || choiceBtns[0]; b.focus(); });

  window.thomasConsent = {
    status: read,
    onAccept: function (fn) { listeners.push(fn); if (read() === "accepted" && !fired) render(); else if (fired) fn(); },
    open: open
  };
  close();                              /* standardmäßig geschlossen, öffnet nur über den Button */
})();
