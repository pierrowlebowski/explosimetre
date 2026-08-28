/* ===========================================================================
 * son-explosimetre.js — sons du BW GasAlert MicroClip X3
 *
 * Modèle relevé sur enregistrement réel :
 *
 *   Allumage      3 bips 3500 Hz (84 ms) puis tenue 4000 Hz (767 ms), 1,211 s.
 *                 Sinusoïde quasi pure, 2ᵉ harmonique à −44 dB.
 *                 Attaque des bips ~2 ms, extinction ~12 ms ; la tenue longue
 *                 monte en ~25 ms.
 *
 *   Alarme basse  Balayage montant 3745 → 4990 Hz, 23 paliers de 40 ms,
 *                 silence 250 ms, cycle 1,170 s.
 *   Alarme haute  Même balayage 3750 → 4945 Hz, 23 paliers de 17 ms,
 *                 silence 30 ms, cycle 0,430 s.
 *
 *   La progression des paliers est géométrique (+1,3 % par palier), d'où
 *   l'accélération perçue en fin de balayage. Timbre piézo commun aux deux
 *   alarmes, 2ᵉ harmonique à −29 dB, reproduit via une PeriodicWave.
 *
 * Aucune dépendance, aucun fichier externe, aucun accès réseau.
 * Usage :  <script src="son-explosimetre.js"></script>
 *          SonExplo.debloquer();     // sur le premier clic de la page
 *          SonExplo.allumage();      // une fois
 *          SonExplo.alarme('basse'); // 'basse' | 'haute' | null
 *          SonExplo.reprendre();     // au retour d'arrière-plan
 * ==========================================================================*/

