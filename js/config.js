/* ===========================================================================
 * config.js — LE fichier à modifier
 *
 * Tout ce qui se règle sans toucher au reste du code est ici : les gaz, les
 * seuils et gammes de départ, les scénarios d'exercice, la synchronisation.
 * Les deux pages lisent ce fichier ; il n'y a donc rien à recopier ailleurs.
 * ==========================================================================*/

/* --- Synchronisation ------------------------------------------------------
 * Ces clés sont publiques par conception : elles identifient le projet
 * Firebase, elles ne l'ouvrent pas. Ce sont les règles de la base qui
 * protègent les données.
 */
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBsQsNxOWGTNFz1Att2hrNWpkU4O8JWjhU",
  authDomain: "explosimetre-a2356.firebaseapp.com",
  databaseURL: "https://explosimetre-a2356-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "explosimetre-a2356",
  storageBucket: "explosimetre-a2356.firebasestorage.app",
  messagingSenderId: "1050537725215",
  appId: "1:1050537725215:web:c008d4ef0031b12964742a"
};

/* Mode de liaison :
 *   "auto"     Firebase d'abord, puis serveur.py, puis mode local.
 *   "firebase" Firebase uniquement.
 *   "serveur"  serveur.py uniquement (réseau local sans internet).
 *   "local"    deux onglets du même navigateur, sans réseau.
 * Peut aussi être forcé dans l'adresse : ?liaison=serveur
 */
const LIAISON_PREFEREE = "auto";

/* Version du SDK Firebase chargée depuis le CDN de Google. */
const FIREBASE_VERSION = "12.18.0";


/* --- Gaz mesurés ----------------------------------------------------------
 * Pour ajouter ou retirer un gaz, c'est ici — et dans les quatre cases de
 * l'afficheur, dans explo.html.
 *
 *   id      clé utilisée partout ailleurs
 *   nom     libellé du pupitre, HTML autorisé
 *   unite   affichée à côté des valeurs
 *   pas     finesse du curseur et des champs de seuil
 *   dec     décimales à l'affichage
 *   sens    "haut"  : l'alarme se déclenche quand la valeur monte
 *           "plage" : l'alarme se déclenche de part et d'autre (oxygène)
 */
const GAZ = [
  {id:"h2s", nom:"H<sub>2</sub>S", unite:"ppm", pas:1,   dec:0, sens:"haut",  plein:"Sulfure d'hydrogène"},
  {id:"co",  nom:"CO",             unite:"ppm", pas:1,   dec:0, sens:"haut",  plein:"Monoxyde de carbone"},
  {id:"o2",  nom:"O<sub>2</sub>",  unite:"%",   pas:0.1, dec:1, sens:"plage", plein:"Oxygène"},
  {id:"lel", nom:"LIE",            unite:"%",   pas:1,   dec:0, sens:"haut",  plein:"Limite inférieure d'explosivité"}
];


/* --- État de départ d'un exercice ---------------------------------------- */
const ETAT_DEFAUT = {
  cibles: {h2s:0, co:0, o2:20.9, lel:0},              // consignes du formateur
  seuils: {h2s:[10,15], co:[35,200],                  // [alarme basse, haute]
           o2:[19.5,23.5], lel:[10,20]},
  gamme:  {h2s:100, co:500, o2:30, lel:100},          // mesure maximum, au-delà : OL
  reponse: 20,                                        // temps de réponse T90, en secondes
  raz: 0                                              // incrément = affichage immédiat
};

/* Le curseur du pupitre monte d'un cran au-dessus de la gamme : c'est cette
   marge qui permet de provoquer l'affichage OL. */
const MARGE_OL = 1;


/* --- Scénarios du pupitre -------------------------------------------------
 * t : titre | d : sous-titre | v : consignes appliquées
 */
const SCENARIOS = [
  {t:"Air libre",        d:"Atmosphère saine",               v:{h2s:0,  co:0,   o2:20.9, lel:0}},
  {t:"Fuite de gaz",     d:"LIE 18 %, montée en cave",       v:{h2s:0,  co:0,   o2:20.6, lel:18}},
  {t:"ATEX imminente",   d:"LIE 65 %, repli immédiat",       v:{h2s:0,  co:0,   o2:20.2, lel:65}},
  {t:"Feu couvant",      d:"CO 320 ppm en volume clos",      v:{h2s:0,  co:320, o2:19.8, lel:4}},
  {t:"Chaufferie",       d:"CO 60 ppm, appareil défaillant", v:{h2s:0,  co:60,  o2:20.7, lel:0}},
  {t:"Réseau d'égout",   d:"H₂S 28 ppm, O₂ 18,4 %",          v:{h2s:28, co:12,  o2:18.4, lel:6}},
  {t:"Manque d'oxygène", d:"O₂ 17,2 %, espace confiné",      v:{h2s:0,  co:0,   o2:17.2, lel:0}},
  {t:"Silo agricole",    d:"O₂ 15,5 %, atmosphère inerte",   v:{h2s:5,  co:0,   o2:15.5, lel:2}},
  {t:"Hors gamme",       d:"LIE au-delà de 100 %, écran OL", v:{h2s:0,  co:0,   o2:20.1, lel:101}}
];


/* --- Valeurs crêtes ------------------------------------------------------
 * Double appui sur le bouton bleu : l'écran montre les extrêmes relevés
 * pendant cette durée glissante, en secondes. Un appui supplémentaire revient
 * à la mesure. Pour les gaz de sens "haut" c'est le maximum qui est retenu ;
 * pour l'oxygène, de sens "plage", c'est le minimum — le manque d'O₂ étant
 * l'exposition qui compte.
 */
const DUREE_PICS = 120;


/* --- Volume des alarmes sur la page écran, de 0 à 1 ---------------------- */
const VOLUME_ALARMES = 0.6;
