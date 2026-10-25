<!-- The spelling check knows English and German only. cspell:disable -->

# Fiche du Chrome Web Store (français)

## Nom

Player Switch for Autodarts

## Description courte (132 caractères au maximum)

Passez d'un compte Autodarts à l'autre d'une simple pression sur un écran partagé, sans vous reconnecter.

## Description détaillée

Partagez un seul écran Autodarts dans l'entrée, au club ou au bar, et laissez
chacun jouer avec son propre compte.

Player Switch for Autodarts garde la connexion de plusieurs comptes sur
l'ordinateur et passe de l'un à l'autre d'une simple pression — sans taper de mot
de passe, sans se déconnecter puis se reconnecter.

Comment ça marche :

• Enregistrez chaque compte une fois : après « Ajouter un compte », la connexion
  suivante sur Autodarts est enregistrée automatiquement. Une pression sur une
  vignette met ce compte sur la cible.
• Le compte qui cède sa place reste connecté, et une pression le ramène aussitôt.
• Les comptes mis de côté sont tenus prêts en arrière-plan, et ils fonctionnent
  encore des jours plus tard.
• Conçu pour l'écran de la cible : un bouton rond sur la page Autodarts et le
  raccourci Alt+Maj+O affichent les joueurs par-dessus la page, aussi en plein
  écran et en mode kiosque, en grandes vignettes pour un écran tactile. Les
  touches 1 à 9 choisissent un joueur.
• Sur la page d'un match en cours, un changement demande d'abord, pour qu'un match
  ne se termine jamais par surprise.
• En option : laissez l'extension mémoriser un mot de passe, et elle reconnecte un
  compte d'elle-même si sa session cesse un jour de fonctionner. Les comptes qui se
  connectent avec Google ou Apple ne peuvent pas l'utiliser, car ils n'ont pas de
  mot de passe Autodarts à mémoriser.

Tout reste sur votre ordinateur. L'extension ne parle qu'à Autodarts, ne collecte
aucune statistique et n'envoie rien à personne d'autre. La politique de
confidentialité donne les détails.

La page d'assistance, en anglais, explique chaque message de l'extension et renvoie
à un guide pour un écran de cible en mode kiosque qui démarre avec l'ordinateur.

Non affilié à Autodarts.

## Justification des autorisations

• storage — pour garder vos comptes enregistrés et leurs sessions sur votre
  ordinateur.
• alarms — pour renouveler les sessions mises de côté en arrière-plan, afin
  qu'elles restent prêtes.
• scripting — pour apporter le bouton d'une nouvelle version dans les onglets
  Autodarts déjà ouverts lors de la mise à jour, ou dans un onglet qui ne répond
  plus, afin qu'un écran en mode kiosque continue de fonctionner sans
  rechargement. Il n'exécute que le script de l'extension elle-même, uniquement
  sur play.autodarts.com.
• Ressource accessible sur le Web switcher.html, pour play.autodarts.com
  uniquement — les joueurs que le bouton de la page Autodarts affiche par-dessus
  la page. C'est une page de l'extension dans un cadre, et les scripts de la page
  Autodarts ne peuvent pas y lire les comptes enregistrés.
• Accès à l'hôte play.autodarts.com — pour faire entrer une session dans la page
  Autodarts et l'en faire sortir, y afficher le bouton et trouver les onglets
  Autodarts ouverts, afin qu'un changement s'applique dans celui du premier plan
  et que les autres se rechargent. L'extension ne peut lire ni l'adresse ni le
  titre des autres onglets.
• Accès à l'hôte api.autodarts.com — pour se connecter, renouveler une session et
  y mettre fin, les mêmes requêtes que celles du site Autodarts. L'extension ne se
  connecte à aucun autre serveur, et sa politique de sécurité du contenu
  l'impose.

## Page d'accueil et assistance

Le store prend les adresses de la page d'accueil et de l'assistance une seule fois
pour toutes les langues, dans [`listing.en.md`](listing.en.md#homepage-and-support-urls).
Le site existe en anglais et en allemand ; les pages anglaises valent aussi pour
cette fiche.

## Catégorie

Productivité

## Objectif unique

Changer le compte Autodarts connecté sur un écran partagé sans se reconnecter.

## Images

Cette fiche montre les images anglaises, les fichiers `.en` de [`images/`](images/), rendus par `bash scripts/screenshots.sh` ; [le guide des versions](../docs/releases.md#the-images-of-the-store) indique quel emplacement du tableau de bord prend quel fichier.
