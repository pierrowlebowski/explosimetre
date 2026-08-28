# Explosimètre d'exercice — BW GasAlert MicroClip X3

Simulateur à deux postes pour les exercices : un formateur règle les gaz depuis
son téléphone, l'équipe voit et entend l'appareil réagir sur un autre écran.

## Où modifier quoi

**`js/config.js` est le seul fichier à ouvrir pour les réglages courants.** Les
gaz, les seuils, les gammes de mesure, les scénarios et la synchronisation y
sont réunis. Les deux pages le lisent : il n'y a rien à recopier ailleurs.

```
explosimetre/
├── index.html            page d'accueil
├── controle.html         pupitre du formateur — structure seule
├── explo.html            écran du détecteur — structure seule
├── css/
│   ├── commun.css        palette, voyant de liaison
│   ├── controle.css      curseurs, scénarios, grille des seuils
│   └── explo.css         boîtier jaune et afficheur
├── js/
│   ├── config.js         ← les réglages
│   ├── mesure.js         règles d'alarme et de gamme, communes aux deux pages
│   ├── liaison.js        synchronisation
│   ├── afficheur.js      chiffres 7 segments
│   ├── son.js            les trois sons de l'appareil
│   ├── veille.js         empêche le téléphone d'éteindre son écran
│   ├── controle.js       logique du pupitre
│   └── explo.js          logique de l'écran
├── serveur.py            serveur de secours pour réseau local sans internet
└── README.md
```

Quelques repères :

| Ce que vous voulez changer | Fichier |
|---|---|
| Un seuil, une gamme, un scénario | `js/config.js` |
| Ajouter ou retirer un gaz | `js/config.js`, puis les cases de `explo.html` |
| Ce qui déclenche une alarme | `js/mesure.js` |
| L'aspect du détecteur | `css/explo.css` |
| L'aspect du pupitre | `css/controle.css` |
| Les sons | `js/son.js` |

`serveur.py` ne connaît ni les gaz ni les seuils : il ne fait que relayer ce que
le pupitre lui envoie. Il n'y a donc jamais à le modifier en même temps que les
réglages.

## Mise en ligne sur GitHub Pages

1. Créer un dépôt GitHub, par exemple `explosimetre`, en **public**.
2. Y déposer tous les fichiers **en conservant les dossiers `css/` et `js/`**.
3. *Settings* → *Pages* → *Source* : `Deploy from a branch`, branche `main`,
   dossier `/ (root)`. Enregistrer.
4. Au bout d'une minute, le site est en ligne :

   - Pupitre : `https://VOTRE-PSEUDO.github.io/explosimetre/controle.html`
   - Écran : `https://VOTRE-PSEUDO.github.io/explosimetre/explo.html`

`serveur.py` peut rester dans le dépôt : GitHub Pages l'ignore.

Le découpage en fichiers rend l'ouverture par double-clic (`file://`) moins
fiable selon le navigateur. Passez par GitHub Pages ou par `serveur.py`.

## Déroulement d'un exercice