const SonExplo = (() => {
  'use strict';

  // --- Modèle sonore -------------------------------------------------------
  // t : départ (s) | f : fréquence (Hz) | d : durée (s) | g : niveau relatif
  // a : attaque (s) | r : extinction (s)
  const ALLUMAGE = [
    { t: 0.000, f: 3500, d: 0.084, g: 1.00, a: 0.002, r: 0.012 },
    { t: 0.213, f: 3500, d: 0.084, g: 1.00, a: 0.002, r: 0.012 },
    { t: 0.329, f: 3500, d: 0.084, g: 0.97, a: 0.002, r: 0.012 },
    { t: 0.444, f: 4000, d: 0.767, g: 0.53, a: 0.025, r: 0.008 }
  ];

  const DUREE_ALLUMAGE = 1.211; // secondes

  const ALARMES = {
    basse: {
      fDebut: 3745, fFin: 4990,
      paliers: 23, dureePalier: 0.040, dureeBalayage: 0.920,
      silence: 0.250, periode: 1.170, g: 1.00
    },
    haute: {
      fDebut: 3750, fFin: 4945,
      paliers: 23, dureePalier: 0.01739, dureeBalayage: 0.400,
      silence: 0.030, periode: 0.430, g: 1.00
    }
  };

  const HARMONIQUES = [0, 1, 0.035, 0.014]; // timbre piézo des alarmes

  const ATTAQUE = 0.004;    // s, anti-clic en début de balayage
  const EXTINCTION = 0.006; // s, anti-clic en fin de balayage

  // --- État ----------------------------------------------------------------

  let ctx = null;
  let master = null;
  let onde = null;          // PeriodicWave partagée
  let actifs = [];          // oscillateurs programmés
  let volume = 0.35;
  let alarmeEnCours = null; // 'basse' | 'haute' | null
  let prochainCycle = 0;
  let horloge = null;

  const AVANCE = 0.30;         // s de programmation à l'avance
  const PERIODE_HORLOGE = 100; // ms

  // --- Contexte audio ------------------------------------------------------

  function contexte() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = volume;
      master.connect(ctx.destination);
      onde = ctx.createPeriodicWave(
        new Float32Array(HARMONIQUES.length),
        new Float32Array(HARMONIQUES),
        { disableNormalization: true }
      );
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  /* À appeler sur le premier clic de la page : sans geste utilisateur,
     aucun navigateur n'autorise la sortie audio. */
  function debloquer() {
    contexte();
    return ctx.state === 'running';
  }

  // --- Briques de synthèse -------------------------------------------------

  function suivre(osc, env) {
    actifs.push(osc);
    osc.onended = () => {
      actifs = actifs.filter(o => o !== osc);
      try { env.disconnect(); } catch (e) { /* déjà libéré */ }
    };
  }

  /* Bip à fréquence fixe (séquence d'allumage). */
  function bip(depart, { f, d, g, a, r }) {
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(f, depart);

    const n = Math.max(g, 0.0001);
    env.gain.setValueAtTime(0.0001, depart);
    env.gain.exponentialRampToValueAtTime(n, depart + a);
    env.gain.setValueAtTime(n, depart + d - r);
    env.gain.exponentialRampToValueAtTime(0.0001, depart + d);

    osc.connect(env); env.connect(master);
    osc.start(depart); osc.stop(depart + d + 0.02);
    suivre(osc, env);
  }

  /* Un balayage montant par paliers (un cycle d'alarme). */
  function balayage(depart, m) {
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.setPeriodicWave(onde);

    const ratio = Math.pow(m.fFin / m.fDebut, 1 / (m.paliers - 1));
    for (let i = 0; i < m.paliers; i++) {
      osc.frequency.setValueAtTime(m.fDebut * Math.pow(ratio, i),
                                   depart + i * m.dureePalier);
    }

    const fin = depart + m.dureeBalayage;
    env.gain.setValueAtTime(0.0001, depart);
    env.gain.exponentialRampToValueAtTime(m.g, depart + ATTAQUE);
    env.gain.setValueAtTime(m.g, fin - EXTINCTION);
    env.gain.exponentialRampToValueAtTime(0.0001, fin);

    osc.connect(env); env.connect(master);
    osc.start(depart); osc.stop(fin + 0.02);
    suivre(osc, env);
  }

  // --- Boucle d'alarme -----------------------------------------------------

  /* Programmation par anticipation : les cycles sont calés sur l'horloge
     audio, pas sur setInterval, donc pas de dérive ni de trou entre deux
     cycles même si l'onglet rame. */
  function tic() {
    if (!alarmeEnCours) return;
    const m = ALARMES[alarmeEnCours];
    while (prochainCycle < ctx.currentTime + AVANCE) {
      if (prochainCycle > ctx.currentTime) balayage(prochainCycle, m);
      prochainCycle += m.periode;
    }
  }

  function demarrerAlarme(niveau) {
    if (!ALARMES[niveau]) throw new Error('Niveau inconnu : ' + niveau);
    contexte();
    if (alarmeEnCours === niveau) return;
    stop();
    alarmeEnCours = niveau;
    prochainCycle = ctx.currentTime + 0.05;
    tic();
    horloge = setInterval(tic, PERIODE_HORLOGE);
  }

  // --- API -----------------------------------------------------------------

  /* Séquence d'allumage, jouée une fois. Promesse résolue à la fin. */
  function allumage() {
    contexte();
    const t0 = ctx.currentTime + 0.05;
    ALLUMAGE.forEach(n => bip(t0 + n.t, n));
    return new Promise(r => setTimeout(r, (DUREE_ALLUMAGE + 0.1) * 1000));
  }

  const alarmeBasse = () => demarrerAlarme('basse');
  const alarmeHaute = () => demarrerAlarme('haute');

  /* Pilotage direct par un seuil : alarme('basse' | 'haute' | null). */
  function alarme(niveau) {
    if (!niveau) return stop();
    return demarrerAlarme(niveau);
  }

  /* Retour d'arrière-plan : le navigateur a pu suspendre l'horloge audio, et
     l'anticipation de la boucle n'a pas survécu à la mise en veille. On
     relance le contexte et on recale la boucle sur l'instant présent, sans
     rejouer les cycles manqués. */
  function reprendre() {
    if (!ctx) return false;
    if (ctx.state === 'suspended') ctx.resume();
    if (alarmeEnCours) {
      prochainCycle = Math.max(prochainCycle, ctx.currentTime + 0.05);
      tic();
    }
    return ctx.state === 'running';
  }

  /* Coupe tout : boucle d'alarme et sons en cours. */
  function stop() {
    if (horloge) { clearInterval(horloge); horloge = null; }
    alarmeEnCours = null;
    actifs.forEach(o => { try { o.stop(); } catch (e) { /* déjà arrêté */ } });
    actifs = [];
  }

  /* Volume général, 0 → 1. */
  function setVolume(v) {
    volume = Math.min(Math.max(v, 0), 1);
    if (master) master.gain.setTargetAtTime(volume, ctx.currentTime, 0.01);
    return volume;
  }

  const etat = () => alarmeEnCours;

  return {
    allumage, alarmeBasse, alarmeHaute, alarme,
    stop, setVolume, debloquer, reprendre, etat,
    DUREE_ALLUMAGE, ALLUMAGE, ALARMES
  };
})();

// Export optionnel si le projet utilise des modules ES
if (typeof module !== 'undefined' && module.exports) module.exports = SonExplo;
