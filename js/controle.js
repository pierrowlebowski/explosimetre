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

  // --- Compteur d'écrans ---------------------------------------------------

  /* Compte les détecteurs ouverts par l'équipe sur cette salle. Un écran qui
     disparaît met une quinzaine de secondes à être décompté — le temps que
     Firebase constate la rupture, plus un délai de grâce. Le compte reste
     masqué quand il n'est pas disponible : mieux vaut rien qu'un zéro faux. */
  const compteur = document.getElementById("compteur");

  function majCompteur(nombre){
    if (nombre === null || nombre === undefined){ compteur.hidden = true; return; }
    compteur.hidden = false;
    compteur.classList.toggle("vide", nombre === 0);
    compteur.innerHTML = nombre === 0
      ? "Aucun écran connecté"
      : "<b>" + nombre + "</b> écran" + (nombre > 1 ? "s connectés" : " connecté");
  }

  // --- Liaison avec l'écran ------------------------------------------------

  const voyant = document.getElementById("voyant");
  const texteEtat = document.getElementById("texteEtat");

  Liaison.demarrer({
    defaut: ETAT_DEFAUT,
    surPresence: majCompteur,
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

  /* Le QR code des formateurs mène toujours à la même salle : les seuils y sont
     partagés, et une valeur changée par mégarde vaudrait pour tout le monde.
     Ils s'affichent donc en lecture seule, et il faut demander à les modifier. */
  let modeEdition = false;

  function majSeuils(){
    grilleSeuils.querySelectorAll(".rangee").forEach(n => n.remove());
    for (const g of GAZ){
      const nom = document.createElement("span");
      nom.className = "g rangee";
      nom.innerHTML = `${g.nom} <span class="unite">${g.unite}</span>`;
      grilleSeuils.appendChild(nom);

      const cellule = (valeur, appliquer) => {
        if (!modeEdition){
          const lecture = document.createElement("span");
          lecture.className = "rangee lecture-seuil";
          lecture.textContent = valeur;
          grilleSeuils.appendChild(lecture);
          return;
        }
        const c = document.createElement("input");
        c.className = "rangee";
        c.type = "number"; c.step = g.pas; c.min = 0;
        c.value = valeur;
        c.addEventListener("change", () => { appliquer(Number(c.value)); majToutes(); envoyer(); });
        grilleSeuils.appendChild(c);
      };

      cellule(etat.seuils[g.id][0], v => etat.seuils[g.id][0] = v);
      cellule(etat.seuils[g.id][1], v => etat.seuils[g.id][1] = v);
      cellule(etat.gamme[g.id], v => {
        etat.gamme[g.id] = Math.max(v, 1);
        // La consigne ne peut pas dépasser d'un cran la nouvelle gamme.
        etat.cibles[g.id] = Math.min(Number(etat.cibles[g.id]), Mesure.borneCurseur(etat, g.id));
      });
    }
  }

  const boutonModifier = document.getElementById("modifierSeuils");
  const boutonUsine = document.getElementById("usine");
  const aideSeuils = document.getElementById("aideSeuils");

  const LECTURE = "Les seuils sont en lecture seule : plusieurs formateurs partagent "
                + "la même salle, une valeur changée par mégarde vaudrait pour tout le monde.";
  const EDITION = "Modification en cours. « Réglages d'usine » remet seuils, gammes "
                + "et temps de réponse aux valeurs de js/config.js, sans toucher aux gaz en cours.";

  function majModeSeuils(){
    boutonModifier.textContent = modeEdition ? "Terminer" : "Modifier les seuils";
    boutonModifier.classList.toggle("principal", modeEdition);
    boutonModifier.classList.toggle("secondaire", !modeEdition);
    boutonUsine.hidden = !modeEdition;
    aideSeuils.textContent = modeEdition ? EDITION : LECTURE;
    majSeuils();
  }

  boutonModifier.addEventListener("click", () => {
    modeEdition = !modeEdition;
    majModeSeuils();
  });

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

  /* Une salle garde ses réglages d'une fois sur l'autre — sinon ceux du
     formateur seraient perdus à chaque mise à jour. Ce bouton la réaligne sur
     les valeurs de config.js. Il efface un travail de réglage : il demande
     donc confirmation, en changeant son propre libellé. */
  document.getElementById("usine").addEventListener("click", e => {
    const bouton = e.currentTarget;

    if (!bouton.dataset.arme){
      bouton.dataset.arme = "1";
      setTimeout(() => { delete bouton.dataset.arme; }, 2500);
      return repondre(bouton, "Confirmer ?");
    }
    delete bouton.dataset.arme;

    etat.seuils = structuredClone(ETAT_DEFAUT.seuils);
    etat.gamme = structuredClone(ETAT_DEFAUT.gamme);
    etat.reponse = ETAT_DEFAUT.reponse;
    // Une gamme réduite ne doit pas laisser une consigne au-dessus de son maximum.
    for (const g of GAZ){
      etat.cibles[g.id] = Math.min(Number(etat.cibles[g.id]), Mesure.borneCurseur(etat, g.id));
    }

    majSeuils();
    majToutes();
    document.getElementById("reponse").value = String(etat.reponse);
    envoyer();
    repondre(bouton, "Réglages rétablis");
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

  /* L'aperçu du formateur porte une marque que le lien distribué n'a pas :
     il s'affiche comme un vrai écran mais ne pèse pas dans le compteur. */
  document.getElementById("ouvrir").addEventListener("click", () => {
    window.open(urlEcran() + "&apercu=1", "_blank", "noopener");
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
