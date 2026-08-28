/* ===========================================================================
 * qr.js — QR code, sans bibliothèque ni accès réseau
 *
 * Le pupitre affiche le lien de l'écran en QR code : l'équipe le scanne et
 * arrive directement sur le bon exercice, sans recopier d'adresse.
 *
 * Encodage en mode octet, correction d'erreur de niveau M — environ 15 % du
 * code peut être abîmé ou masqué par un doigt sans empêcher la lecture.
 * Versions 1 à 10, soit 213 caractères au maximum : très au-delà de la
 * longueur d'une adresse d'exercice.
 *
 * Usage :  QR.svg("https://…")   →  chaîne SVG prête à insérer
 * ==========================================================================*/

const QR = (() => {
  'use strict';

  /* --- Corps de Galois GF(256), polynôme 0x11D ---------------------------- */

  const EXP = new Uint8Array(512);
  const LOG = new Uint8Array(256);
  (() => {
    let x = 1;
    for (let i = 0; i < 255; i++){
      EXP[i] = x; LOG[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= 0x11d;
    }
    for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  })();

  const mul = (a, b) => (a === 0 || b === 0) ? 0 : EXP[LOG[a] + LOG[b]];

  /* --- Tables des versions, niveau de correction M ------------------------
   * [octets de données, octets de correction par bloc,
   *  blocs du groupe 1, données par bloc, blocs du groupe 2, données par bloc]
   */
  const VERSIONS = {
     1: [ 16, 10, 1, 16, 0,  0],
     2: [ 28, 16, 1, 28, 0,  0],
     3: [ 44, 26, 1, 44, 0,  0],
     4: [ 64, 18, 2, 32, 0,  0],
     5: [ 86, 24, 2, 43, 0,  0],
     6: [108, 16, 4, 27, 0,  0],
     7: [124, 18, 4, 31, 0,  0],
     8: [154, 22, 2, 38, 2, 39],
     9: [182, 22, 3, 36, 2, 37],
    10: [216, 26, 4, 43, 1, 44]
  };

  /* Centres des motifs d'alignement, par version. */
  const ALIGNEMENTS = {
     1: [], 2: [6,18], 3: [6,22], 4: [6,26], 5: [6,30],
     6: [6,34], 7: [6,22,38], 8: [6,24,42], 9: [6,26,46], 10: [6,28,50]
  };

  /* --- Correction d'erreur ------------------------------------------------ */

  /* Polynôme générateur de n octets de correction. */
  function generateur(n){
    let g = [1];
    for (let i = 0; i < n; i++){
      const a = EXP[i];
      const res = new Array(g.length + 1).fill(0);
      for (let k = 0; k < g.length; k++){
        res[k]     ^= g[k];
        res[k + 1] ^= mul(g[k], a);
      }
      g = res;
    }
    return g;
  }

  /* Reste de la division du bloc par le générateur : les octets de contrôle. */
  function correction(bloc, n){
    const g = generateur(n);
    const reste = new Uint8Array(bloc.length + n);
    reste.set(bloc);
    for (let i = 0; i < bloc.length; i++){
      const facteur = reste[i];
      if (facteur === 0) continue;
      for (let j = 0; j < g.length; j++) reste[i + j] ^= mul(g[j], facteur);
    }
    return Array.from(reste.slice(bloc.length));
  }

  /* --- Mise en octets du texte -------------------------------------------- */

  function versionUtile(nbOctets){
    for (const v of Object.keys(VERSIONS).map(Number)){
      const capacite = VERSIONS[v][0] - 2 - (v >= 10 ? 1 : 0);
      if (nbOctets <= capacite) return v;
    }
    throw new Error("texte trop long pour un QR code de version 10");
  }

  function codets(texte){
    const octets = Array.from(new TextEncoder().encode(texte));
    const version = versionUtile(octets.length);
    const total = VERSIONS[version][0];

    /* Flux de bits : mode octet, longueur, données, terminateur. */
    const bits = [];
    const pousser = (valeur, taille) => {
      for (let i = taille - 1; i >= 0; i--) bits.push((valeur >> i) & 1);
    };
    pousser(0b0100, 4);
    pousser(octets.length, version >= 10 ? 16 : 8);
    for (const o of octets) pousser(o, 8);
    for (let i = 0; i < 4 && bits.length < total * 8; i++) bits.push(0);
    while (bits.length % 8) bits.push(0);

    const donnees = [];
    for (let i = 0; i < bits.length; i += 8){
      donnees.push(parseInt(bits.slice(i, i + 8).join(""), 2));
    }
    /* Remplissage jusqu'à la capacité, deux octets alternés imposés. */
    const BOURRAGE = [0xEC, 0x11];
    let n = 0;
    while (donnees.length < total) donnees.push(BOURRAGE[n++ % 2]);

    return { version, donnees };
  }

  /* Découpe en blocs, calcul de la correction, puis entrelacement. */
  function flux(version, donnees){
    const [, nEc, b1, d1, b2, d2] = VERSIONS[version];
    const blocs = [], controles = [];

    let curseur = 0;
    for (let i = 0; i < b1 + b2; i++){
      const taille = i < b1 ? d1 : d2;
      const bloc = donnees.slice(curseur, curseur + taille);
      curseur += taille;
      blocs.push(bloc);
      controles.push(correction(bloc, nEc));
    }

    const sortie = [];
    const maxDonnees = Math.max(d1, d2);
    for (let i = 0; i < maxDonnees; i++){
      for (const bloc of blocs) if (i < bloc.length) sortie.push(bloc[i]);
    }
    for (let i = 0; i < nEc; i++){
      for (const c of controles) sortie.push(c[i]);
    }
    return sortie;
  }

  /* --- Informations de format et de version ------------------------------- */

  /* Niveau M = 0b00, suivi du numéro de masque, protégés par un BCH(15,5). */
  function infoFormat(masque){
    const valeur = (0b00 << 3) | masque;
    let reste = valeur << 10;
    for (let i = 4; i >= 0; i--){
      if ((reste >> (i + 10)) & 1) reste ^= 0b10100110111 << i;
    }
    return ((valeur << 10) | reste) ^ 0b101010000010010;
  }

  function infoVersion(version){
    let reste = version << 12;
    for (let i = 5; i >= 0; i--){
      if ((reste >> (i + 12)) & 1) reste ^= 0b1111100100101 << i;
    }
    return (version << 12) | reste;
  }

  /* --- Trame : motifs fixes puis données ---------------------------------- */

  function trame(version){
    const taille = 17 + 4 * version;
    const m = Array.from({length: taille}, () => new Int8Array(taille).fill(-1));
    const fixe = Array.from({length: taille}, () => new Uint8Array(taille));

    const poser = (l, c, v) => {
      if (l < 0 || l >= taille || c < 0 || c >= taille) return;
      m[l][c] = v; fixe[l][c] = 1;
    };

    /* Trois motifs de repérage, avec leur séparateur clair. */
    for (const [L, C] of [[0, 0], [0, taille - 7], [taille - 7, 0]]){
      for (let l = -1; l <= 7; l++){
        for (let c = -1; c <= 7; c++){
          const bord   = (l === 0 || l === 6) && c >= 0 && c <= 6;
          const cote   = (c === 0 || c === 6) && l >= 0 && l <= 6;
          const coeur  = l >= 2 && l <= 4 && c >= 2 && c <= 4;
          poser(L + l, C + c, (bord || cote || coeur) ? 1 : 0);
        }
      }
    }

    /* Motifs d'alignement, sauf là où ils chevaucheraient un repérage. */
    const centres = ALIGNEMENTS[version];
    for (const L of centres){
      for (const C of centres){
        if ((L === 6 && C === 6) ||
            (L === 6 && C === taille - 7) ||
            (L === taille - 7 && C === 6)) continue;
        for (let l = -2; l <= 2; l++){
          for (let c = -2; c <= 2; c++){
            const anneau = Math.max(Math.abs(l), Math.abs(c));
            poser(L + l, C + c, anneau === 1 ? 0 : 1);
          }
        }
      }
    }

    /* Rythmes horizontal et vertical. */
    for (let i = 8; i < taille - 8; i++){
      const v = i % 2 === 0 ? 1 : 0;
      poser(6, i, v); poser(i, 6, v);
    }

    /* Module toujours sombre, puis réservation des zones de format. */
    poser(taille - 8, 8, 1);
    for (let i = 0; i <= 8; i++){
      if (!fixe[8][i]) poser(8, i, 0);
      if (!fixe[i][8]) poser(i, 8, 0);
    }
    for (let i = 0; i < 8; i++){
      if (!fixe[8][taille - 1 - i]) poser(8, taille - 1 - i, 0);
      if (!fixe[taille - 1 - i][8]) poser(taille - 1 - i, 8, 0);
    }

    /* Zone de version, à partir de la version 7. */
    if (version >= 7){
      const bits = infoVersion(version);
      for (let i = 0; i < 18; i++){
        const b = (bits >> i) & 1;
        poser(Math.floor(i / 3), taille - 11 + (i % 3), b);
        poser(taille - 11 + (i % 3), Math.floor(i / 3), b);
      }
    }

    return { taille, m, fixe };
  }

  /* Remplit le zigzag de droite à gauche avec le flux d'octets. */
  function remplir(t, octets){
    const { taille, m, fixe } = t;
    const bits = [];
    for (const o of octets) for (let i = 7; i >= 0; i--) bits.push((o >> i) & 1);

    let n = 0, montant = true;
    for (let droite = taille - 1; droite > 0; droite -= 2){
      if (droite === 6) droite = 5;            // la colonne du rythme se saute
      for (let pas = 0; pas < taille; pas++){
        const l = montant ? taille - 1 - pas : pas;
        for (const c of [droite, droite - 1]){
          if (fixe[l][c]) continue;
          m[l][c] = n < bits.length ? bits[n] : 0;
          n++;
        }
      }
      montant = !montant;
    }
  }

  /* --- Masques ------------------------------------------------------------ */

  const MASQUES = [
    (l, c) => (l + c) % 2 === 0,
    (l, c) => l % 2 === 0,
    (l, c) => c % 3 === 0,
    (l, c) => (l + c) % 3 === 0,
    (l, c) => (Math.floor(l / 2) + Math.floor(c / 3)) % 2 === 0,
    (l, c) => (l * c) % 2 + (l * c) % 3 === 0,
    (l, c) => ((l * c) % 2 + (l * c) % 3) % 2 === 0,
    (l, c) => ((l + c) % 2 + (l * c) % 3) % 2 === 0
  ];

  /* Pénalités de la norme : plus le score est bas, plus le code est lisible. */
  function penalite(m, taille){
    let score = 0;

    const series = lire => {
      for (let a = 0; a < taille; a++){
        let compte = 1, precedent = lire(a, 0);
        for (let b = 1; b < taille; b++){
          const v = lire(a, b);
          if (v === precedent){ compte++; continue; }
          if (compte >= 5) score += 3 + (compte - 5);
          compte = 1; precedent = v;
        }
        if (compte >= 5) score += 3 + (compte - 5);
      }
    };
    series((a, b) => m[a][b]);
    series((a, b) => m[b][a]);

    for (let l = 0; l < taille - 1; l++){
      for (let c = 0; c < taille - 1; c++){
        const v = m[l][c];
        if (v === m[l][c + 1] && v === m[l + 1][c] && v === m[l + 1][c + 1]) score += 3;
      }
    }

    const MOTIF  = [1,0,1,1,1,0,1,0,0,0,0];
    const MOTIF2 = [0,0,0,0,1,0,1,1,1,0,1];
    const cherche = lire => {
      for (let a = 0; a < taille; a++){
        for (let b = 0; b <= taille - 11; b++){
          let ok1 = true, ok2 = true;
          for (let k = 0; k < 11; k++){
            const v = lire(a, b + k);
            if (v !== MOTIF[k])  ok1 = false;
            if (v !== MOTIF2[k]) ok2 = false;
          }
          if (ok1) score += 40;
          if (ok2) score += 40;
        }
      }
    };
    cherche((a, b) => m[a][b]);
    cherche((a, b) => m[b][a]);

    let sombres = 0;
    for (let l = 0; l < taille; l++) for (let c = 0; c < taille; c++) sombres += m[l][c];
    const pourcent = sombres * 100 / (taille * taille);
    score += Math.floor(Math.abs(pourcent - 50) / 5) * 10;

    return score;
  }

  /* Les 15 bits sont écrits deux fois, poids fort en premier, en suivant
     exactement ces deux chemins. */
  function poserFormat(t, masque){
    const { taille, m } = t;
    const bits = infoFormat(masque);
    const b = k => (bits >> (14 - k)) & 1;

    const copie1 = [[8,0],[8,1],[8,2],[8,3],[8,4],[8,5],[8,7],[8,8],
                    [7,8],[5,8],[4,8],[3,8],[2,8],[1,8],[0,8]];
    const copie2 = [[taille-1,8],[taille-2,8],[taille-3,8],[taille-4,8],
                    [taille-5,8],[taille-6,8],[taille-7,8],
                    [8,taille-8],[8,taille-7],[8,taille-6],[8,taille-5],
                    [8,taille-4],[8,taille-3],[8,taille-2],[8,taille-1]];

    copie1.forEach(([l, c], k) => { m[l][c] = b(k); });
    copie2.forEach(([l, c], k) => { m[l][c] = b(k); });
    m[taille - 8][8] = 1;                       // module toujours sombre
  }

  /* --- Assemblage --------------------------------------------------------- */

  function matrice(texte){
    const { version, donnees } = codets(texte);
    const octets = flux(version, donnees);

    let meilleure = null, meilleurScore = Infinity;
    for (let masque = 0; masque < 8; masque++){
      const t = trame(version);
      remplir(t, octets);
      for (let l = 0; l < t.taille; l++){
        for (let c = 0; c < t.taille; c++){
          if (!t.fixe[l][c] && MASQUES[masque](l, c)) t.m[l][c] ^= 1;
        }
      }
      poserFormat(t, masque);
      const score = penalite(t.m, t.taille);
      if (score < meilleurScore){ meilleurScore = score; meilleure = t; }
    }
    return { taille: meilleure.taille, modules: meilleure.m, version };
  }

  /* --- Rendu -------------------------------------------------------------- */

  /* SVG carré, fond clair et marge de 4 modules : la norme l'exige pour que
     les lecteurs trouvent les bords du code. */
  function svg(texte, { marge = 4, sombre = "#111310", clair = "#ffffff" } = {}){
    const { taille, modules } = matrice(texte);
    const cote = taille + marge * 2;

    let chemin = "";
    for (let l = 0; l < taille; l++){
      for (let c = 0; c < taille; c++){
        if (modules[l][c]) chemin += `M${c + marge} ${l + marge}h1v1h-1z`;
      }
    }
    return `<svg viewBox="0 0 ${cote} ${cote}" xmlns="http://www.w3.org/2000/svg" `
         + `shape-rendering="crispEdges" role="img" aria-label="QR code du lien">`
         + `<rect width="${cote}" height="${cote}" fill="${clair}"/>`
         + `<path d="${chemin}" fill="${sombre}"/></svg>`;
  }

  return { matrice, svg };
})();
