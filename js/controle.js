/* ===========================================================================
 * controle.js — pupitre du formateur
 * ==========================================================================*/

(() => {
  'use strict';

  /* --- Code d'exercice ------------------------------------------------------
   * Il voyage dans une adresse et doit se dicter au téléphone sans ambiguïté :
   * on n'accepte que des lettres sans accent et des chiffres. Tout le reste —
   * espaces, accents, ponctuation, majuscules — est converti ou écarté.
   */
  const nettoyer = brut => brut
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")   // é → e
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

  /* Une adresse portant un code non conforme est corrigée avant toute autre
     chose : sinon le pupitre piloterait une salle en affichant le lien d'une
     autre. Les anciens liens se trouvent ainsi remis en forme d'eux-mêmes. */
  const demande = new URLSearchParams(location.search).get("salle");
  if (demande !== null && nettoyer(demande) !== demande){
    location.replace(location.pathname + "?salle=" + (nettoyer(demande) || "defaut"));
    return;
  }

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
  const boiteQr = document.getElementById("qr");

  champSalle.value = nettoyer(Liaison.salle) || "defaut";

  const urlEcran = () =>
    location.href.split("?")[0].replace(/[^/]*$/, "explo.html")
    + "?salle=" + (champSalle.value || "defaut");

  function majLien(){
    const url = urlEcran();
    lienEcran.textContent = url;
    try{ boiteQr.innerHTML = QR.svg(url); }
    catch(e){ boiteQr.innerHTML = ""; }
  }

  /* On réécrit le champ sans faire sauter le curseur à la fin. */
  champSalle.addEventListener("input", () => {
    const avant = champSalle.value.slice(0, champSalle.selectionStart);
    const propre = nettoyer(champSalle.value);
    if (propre !== champSalle.value){
      const position = nettoyer(avant).length;
      champSalle.value = propre;
      champSalle.setSelectionRange(position, position);
    }
    majLien();
  });

  champSalle.addEventListener("change", () => {
    const code = nettoyer(champSalle.value) || "defaut";
    if (code !== Liaison.salle) location.search = "?salle=" + code;
  });

  majLien();

  document.getElementById("ouvrir").addEventListener("click", () => {
    window.open(urlEcran(), "_blank", "noopener");
  });

  /* Retour visible sur un bouton, puis remise du libellé d'origine. */
  function repondre(bouton, message){
    const origine = bouton.dataset.libelle || bouton.textContent;
    bouton.dataset.libelle = origine;
    bouton.textContent = message;
    setTimeout(() => { bouton.textContent = origine; }, 2500);
  }

  document.getElementById("copier").addEventListener("click", async e => {
    try{
      await navigator.clipboard.writeText(urlEcran());
      repondre(e.currentTarget, "Lien copié");
    }catch(err){
      repondre(e.currentTarget, "Copie refusée — sélectionnez le lien");
    }
  });

  /* Partage par le menu du téléphone : WhatsApp, SMS, courriel… Le bouton
     reste caché là où ce menu n'existe pas, la copie y suffit. */
  const boutonPartager = document.getElementById("partager");
  if (typeof navigator.share === "function"){
    boutonPartager.hidden = false;
    boutonPartager.addEventListener("click", async e => {
      try{
        await navigator.share({
          title: "Explosimètre d'exercice",
          text: "Écran du détecteur — exercice « " + (champSalle.value || "defaut") + " »",
          url: urlEcran()
        });
      }catch(err){
        // Partage annulé par l'utilisateur : rien à signaler.
        if (err && err.name !== "AbortError") repondre(e.currentTarget, "Partage impossible");
      }
    });
  }

  construire();
})();