1. Le formateur ouvre le lien du **pupitre**.
2. Dans la carte *Lien pour l'équipe*, il saisit un code d'exercice
   (`cis-nord`, `manoeuvre-12`… ce qu'il veut) puis copie le lien affiché.
3. L'équipe ouvre ce lien et appuie sur **Démarrer l'appareil** : la séquence
   d'allumage est jouée, comme à la mise sous tension du vrai détecteur. Cet
   appui est obligatoire, les navigateurs mobiles refusent de sortir du son
   sans action de l'utilisateur.

Le code d'exercice isole les manœuvres : deux groupes peuvent tourner en
parallèle sans se perturber, chacun sur son propre code.

### L'écran du téléphone ne doit pas s'éteindre

Un téléphone en veille ne sonne plus : l'exercice s'arrête. À la mise sous
tension, la page demande donc au navigateur de garder l'écran allumé
(*Screen Wake Lock*). Ce verrou n'est pas définitif — le navigateur le relâche
dès que la page passe en arrière-plan, ne serait-ce qu'un instant — aussi
`js/veille.js` le redemande à chaque retour de la page, et `js/son.js` relance
l'horloge audio, que le téléphone a pu suspendre entre-temps.

Deux conditions échappent à la page, qui l'écrit alors en orange sous
l'appareil :

- **HTTPS obligatoire.** Le verrou n'existe qu'en origine sûre. GitHub Pages
  convient ; `serveur.py`, en `http://` sur le réseau local, non.
- **Navigateur trop ancien.** Android Chrome sait le faire depuis 2020,
  iOS Safari depuis la version 16.4.

Dans ces deux cas — et de toute façon par précaution — réglez la mise en
veille du téléphone sur **Jamais** avant l'exercice. Aucun code ne peut
empêcher un écran verrouillé à la main de s'éteindre, ni le passage dans une
autre application.

## Modes de liaison

`js/liaison.js` essaie trois transports dans l'ordre, et s'arrête au premier
qui répond :

| Mode | Voyant | Portée | Condition |
|---|---|---|---|
| Firebase | Vert | Deux appareils, n'importe où | Internet sur les deux |
| Serveur local | Vert | Deux appareils, même réseau | `serveur.py` lancé |
| Local | Orange | Deux onglets du même navigateur | Aucune |

Voyant rouge : la liaison était établie et s'est interrompue, la reconnexion
est automatique.

Le mode se force dans `js/config.js` (`LIAISON_PREFEREE`) ou dans l'adresse :
`explo.html?salle=cis-nord&liaison=serveur`.

### Sans internet

En sous-sol, en tunnel ou sur un réseau isolé, Firebase ne répondra pas et la
bascule prend quelques secondes. Dans ce cas, mieux vaut le serveur local :

1. Copier le dossier sur un portable, se mettre en partage de connexion Wi-Fi.
2. Dans le dossier : `python serveur.py` (ou `python serveur.py 8080` si le
   port 8000 est pris). Le serveur affiche les adresses à saisir.
3. Mettre `LIAISON_PREFEREE = "serveur"` dans `js/config.js` pour éviter
   l'attente de Firebase.

Le pare-feu Windows demandera d'autoriser Python au premier lancement :
accepter pour les réseaux privés.

## À propos des clés Firebase

Les clés de `js/config.js` sont publiques par conception : elles identifient le
projet, elles ne l'ouvrent pas. Ce sont les règles de la base qui protègent les
données. Celles en place n'autorisent que la branche des exercices :

```json
{
  "rules": {
    "exercices": {
      "$salle": {
        ".read": true,
        ".write": true
      }
    }
  }
}
```

N'importe qui connaissant un code d'exercice peut donc lire et écrire dans
cette branche. Pour un simulateur de formation sans donnée personnelle, c'est
sans conséquence ; utilisez simplement des codes peu devinables si vous tenez
à ce qu'un tiers ne vienne pas jouer avec l'écran en pleine manœuvre.

## Fidélité de la simulation

- **Inertie des capteurs.** Les valeurs ne sautent pas : elles rejoignent la
  consigne selon un temps de réponse réglable (T90 de 3 à 45 s). « Réaliste »
  (20 s) correspond à l'ordre de grandeur d'un capteur électrochimique. Dès que
  l'écart restant n'est plus visible à l'écran, l'affichage se cale exactement
  sur la consigne : 20 ppm demandés, 20 ppm affichés, sans fluctuation.

- **Alarmes.** Les trois sons sont ceux de l'appareil réel, relevés sur
  enregistrement puis resynthétisés — aucun fichier audio à charger.

  | Son | Modèle |
  |---|---|
  | Allumage | 3 bips de 3500 Hz (84 ms) puis tenue à 4000 Hz (767 ms), 1,211 s |
  | Alarme basse | Balayage 3745 → 4990 Hz, 23 paliers de 40 ms, silence 250 ms, cycle 1,170 s |
  | Alarme haute | Balayage 3750 → 4945 Hz, 23 paliers de 17 ms, silence 30 ms, cycle 0,430 s |

  Les paliers progressent géométriquement (+1,3 % chacun) : c'est ce qui donne
  l'accélération perçue en fin de balayage. Les cycles sont calés sur l'horloge
  audio, pas sur une minuterie JavaScript, donc pas de dérive même si le
  téléphone rame. Le bandeau ambre et le rétroéclairage suivent exactement la
  durée du balayage, et le téléphone vibre en même temps.

- **Dépassement de gamme.** Au-delà de la mesure maximum, le détecteur cesse
  d'afficher une concentration et indique **OL** (*over limit*), en alarme
  haute. La barre de réglage du pupitre monte un cran au-dessus de la gamme,
  juste pour permettre de provoquer ce dépassement.

- **Oxygène.** Toute sortie de plage (manque ou excès) déclenche l'alarme
  rapide, l'O₂ étant traité en priorité sur ces appareils.

- **Bandeau d'alarme.** En alarme, l'écran affiche **LOW ALARM** ou
  **HIGH ALARM** en haut à gauche, en vidéo inversée comme sur l'appareil
  réel, et clignote avec les chiffres concernés.

- **Valeurs crêtes.** Double appui sur le bouton bleu : l'écran passe en
  **PEAK** et montre les extrêmes relevés sur les deux dernières minutes —
  le maximum pour H₂S, CO et LIE, le minimum pour l'oxygène. Tout nouvel
  appui revient à la mesure. Les alarmes continuent de sonner pendant la
  consultation. Durée réglable par `DUREE_PICS` dans `js/config.js`.

- **Bouton bleu.** Appui court : rétroéclairage. Double appui : valeurs
  crêtes. Appui long : sourdine.

- **Volume.** `VOLUME_ALARMES` dans `js/config.js`, de 0 à 1.

## Réglages par défaut

| Gaz | Alarme basse | Alarme haute | Mesure maximum |
|---|---|---|---|
| H₂S | 10 ppm | 15 ppm | 100 ppm |
| CO | 35 ppm | 200 ppm | 500 ppm |
| O₂ | 19,5 % | 23,5 % | 30 % |
| LIE | 10 % | 20 % | 100 % |

Seuils usine courants du MicroClip, tous modifiables depuis le pupitre.

## Avertissement

Outil de formation. Il ne mesure rien et ne remplace en aucun cas un appareil
de détection contrôlé et étalonné.
