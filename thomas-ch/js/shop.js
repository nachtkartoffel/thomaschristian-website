/* Shop-Icon: Klick zeigt direkt unter dem Icon (linksbündig, zweizeilig) kurz „kommt noch“, nach 3 Sekunden verschwindet der Text wieder. */
(function () {
  "use strict";
  var bag = document.querySelector(".nav__bag");
  if (!bag) return;
  var note = document.createElement("span");
  note.className = "bag-note"; note.setAttribute("role", "status"); note.setAttribute("aria-live", "polite");
  note.innerHTML = "<span><span>kommt</span></span><span><span>noch</span></span>";   /* zwei Zeilen, jede gleitet aus ihrer Maske */
  bag.appendChild(note);
  var timer = 0;
  bag.addEventListener("click", function (e) {
    e.preventDefault();
    note.classList.add("is-on");
    clearTimeout(timer);
    timer = setTimeout(function () { note.classList.remove("is-on"); }, 3000);
  });
})();
