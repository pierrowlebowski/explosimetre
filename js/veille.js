/* ===========================================================================
 * veille.js — empêcher le téléphone d'éteindre son écran
 *
 * Le navigateur sait garder l'écran allumé (Screen Wake Lock), mais le verrou
 * obtenu n'est pas définitif : il est relâché d'office dès que la page passe
 * en arrière-plan — une notification, un coup d'œil ailleurs, l'écran
 * verrouillé à la main. Sans reprise, l'appareil s'endort au retour et
 * l'exercice s'arrête.
 *
 * Ce module redemande donc le verrou à chaque fois que la page redevient
 * visible, et signale les cas où il n'y a rien à demander : navigateur trop
 * ancien, ou page servie en HTTP simple — le verrou exige une origine sûre,
 * c'est-à-dire HTTPS ou localhost.
 *
 * Usage :
 *   Veille.tenir(surEtat);   // surEtat(tenu, raison)
 *   Veille.relacher();
 * ==========================================================================*/

const Veille = (() => {
  'use strict';

  const RAISONS = {
    ok:        "",
    absent:    "Ce navigateur ne sait pas garder l'écran allumé.",
    nonSur:    "Page servie en HTTP simple : le navigateur refuse de garder "
             + "l'écran allumé. En HTTPS, il accepte.",
    refus:     "Le navigateur a refusé de garder l'écran allumé — économiseur "
             + "de batterie ?"
  };

  const CONSEIL = " Réglez la mise en veille du téléphone sur « Jamais » "
                + "pendant l'exercice.";

  let verrou = null;      // WakeLockSentinel en cours
  let voulu = false;      // l'écran doit-il rester allumé ?
  let surEtat = () => {};
  let branche = false;

  const possible = () =>
    ("wakeLock" in navigator) ? (window.isSecureContext ? "ok" : "nonSur") : "absent";

  function signaler(raison){
    surEtat(raison === "ok", raison === "ok" ? "" : RAISONS[raison] + CONSEIL);
  }

  async function prendre(){
    if (!voulu || verrou) return;
    if (document.visibilityState !== "visible") return;
    const etat = possible();
    if (etat !== "ok") return signaler(etat);
    try{
      verrou = await navigator.wakeLock.request("screen");
      /* Le navigateur relâche le verrou tout seul en arrière-plan : on note
         qu'il n'y en a plus, la reprise se fera au retour de la page. */
      verrou.addEventListener("release", () => { verrou = null; });
      signaler("ok");
    }catch(e){
      verrou = null;
      signaler("refus");
    }
  }

  function brancher(){
    if (branche) return;
    branche = true;
    /* Retour de l'arrière-plan : c'est là que le verrou est à reprendre. */
    document.addEventListener("visibilitychange", () => { if (!document.hidden) prendre(); });
    /* Filet de sécurité : un refus ponctuel est retenté au geste suivant. */
    document.addEventListener("pointerdown", () => prendre(), {passive:true});
  }

  /* Demande à garder l'écran allumé, et à le regarder toute la session.
     surEtat(tenu, message) est rappelée à chaque changement. */
  function tenir(rappel){
    if (rappel) surEtat = rappel;
    voulu = true;
    brancher();
    prendre();
  }

  function relacher(){
    voulu = false;
    if (verrou){ try{ verrou.release(); }catch(e){} verrou = null; }
  }

  const tenu = () => verrou !== null;

  return { tenir, relacher, tenu, possible };
})();
