/* ===========================================================================
 * config-firebase.js — configuration de la synchronisation
 *
 * Ces clés sont publiques par conception : elles identifient le projet, elles
 * ne l'ouvrent pas. Ce sont les règles de la base (console Firebase, onglet
 * Règles) qui limitent l'accès à la branche « exercices ».
 * ==========================================================================*/

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
 *
 * Peut aussi être forcé au coup par coup dans l'adresse : ?liaison=serveur
 */
const LIAISON_PREFEREE = "auto";

/* Version du SDK Firebase chargée depuis le CDN de Google. */
const FIREBASE_VERSION = "12.18.0";
