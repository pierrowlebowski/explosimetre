/* ===========================================================================
 * explo.js — écran du détecteur
 *
 * Reçoit les consignes du pupitre, les fait rejoindre progressivement par
 * l'affichage, et déclenche les alarmes.
 * ==========================================================================*/

(() => {
  'use strict';

  let etat = structuredClone(ETAT_DEFAUT);
  let dernierRaz = 0;

  /* Valeurs affichées. Elles rejoignent les consignes selon le temps de
     réponse, puis s'y calent exactement : une consigne de 20 ppm finit par
     afficher 20 ppm, sans bouger. */
  let mesure = {...etat.cibles};

  // --- Mémoire des valeurs crêtes ------------------------------------------

  /* Un relevé par rafraîchissement, les plus vieux sont oubliés : la fenêtre
     de DUREE_PICS secondes glisse avec le temps. */
  const historique = [];

  /* Vrai quand l'écran montre les crêtes au lieu de la mesure courante. */
  let picActif = false;

  function enregistrer(){
    const t = Date.now();
    historique.push({t, v:{...mesure}});
    const limite = t - DUREE_PICS * 1000;
    while (historique.length && historique[0].t < limite) historique.shift();
  }

  /* Extrême relevé sur la fenêtre : le maximum pour les gaz qui alarment à la
     hausse, le minimum pour l'oxygène — c'est le manque d'O₂ qui compte. */
  function pics(){
    const p = {};
    for (const g of GAZ){
      const valeurs = historique.map(e => e.v[g.id]);
      if (!valeurs.length){ p[g.id] = mesure[g.id]; continue; }
      p[g.id] = g.sens === "plage" ? Math.min(...valeurs) : Math.max(...valeurs);
    }
    return p;
  }

  // --- Liaison avec le pupitre ---------------------------------------------

  const voyant = document.getElementById("voyant");
  const texteEtat = document.getElementById("texteEtat");

  Liaison.demarrer({
    defaut: ETAT_DEFAUT,
    surEtat(recu){
      etat = Mesure.completer(recu);
      if (etat.raz !== dernierRaz){
        dernierRaz = etat.raz;
        mesure = {...etat.cibles};
        historique.length = 0;
      }
    },
    surVoyant(niveau, texte){
      voyant.className = "voyant " + niveau;
      texteEtat.textContent = texte;
    }
  });

  // --- Inertie des capteurs ------------------------------------------------

  const PAS = 100;        // ms entre deux rafraîchissements

  /* Une approche exponentielle n'atteint jamais tout à fait sa cible. Dès que
     l'écart restant passe sous un demi-cran d'affichage — donc dès qu'il n'est
     plus visible — on se cale exactement sur la consigne. Une consigne de
     20 ppm finit par afficher 20, définitivement. */
  const colle = g => 0.5 * Math.pow(10, -g.dec);

  setInterval(() => {
    const tau = Math.max(0.5, etat.reponse) / 2.303;   // T90 → constante de temps
    const k = 1 - Math.exp(-(PAS / 1000) / tau);
    for (const g of GAZ){
      const cible = Number(etat.cibles[g.id]);
      const ecart = cible - mesure[g.id];
      mesure[g.id] = Math.abs(ecart) < colle(g) ? cible : mesure[g.id] + ecart * k;
    }
    enregistrer();
    rafraichir();
  }, PAS);

  // --- Affichage -----------------------------------------------------------

  const cases = {};
  for (const g of GAZ){
    cases[g.id] = {
      valeur: document.getElementById("v-" + g.id),
      libelle: document.getElementById("l-" + g.id)
    };
  }

  /* L'écran des crêtes est une consultation : les chiffres y sont ceux de la
     mémoire, ils ne clignotent pas. L'alarme, elle, continue de suivre la
     mesure réelle — son, bandeau ambre et vibration compris. */
  function rafraichir(){
    const affiche = picActif ? pics() : mesure;
    let global = 0;
    for (const g of GAZ){
      Afficheur.ecrire(cases[g.id].valeur, Mesure.texte(etat, g.id, affiche[g.id]));
      const n = Mesure.niveau(etat, g.id, mesure[g.id]);
      global = Math.max(global, n);
      const clignote = n > 0 && !picActif;
      cases[g.id].valeur.classList.toggle("clignote", clignote);
      cases[g.id].libelle.classList.toggle("clignote", clignote);
    }
    majAlarme(global);
  }

  // --- Alarmes : son, flash ambre, vibration -------------------------------

  let sonPret = false, muet = false, niveauCourant = -1, cycle = null;
  let retroActif = false;
  const lueur = document.getElementById("lueur");
  const retro = document.getElementById("retro");

  /* Bandeau du haut de l'écran : LOW ALARM, HIGH ALARM, ou PEAK pendant la
     consultation des crêtes. Il clignote avec les chiffres en alarme. */
  const tete = document.getElementById("tete");
  const mention = document.getElementById("mention");
  const fanion = document.getElementById("fanion");
  const MENTIONS = {1:"LOW", 2:"HIGH"};

  function majTete(){
    if (picActif){
      mention.textContent = Math.round(DUREE_PICS / 60) + " min";
      fanion.textContent = "PEAK";
      tete.classList.remove("clignote");
      tete.classList.add("visible");
      return;
    }
    if (niveauCourant > 0){
      mention.textContent = MENTIONS[niveauCourant];
      fanion.textContent = "ALARM";
      tete.classList.add("visible", "clignote");
      return;
    }
    tete.classList.remove("visible", "clignote");
  }

  /* Le bandeau reste allumé pendant toute la durée du balayage sonore,
     puis s'éteint sur le silence. */
  const RYTHME = {
    1: {balayage: SonExplo.ALARMES.basse.dureeBalayage * 1000,
        periode:  SonExplo.ALARMES.basse.periode * 1000},
    2: {balayage: SonExplo.ALARMES.haute.dureeBalayage * 1000,
        periode:  SonExplo.ALARMES.haute.periode * 1000}
  };
  const NIVEAUX = {0:null, 1:"basse", 2:"haute"};

  function eteindre(){
    lueur.style.opacity = "0";
    retro.style.opacity = retroActif ? ".35" : "0";
  }

  function majSon(){
    if (!sonPret) return;
    SonExplo.alarme(muet ? null : NIVEAUX[niveauCourant] || null);
  }

  function majAlarme(n){
    if (n === niveauCourant) return;
    niveauCourant = n;
    document.body.dataset.alarme = n;
    majTete();
    clearInterval(cycle); cycle = null;
    eteindre();
    majSon();
    if (n === 0) return;

    const r = RYTHME[n];
    const salve = () => {
      lueur.style.opacity = "1";
      retro.style.opacity = ".45";
      setTimeout(eteindre, r.balayage);
      if (!muet) vibrer(Math.round(r.balayage));
    };
    salve();
    cycle = setInterval(salve, r.periode);
  }

  // --- Vibreur --------------------------------------------------------------

  /* Tous les téléphones ne vibrent pas : iOS n'expose pas le vibreur aux pages
     web, et Android l'ignore selon le profil sonore. Rien à faire dans ces
     cas-là — les alarmes restent sonores et visuelles. */
  let vibreurPossible = false;

  /* motif : une durée en ms, ou une alternance [vibre, pause, vibre, …]. */
  function vibrer(motif){
    if (!vibreurPossible) return;
    try{ navigator.vibrate(motif); }catch(e){}
  }

  /* Appelé dans le geste de mise sous tension : plusieurs moteurs refusent
     vibrate() une fois le contexte du geste perdu. La double impulsion sert
     d'auto-test — une seule brève passerait inaperçue. */
  function testerVibreur(){
    vibreurPossible = typeof navigator.vibrate === "function";
    vibrer([120, 70, 120]);
  }

  // --- Bouton bleu : rétroéclairage / sourdine ------------------------------

  const bouton = document.getElementById("bouton");
  const pied = document.getElementById("pied");
  const AIDE_BOUTON = "Appui court sur le bouton bleu : rétroéclairage. "
                    + "Double appui : valeurs crêtes. Appui long : sourdine.";
  const DELAI_DOUBLE = 280;          // ms d'attente d'un second appui
  let minuteurLong = null, longFait = false, minuteurDouble = null;

  function basculerRetro(){
    retroActif = !retroActif;
    retro.style.opacity = retroActif ? ".35" : "0";
  }

  function basculerSourdine(){
    clearTimeout(minuteurDouble); minuteurDouble = null;
    muet = !muet;
    majSon();
    pied.innerHTML = muet
      ? '<span class="sourdine">Sourdine activée</span> — appui long pour rétablir le son.'
      : AIDE_BOUTON;
    vibrer(20);
  }

  function entrerPic(){
    picActif = true;
    majTete();
    rafraichir();
    vibrer(20);
  }

  function quitterPic(){
    picActif = false;
    majTete();
    rafraichir();
  }

  /* Un appui court seul allume le rétroéclairage, deux appuis rapprochés
     ouvrent l'écran des crêtes : l'action du premier appui attend donc de
     savoir s'il en vient un second. Sur l'écran des crêtes, tout nouvel appui
     ramène à la mesure, sans attendre. */
  function appuiCourt(){
    if (picActif){ quitterPic(); return; }
    if (minuteurDouble){
      clearTimeout(minuteurDouble); minuteurDouble = null;
      entrerPic();
      return;
    }
    minuteurDouble = setTimeout(() => { minuteurDouble = null; basculerRetro(); }, DELAI_DOUBLE);
  }

  bouton.addEventListener("pointerdown", () => {
    longFait = false;
    minuteurLong = setTimeout(() => { longFait = true; basculerSourdine(); }, 700);
  });
  bouton.addEventListener("pointerup", () => {
    clearTimeout(minuteurLong);
    if (!longFait) appuiCourt();
  });
  bouton.addEventListener("pointerleave", () => clearTimeout(minuteurLong));

  /* Certaines versions d'iOS ouvrent quand même un menu sur appui long :
     il n'a rien à proposer ici, et il vole le geste de sourdine. */
  bouton.addEventListener("contextmenu", e => e.preventDefault());

  // --- Mise sous tension ---------------------------------------------------

  document.getElementById("demarrer").addEventListener("click", async () => {
    document.getElementById("voile").classList.add("parti");
    testerVibreur();                   // dans le geste : certains moteurs l'exigent
    mesure = {...etat.cibles};
    historique.length = 0;
    picActif = false;
    majTete();
    rafraichir();
    try{
      SonExplo.debloquer();
      SonExplo.setVolume(VOLUME_ALARMES);
      await SonExplo.allumage();       // 3 bips puis tenue longue, 1,2 s
    }catch(e){}
    sonPret = true;
    niveauCourant = -1;                // force la réévaluation de l'alarme
    rafraichir();
    tenirEcranAllume();
  });

  // --- Veille du téléphone -------------------------------------------------

  /* Un exercice dure plus longtemps que la mise en veille d'un téléphone.
     Le verrou d'écran est donc repris à chaque retour de la page, et l'horloge
     audio relancée : le navigateur a pu la suspendre pendant ce temps. */
  const avertVeille = document.getElementById("avertVeille");

  function tenirEcranAllume(){
    Veille.tenir((tenu, message) => {
      avertVeille.textContent = message;
      avertVeille.hidden = tenu;
    });
  }

  document.addEventListener("visibilitychange", () => {
    if (document.hidden || !sonPret) return;
    SonExplo.reprendre();
  });

  rafraichir();
})();
