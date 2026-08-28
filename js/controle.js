/* ===========================================================================
 * controle.js — pupitre du formateur
 * ==========================================================================*/

(() => {
  'use strict';

  let etat = structuredClone(ETAT_DEFAUT);
  let premierRecu = false;

  const envoyer = () => Liaison.envoyer(etat);

  // --- Liaison avec l'écran ------------------------------------------------

  const voyant = document.getElementById("voyant");
  const texteEtat = document.getElementById("texteEtat");

  Liaison.demarrer({
    defaut: ETAT_DEFAUT,
    surEtat(recu){
      // On ne se laisse écraser qu'au premier chargement : sinon les curseurs
      // sauteraient sous les doigts pendant qu'on les manipule.
      if (premierRecu) return;
      premierRecu = true;
      if (recu && recu.cibles) etat = Mesure.completer(recu);
      else envoyer();                 // base vide : on y dépose l'état de départ
      construire();
    },
    surVoyant(niveau, texte){
      voyant.className = "voyant " + niveau;
      texteEtat.textContent = texte;
    }
  });

  // --- Curseurs de gaz -----------------------------------------------------

  const carteGaz = document.getElementById("carteGaz");

  function construire(){
    carteGaz.querySelectorAll(".gaz").forEach(n => n.remove());
    for (const g of GAZ){
      const bloc = document.createElement("div");
      bloc.className = "gaz";
      bloc.innerHTML = `
        <div class="ligne">
          <span class="nom">${g.nom}<em>${g.plein}</em></span>
          <span class="lecture" id="lec-${g.id}"></span>
        </div>
        <input type="range" id="rng-${g.id}" min="0" step="${g.pas}">
        <div class="bornes"><span>0</span><span id="borne-${g.id}"></span></div>`;
      carteGaz.appendChild(bloc);

      const rng = bloc.querySelector("input[type=range]");
      rng.max = Mesure.borneCurseur(etat, g.id);
      rng.value = etat.cibles[g.id];
      rng.addEventListener("input", () => {
        etat.cibles[g.id] = Number(rng.value);
        majLecture(g);
        envoyer();
      });
      majLecture(g);
    }
    majSeuils();
    document.getElementById("reponse").value = String(etat.reponse);
  }

  function majLecture(g){
    const v = Number(etat.cibles[g.id]);
    const lecture = document.getElementById("lec-" + g.id);
    if (!lecture) return;

    lecture.className = "lecture a" + Mesure.niveau(etat, g.id, v);
    lecture.innerHTML = Mesure.horsGamme(etat, g.id, v)
      ? 'OL <small>hors gamme</small>'
      : v.toFixed(g.dec) + `<small>${g.unite}</small>`;

    const rng = document.getElementById("rng-" + g.id);
    if (rng){
      rng.max = Mesure.borneCurseur(etat, g.id);
      if (Number(rng.value) !== v) rng.value = v;
    }
    const borne = document.getElementById("borne-" + g.id);
    if (borne) borne.textContent = Mesure.borneCurseur(etat, g.id) + " " + g.unite;
  }

  const majToutes = () => GAZ.forEach(majLecture);

  // --- Seuils et gamme de mesure -------------------------------------------

  const grilleSeuils = document.getElementById("seuils");

  function majSeuils(){
    grilleSeuils.querySelectorAll(".rangee").forEach(n => n.remove());
    for (const g of GAZ){
      const nom = document.createElement("span");
      nom.className = "g rangee";
      nom.innerHTML = `${g.nom} <span class="unite">${g.unite}</span>`;
      grilleSeuils.appendChild(nom);

      const champ = (valeur, appliquer) => {
        const c = document.createElement("input");
        c.className = "rangee";
        c.type = "number"; c.step = g.pas; c.min = 0;
        c.value = valeur;
        c.addEventListener("change", () => { appliquer(Number(c.value)); majToutes(); envoyer(); });
        grilleSeuils.appendChild(c);
      };

      champ(etat.seuils[g.id][0], v => etat.seuils[g.id][0] = v);
      champ(etat.seuils[g.id][1], v => etat.seuils[g.id][1] = v);
      champ(etat.gamme[g.id], v => {
        etat.gamme[g.id] = Math.max(v, 1);
        // La consigne ne peut pas dépasser d'un cran la nouvelle gamme.
        etat.cibles[g.id] = Math.min(Number(etat.cibles[g.id]), Mesure.borneCurseur(etat, g.id));
      });
    }
  }

  // --- Scénarios -----------------------------------------------------------

  const boiteScenarios = document.getElementById("scenarios");
  for (const s of SCENARIOS){
    const b = document.createElement("button");
    b.innerHTML = `<b>${s.t}</b><i>${s.d}</i>`;
    b.addEventListener("click", () => { etat.cibles = {...s.v}; majToutes(); envoyer(); });
    boiteScenarios.appendChild(b);
  }

  // --- Commandes -----------------------------------------------------------

  document.getElementById("reponse").addEventListener("change", e => {
    etat.reponse = Number(e.target.value);
    envoyer();
  });
  document.getElementById("airNeuf").addEventListener("click", () => {
    etat.cibles = {...ETAT_DEFAUT.cibles};
    majToutes(); envoyer();
  });
  document.getElementById("raz").addEventListener("click", () => {
    etat.raz = (etat.raz || 0) + 1;
    envoyer();
  });

  // --- Code d'exercice et lien pour l'équipe -------------------------------

  const champSalle = document.getElementById("salle");
  const lienEcran = document.getElementById("lienEcran");
  champSalle.value = Liaison.salle;

  const urlEcran = () =>
    location.href.split("?")[0].replace(/[^/]*$/, "explo.html")
    + "?salle=" + encodeURIComponent(champSalle.value || "defaut");

  const majLien = () => { lienEcran.textContent = urlEcran(); };
  majLien();

  champSalle.addEventListener("input", majLien);
  champSalle.addEventListener("change", () => {
    const code = (champSalle.value || "defaut").replace(/[^A-Za-z0-9_-]/g, "");
    location.search = "?salle=" + encodeURIComponent(code || "defaut");
  });

  document.getElementById("ouvrir").addEventListener("click", () => {
    window.open(urlEcran(), "_blank", "noopener");
  });

  document.getElementById("copier").addEventListener("click", async () => {
    const bouton = document.getElementById("copier");
    const texteOrigine = "Copier le lien de l'écran";
    try{
      await navigator.clipboard.writeText(urlEcran());
      bouton.textContent = "Lien copié";
    }catch(e){
      bouton.textContent = "Copie refusée — sélectionnez le lien";
    }
    setTimeout(() => { bouton.textContent = texteOrigine; }, 2500);
  });

  construire();
})();
