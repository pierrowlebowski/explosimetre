/* ===========================================================================
 * liaison.js — synchronisation de l'état entre le pupitre et l'écran
 *
 * Trois transports, essayés dans cet ordre :
 *   1. Firebase Realtime Database  — deux appareils, n'importe où, via internet
 *   2. serveur.py (flux SSE)       — deux appareils sur le même réseau local
 *   3. BroadcastChannel            — deux onglets du même navigateur
 *
 * Chaque exercice vit dans sa propre « salle », lue dans l'adresse :
 *   explo.html?salle=cis-nord
 * Deux exercices peuvent donc tourner en parallèle sans se marcher dessus.
 *
 * Usage :
 *   Liaison.demarrer({ defaut, surEtat(etat), surVoyant(niveau, texte),
 *                      role: 'ecran',            // dépose une présence
 *                      surPresence(nombre) });   // nombre d'écrans, ou null
 *   Liaison.envoyer(etat);
 * ==========================================================================*/

const Liaison = (() => {
  'use strict';

  const params = new URLSearchParams(location.search);
  const salle = (params.get('salle') || 'defaut').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40) || 'defaut';
  const prefere = params.get('liaison')
    || (typeof LIAISON_PREFEREE !== 'undefined' ? LIAISON_PREFEREE : 'auto');

  let mode = null;
  let surEtat = () => {};
  let surVoyant = () => {};
  let defaut = {};
  let ecrire = null;          // fonction d'écriture propre au transport
  let attente = null;         // minuterie d'anti-rebond
  let dernierEnvoi = '';      // pour ignorer l'écho de nos propres écritures
  let role = null;            // 'ecran' dépose une présence ; null ne compte pas
  let surPresence = null;     // rappelé avec le nombre d'écrans connectés

  // --- Utilitaires ---------------------------------------------------------

  function avecDelai(promesse, ms, message) {
    return Promise.race([
      promesse,
      new Promise((_, rejeter) => setTimeout(() => rejeter(new Error(message)), ms))
    ]);
  }

  function recevoir(brut) {
    if (!brut) return;
    const texte = JSON.stringify(brut);
    if (texte === dernierEnvoi) return;   // c'est notre propre écriture
    surEtat(brut);
  }

  // --- Présence des écrans -------------------------------------------------
  /* Chaque écran dépose une fiche sous sa salle et demande à Firebase de
     l'effacer si la liaison tombe. C'est le serveur qui constate la rupture :
     un téléphone éteint ou hors réseau n'a rien à annoncer en partant.
     Les fiches vivent dans la salle, à côté de l'état ; les écritures du
     pupitre fusionnent au lieu de remplacer, sinon elles les effaceraient. */

  const DELAI_GRACE = 15000;   // ms avant de décompter un écran disparu

  const vivants = new Set();   // écrans actuellement en ligne
  const sursis = new Map();    // écrans disparus, encore dans leur délai de grâce

  /* Identifiant stable pour l'onglet : un rechargement de page retrouve le
     même, donc il ne se compte pas deux fois et ne fait pas clignoter le
     compteur du formateur. */
  function identifiant() {
    const cle = 'explo-presence';
    const neuf = () => Math.random().toString(36).slice(2, 10);
    try {
      let id = sessionStorage.getItem(cle);
      if (!id) { id = neuf(); sessionStorage.setItem(cle, id); }
      return id;
    } catch (e) {
      return neuf();
    }
  }

  const annoncer = () => { if (surPresence) surPresence(vivants.size + sursis.size); };

  /* Un écran qui disparaît n'est pas retiré tout de suite : un rechargement ou
     un passage du wifi à la 4G ne doit pas faire bouger le compteur. */
  function recenser(fiches) {
    const presents = new Set(
      Object.entries(fiches || {})
        .filter(([, f]) => f && f.r === 'ecran')
        .map(([id]) => id)
    );

    for (const id of presents) {
      const minuteur = sursis.get(id);
      if (minuteur) { clearTimeout(minuteur); sursis.delete(id); }
    }
    for (const id of vivants) {
      if (presents.has(id) || sursis.has(id)) continue;
      sursis.set(id, setTimeout(() => { sursis.delete(id); annoncer(); }, DELAI_GRACE));
    }

    vivants.clear();
    for (const id of presents) vivants.add(id);
    annoncer();
  }

  // --- 1. Firebase ---------------------------------------------------------

  async function viaFirebase() {
    if (typeof FIREBASE_CONFIG === 'undefined') throw new Error('config absente');
    const v = (typeof FIREBASE_VERSION !== 'undefined') ? FIREBASE_VERSION : '12.18.0';
    const base = 'https://www.gstatic.com/firebasejs/' + v + '/';

    const [app, bdd] = await Promise.all([
      import(base + 'firebase-app.js'),
      import(base + 'firebase-database.js')
    ]);

    const instance = app.initializeApp(FIREBASE_CONFIG);
    const db = bdd.getDatabase(instance);
    const noeud = bdd.ref(db, 'exercices/' + salle);

    // Première lecture : sert aussi de test de validité de la configuration.
    const photo = await avecDelai(bdd.get(noeud), 8000, 'Firebase ne répond pas');
    if (photo.exists()) recevoir(photo.val());
    else await bdd.update(noeud, defaut);

    bdd.onValue(noeud, s => recevoir(s.val()));

    /* La fiche de présence se redépose à chaque reconnexion : l'ordre
       d'effacement enregistré précédemment a déjà été consommé par le serveur. */
    const fiche = role === 'ecran'
      ? bdd.ref(db, 'exercices/' + salle + '/presences/' + identifiant())
      : null;

    bdd.onValue(bdd.ref(db, '.info/connected'), s => {
      const enLigne = s.val();
      surVoyant(enLigne ? 'ok' : 'ko',
                enLigne ? 'En ligne — salle « ' + salle + ' »'
                        : 'Hors ligne — reconnexion…');
      if (!enLigne || !fiche) return;
      bdd.onDisconnect(fiche).remove()
        .then(() => bdd.set(fiche, { r: 'ecran', t: bdd.serverTimestamp() }))
        .catch(e => console.warn('Présence non déposée :', e.message));
    });

    /* Le pupitre compte les écrans. Si les règles de la base refusent la
       lecture, mieux vaut ne rien afficher qu'un zéro trompeur. */
    if (surPresence) {
      bdd.onValue(bdd.ref(db, 'exercices/' + salle + '/presences'),
        s => recenser(s.val()),
        e => { console.warn('Présences illisibles :', e.message); surPresence(null); });
    }

    // Fusion plutôt que remplacement : les fiches de présence doivent survivre.
    ecrire = etat => bdd.update(noeud, etat);
    return 'firebase';
  }

  // --- 2. serveur.py -------------------------------------------------------

  function viaServeur() {
    return new Promise((resoudre, rejeter) => {
      if (location.protocol === 'file:') return rejeter(new Error('pas de serveur'));
      let flux;
      try { flux = new EventSource('/api/flux'); }
      catch (e) { return rejeter(e); }

      let premier = true;
      const minuteur = setTimeout(() => {
        try { flux.close(); } catch (e) {}
        rejeter(new Error('serveur muet'));
      }, 4000);

      flux.onmessage = e => {
        if (premier) {
          premier = false; clearTimeout(minuteur); resoudre('serveur');
          if (surPresence) surPresence(null);   // compte indisponible hors Firebase
        }
        surVoyant('ok', 'Connecté au serveur local');
        recevoir(JSON.parse(e.data));
      };
      flux.onerror = () => {
        if (premier) { clearTimeout(minuteur); try { flux.close(); } catch (e) {} rejeter(new Error('serveur injoignable')); }
        else surVoyant('ko', 'Serveur injoignable — reconnexion…');
      };

      ecrire = async etat => {
        const r = await fetch('/api/etat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(etat)
        });
        if (!r.ok) throw new Error(r.status);
      };
    });
  }

  // --- 3. Repli local ------------------------------------------------------

  function viaLocal() {
    const cle = 'explo-etat-' + salle;
    let canal = null;
    try { canal = new BroadcastChannel('explo-' + salle); } catch (e) {}

    const lire = () => {
      try {
        const brut = localStorage.getItem(cle);
        if (brut) recevoir(JSON.parse(brut));
      } catch (e) {}
    };
    lire();
    window.addEventListener('storage', e => { if (e.key === cle) lire(); });
    if (canal) canal.onmessage = e => recevoir(e.data);

    ecrire = etat => {
      try { localStorage.setItem(cle, JSON.stringify(etat)); } catch (e) {}
      if (canal) canal.postMessage(etat);
    };
    surVoyant('local', 'Mode local — même appareil uniquement');
    if (surPresence) surPresence(null);   // compte indisponible hors Firebase
    return 'local';
  }

  // --- Démarrage -----------------------------------------------------------

  async function demarrer(options) {
    surEtat = options.surEtat || surEtat;
    surVoyant = options.surVoyant || surVoyant;
    defaut = options.defaut || {};
    role = options.role || null;
    surPresence = options.surPresence || null;
    surVoyant('', 'Connexion…');

    const essais = prefere === 'auto' ? ['firebase', 'serveur', 'local'] : [prefere];
    for (const essai of essais) {
      try {
        if (essai === 'firebase') mode = await viaFirebase();
        else if (essai === 'serveur') mode = await viaServeur();
        else mode = viaLocal();
        return mode;
      } catch (e) {
        console.warn('Liaison ' + essai + ' indisponible :', e.message);
      }
    }
    mode = viaLocal();
    return mode;
  }

  /* Envoi anti-rebond : le curseur peut bouger vite, la base n'est écrite
     qu'une fois la main relâchée pendant 150 ms. */
  function envoyer(etat) {
    clearTimeout(attente);
    attente = setTimeout(async () => {
      if (!ecrire) return;
      dernierEnvoi = JSON.stringify(etat);
      try { await ecrire(etat); }
      catch (e) { surVoyant('ko', 'Envoi impossible — vérifiez la connexion'); }
    }, 150);
  }

  return {
    demarrer, envoyer, salle,
    get mode() { return mode; }
  };
})();
