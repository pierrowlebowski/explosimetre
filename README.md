# Explosimètre d'exercice — BW GasAlert MicroClip X3

Simulateur à deux postes pour les exercices : un formateur règle les gaz depuis
son téléphone, l'équipe voit et entend l'appareil réagir sur un autre écran.

## Contenu

| Fichier | Rôle |
|---|---|
| `controle.html` | Pupitre du formateur : valeurs, scénarios, seuils, temps de réponse. |
| `explo.html` | Écran du détecteur : afficheur 7 segments, alarmes sonores et lumineuses. |
| `liaison.js` | Synchronisation entre les deux pages. |
| `config-firebase.js` | Clés du projet Firebase et choix du mode de liaison. |
| `son-explosimetre.js` | Sons du MicroClip relevés sur enregistrement réel, resynthétisés. |
| `index.html` | Page d'accueil avec les deux accès. |
| `serveur.py` | Serveur de secours, pour un réseau local sans internet. |

## Mise en ligne sur GitHub Pages

1. Créer un dépôt GitHub, par exemple `explosimetre`, en **public**.
2. Y déposer tous les fichiers, à la racine.
3. Onglet *Settings* → *Pages* → *Source* : `Deploy from a branch`,
   branche `main`, dossier `/ (root)`. Enregistrer.
4. Au bout d'une minute, le site est en ligne :

   - Pupitre : `https://VOTRE-PSEUDO.github.io/explosimetre/controle.html`
   - Écran : `https://VOTRE-PSEUDO.github.io/explosimetre/explo.html`

`serveur.py` peut rester dans le dépôt : GitHub Pages l'ignore.

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

## Modes de liaison

`liaison.js` essaie trois transports dans l'ordre, et s'arrête au premier qui
répond :

| Mode | Voyant | Portée | Condition |
|---|---|---|---|
| Firebase | Vert | Deux appareils, n'importe où | Internet sur les deux |
| Serveur local | Vert | Deux appareils, même réseau | `serveur.py` lancé |
| Local | Orange | Deux onglets du même navigateur | Aucune |

Voyant rouge : la liaison était établie et s'est interrompue, la reconnexion
est automatique.

Le mode peut être forcé dans `config-firebase.js` (`LIAISON_PREFEREE`) ou dans
l'adresse : `explo.html?salle=cis-nord&liaison=serveur`.

### Sans internet

En sous-sol, en tunnel ou sur un réseau isolé, Firebase ne répondra pas et la
bascule prend quelques secondes. Dans ce cas, mieux vaut le serveur local :

1. Copier le dossier sur un portable, se mettre en partage de connexion Wi-Fi.
2. Dans le dossier : `python serveur.py` (ou `python serveur.py 8080` si le
   port 8000 est pris). Le serveur affiche les adresses à saisir.
3. Mettre `LIAISON_PREFEREE = "serveur"` dans `config-firebase.js` pour éviter
   l'attente de Firebase.

Le pare-feu Windows demandera d'autoriser Python au premier lancement :
accepter pour les réseaux privés.

## À propos des clés Firebase

Les clés de `config-firebase.js` sont publiques par conception : elles
identifient le projet, elles ne l'ouvrent pas. Ce sont les règles de la base
qui protègent les données. Celles en place n'autorisent que la branche des
exercices :

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
  (20 s) correspond à l'ordre de grandeur d'un capteur électrochimique.
- **Fluctuations.** Les derniers chiffres bougent légèrement, comme sur un
  appareil réel. Désactivable.
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

- **Volume.** Réglé à 60 % dans `explo.html` (`SonExplo.setVolume(0.6)`).
- **Oxygène.** Toute sortie de plage (manque ou excès) déclenche l'alarme
  rapide, l'O₂ étant traité en priorité sur ces appareils.
- **Dépassement de gamme.** Chaque capteur a une mesure maximum, réglable
  depuis le pupitre (colonne *Mesure maximum*) :

  | Gaz | Mesure maximum |
  |---|---|
  | H₂S | 100 ppm |
  | CO | 500 ppm |
  | O₂ | 30 % |
  | LIE | 100 % |

  Au-delà, le détecteur cesse d'afficher une concentration et indique **OL**
  (*over limit*), en alarme haute. La barre de réglage du pupitre monte un cran
  au-dessus de la gamme, juste pour permettre de provoquer ce dépassement. Le
  passage en OL est jugé sur la valeur stable et non sur les fluctuations, pour
  éviter que l'afficheur ne clignote entre OL et un chiffre en limite.
- **Bouton bleu.** Appui court : rétroéclairage. Appui long : sourdine.

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
