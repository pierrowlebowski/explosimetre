/* ===========================================================================
 * mesure.js — règles communes au pupitre et à l'écran
 *
 * Le pupitre et l'écran doivent être d'accord sur ce qui déclenche une alarme
 * et sur ce qui sort de la gamme. Ces règles sont donc écrites une seule fois,
 * ici, et utilisées des deux côtés.
 * ==========================================================================*/

const Mesure = (() => {
  'use strict';

  const parId = Object.fromEntries(GAZ.map(g => [g.id, g]));

  /* Fin de gamme du capteur. */
  const gamme = (etat, id) => Number(etat.gamme[id]);

  /* Borne haute du curseur du pupitre : un cran au-dessus de la gamme. */
  const borneCurseur = (etat, id) => gamme(etat, id) + MARGE_OL;

  /* Au-delà de la gamme, le capteur ne mesure plus : l'écran affiche OL. */
  const horsGamme = (etat, id, valeur) => Number(valeur) > gamme(etat, id);

  /* Niveau d'alarme : 0 aucune, 1 basse, 2 haute.
     Le hors-gamme et toute sortie de plage d'oxygène passent en alarme haute. */
  function niveau(etat, id, valeur){
    const v = Number(valeur);
    if (horsGamme(etat, id, v)) return 2;
    const [bas, haut] = etat.seuils[id];
    if (parId[id].sens === "plage") return (v <= bas || v >= haut) ? 2 : 0;
    if (v >= haut) return 2;
    if (v >= bas) return 1;
    return 0;
  }

  /* Texte affiché pour une valeur : "OL" ou la concentration arrondie. */
  function texte(etat, id, valeur){
    if (horsGamme(etat, id, valeur)) return "OL";
    return Number(valeur).toFixed(parId[id].dec);
  }

  /* Complète un état reçu avec les valeurs par défaut manquantes. */
  function completer(recu){
    const base = structuredClone(ETAT_DEFAUT);
    if (!recu) return base;
    for (const cle of Object.keys(base)){
      if (recu[cle] === undefined) continue;
      base[cle] = (typeof base[cle] === "object" && !Array.isArray(base[cle]))
        ? Object.assign(base[cle], recu[cle])
        : recu[cle];
    }
    return base;
  }

  return { parId, gamme, borneCurseur, horsGamme, niveau, texte, completer };
})();
