/* ===========================================================================
 * afficheur.js — chiffres 7 segments de l'écran à cristaux liquides
 *
 * Chaque chiffre est un SVG de 7 polygones. Les segments éteints restent
 * visibles en gris très clair, comme sur l'appareil réel.
 * ==========================================================================*/

const Afficheur = (() => {
  'use strict';

  /* Hexagones des sept segments, dans un repère de 104 × 180. */
  const SEGMENTS = {
    a: "6,12 14,4 86,4 94,12 86,20 14,20",
    b: "88,14 96,22 96,82 88,90 80,82 80,22",
    c: "88,92 96,100 96,160 88,168 80,160 80,100",
    d: "6,168 14,160 86,160 94,168 86,176 14,176",
    e: "16,92 24,100 24,160 16,168 8,160 8,100",
    f: "16,14 24,22 24,82 16,90 8,82 8,22",
    g: "6,90 14,82 86,82 94,90 86,98 14,98"
  };

  /* Segments allumés pour chaque caractère affichable. */
  const ALPHABET = {
    "0":"abcdef", "1":"bc",     "2":"abged",  "3":"abgcd", "4":"fgbc",
    "5":"afgcd",  "6":"afgedc", "7":"abc",    "8":"abcdefg", "9":"abcdfg",
    "-":"g",      "O":"abcdef", "L":"def",    " ":""
  };

  function chiffre(car){
    const boite = document.createElement("span");
    boite.className = "chiffre";
    const actifs = ALPHABET[car] || "";
    let svg = '<svg viewBox="0 0 104 180" aria-hidden="true">';
    for (const [nom, points] of Object.entries(SEGMENTS)){
      svg += `<polygon class="seg${actifs.includes(nom) ? " on" : ""}" points="${points}"/>`;
    }
    boite.innerHTML = svg + "</svg>";
    return boite;
  }

  /* Écrit un texte du type "20.9" dans un conteneur.
     Ne redessine rien si le texte n'a pas changé. */
  function ecrire(conteneur, texte){
    if (conteneur.dataset.affiche === texte) return;
    conteneur.dataset.affiche = texte;
    conteneur.innerHTML = "";
    let dernier = null;
    for (const car of texte){
      if (car === "."){ if (dernier) dernier.classList.add("pt"); continue; }
      dernier = chiffre(car);
      conteneur.appendChild(dernier);
    }
  }

  return { ecrire, SEGMENTS, ALPHABET };
})();
