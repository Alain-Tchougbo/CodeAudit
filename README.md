# CodeAudit

Application d'audit statique JavaScript/TypeScript avec comptes, projets personnels
et partage explicite en équipes.
Le mode de lancement documenté reste local ; l'authentification ne constitue pas
à elle seule une validation pour un déploiement public.
Le module de gestion des projets est disponible : création, liste, détail,
modification et suppression persistées dans PostgreSQL.

Le moteur ESLint JavaScript/TypeScript est disponible dans packages/analyzer,
avec profil versionné, diagnostics et statistiques. L'API importe des ZIP et expose
le suivi, l'historique et les rapports JSON persistés. Un worker indépendant traite
la file PostgreSQL, avec réservation atomique, délais et reprise après interruption.
Le tableau de bord et les pages de consultation des analyses sont disponibles.

Les « Seuils qualité » d'un projet fixent les nombres maximaux d'erreurs et
d'avertissements pour ses prochaines analyses. Chaque demande conserve sa politique ;
une analyse peut être SUCCEEDED avec une décision qualité négative. Les clés CI
personnelles expirantes restent limitées à un projet. Le CLI `pnpm audit:ci`
soumet un ZIP, attend le worker et renvoie un code de validation. Voir
[les seuils, clés et intégration GitHub Actions](docs/ci.md).

La fiche projet propose aussi « Analyser depuis GitHub » : dépôt public au format
propriétaire/dépôt, référence facultative ou numéro de pull request. Le commit
résolu et le fork éventuel sont conservés avec l'analyse ; les chemins sont
normalisés après validation du ZIP. Les imports Git produisent un export v2 avec
provenance ; les exports ZIP historiques restent en v1. Voir
[l'import Git et ses limites](docs/git-import.md).

Une analyse en attente ou en cours peut être annulée depuis son détail, après
confirmation. En cours, « Annulation demandée » précède l'arrêt effectif ; l'état
final est « Annulée », distinct d'un échec technique. Aucun rapport partiel n'est
publié et une nouvelle analyse nécessite un nouvel import. Les sources annulées
sont supprimées par le worker ; si celui-ci est arrêté, ce nettoyage attend son
redémarrage. Les rapports des autres analyses restent conservés.

Dans la fiche d'un projet, « Profil de règles » propose Essentiel
(`codeaudit-js-ts-v1`, comportement historique) et Strict
(`codeaudit-js-ts-strict-v1`). Le détail des règles vient de l'API. Le choix est
enregistré pour les prochaines demandes ; chaque demande fige sa version avant
l'exécution et les anciens rapports ne changent pas. Strict transforme console,
variables inutilisées et `any` explicite en erreurs, et avertit sur une complexité
supérieure à 10 ou une profondeur supérieure à 4. Aucun profil fourni par le
projet importé, plugin externe, configuration inline ou correctif n'est exécuté.

## Installation et démarrage

Prérequis : Node.js 24.15+ dans la branche 24, pnpm 12.3.4, Docker avec Compose.

```powershell
pnpm install --frozen-lockfile
if (!(Test-Path .env)) { Copy-Item .env.example .env }
pnpm auth:init-key
pnpm db:up
pnpm db:migrate
pnpm mail:up
pnpm dev
```

Conserver un fichier .env existant. Si 5432 est occupé, modifier POSTGRES_PORT
et le port de DATABASE_URL ensemble avant de démarrer la base.
Compose, Prisma CLI et le client de l'API lisent .env à la racine ;
les variables du terminal sont prioritaires.
Les identifiants fournis sont destinés au poste local uniquement.
Docker Compose fournit PostgreSQL ; API, frontend et worker sont lancés localement
par `pnpm dev`. Le volume PostgreSQL conserve les données entre les arrêts.

Frontend : http://127.0.0.1:5173/ (tableau de bord), puis /projects.
Créer son compte dans `/register`, puis se connecter dans `/login` si nécessaire.
Une session serveur restaure l'accès après rechargement ; aucun jeton n'est stocké
dans localStorage. Chaque compte voit ses projets personnels et ceux des équipes
auxquelles il appartient actuellement, avec les droits correspondant à son rôle.
API : http://127.0.0.1:3000/api/projects ; santé du processus : /health.
Vite transmet /api à l'API et /api/health à /health.
PORT, WEB_PORT et API_PROXY_TARGET peuvent être définis dans le terminal pour
utiliser d'autres ports. Ils ne sont pas chargés implicitement depuis .env par Vite.

pnpm dev génère le client Prisma et compile les packages partagés avant les serveurs.
Après modification d'un package partagé, relancer pnpm build:packages.
pnpm db:down arrête PostgreSQL en conservant son volume.

### Récupération de compte et sessions

Configurer SMTP_HOST=127.0.0.1 et SMTP_PORT=1026 dans .env pour le service
Mailpit local (`pnpm mail:up`). Ouvrir http://127.0.0.1:8026 pour lire uniquement
les messages de développement. Aucune livraison externe n'est configurée.
Depuis `/forgot-password`, demander un lien ; il expire après 15 minutes et ne
fonctionne qu'une fois. Le changement révoque toutes les sessions du compte.
Dans « Mon profil », consulter les sessions actives et révoquer une session ou
toutes les sessions. Aucun nom d'appareil ni emplacement géographique n'est déduit.

Le SMTP réel exige TLS en production, SMTP_USER/SMTP_PASSWORD si nécessaire,
MAIL_FROM et AUTH_APP_ORIGIN correctement configurés. Ces secrets restent côté
serveur. Sans SMTP_HOST, la récupération est explicitement indisponible.
Pour les tests PostgreSQL/Playwright, lancer aussi Mailpit ; TEST_SMTP_PORT et
TEST_MAILPIT_API_URL valent par défaut 1026 et http://127.0.0.1:8026.

### Équipes et partage

Depuis « Équipes », créer une équipe puis inviter une adresse avec le rôle Membre
ou Lecture seule. L'invitation est envoyée via le même service SMTP que la
récupération du compte ; en local, consulter Mailpit. Le destinataire ouvre le lien,
se connecte ou s'inscrit avec cette adresse, puis accepte explicitement. Le lien
expire après sept jours et ne fonctionne qu'une fois. Aucune adhésion automatique
n'est créée sur la seule base d'une adresse inscrite.

Un projet reste personnel tant que son propriétaire ne confirme pas son partage
depuis la fiche projet. Le partage donne accès à tout son historique, ses rapports
et ses extraits enregistrés, et révoque ses clés CI existantes. Un membre retiré
perd l'accès, même s'il a créé le projet. Les réglages et suppressions nécessitent
un administrateur. [Droits, endpoints et limites des équipes](docs/teams.md).

### Comptes et sécurité

« Mon profil » permet de modifier son nom, vérifier ou changer son adresse e-mail,
changer son mot de passe, configurer la 2FA TOTP avec codes de secours, associer
GitHub/GitLab, exporter ses données, consulter les événements et supprimer son compte.
Sessions et récupération par e-mail restent disponibles. Les actions sensibles
exigent le mot de passe actuel et la 2FA si active. La suppression conserve les
projets partagés et protège le dernier administrateur d'une équipe active.

Initialiser SECURITY_ENCRYPTION_KEY avec `pnpm auth:init-key` et sauvegarder cette
clé hors de Git. GitHub/GitLab nécessitent aussi leurs identifiants d'application
OAuth côté serveur ; les boutons restent indisponibles sans configuration. Les
échanges sont testés avec un transport contrôlé, sans prétendre avoir vérifié une
connexion réelle chez les fournisseurs. [Configuration et comportement détaillés](docs/account-security.md).

### Configuration

| Variable | Valeur par défaut / usage |
| --- | --- |
| POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB | codeaudit ; développement local, dans .env |
| POSTGRES_PORT | 5432 ; port hôte Docker à faire correspondre à DATABASE_URL |
| DATABASE_URL | URL PostgreSQL de .env ; une variable du terminal est prioritaire |
| PORT | API : 3000, à définir dans le terminal pour la changer |
| WEB_PORT | Vue/Vite : 5173, à définir dans le terminal |
| API_PROXY_TARGET | http://127.0.0.1:3000 ; même port que PORT |
| AUTH_APP_ORIGIN | Origine exacte du navigateur, défaut http://127.0.0.1:5173 ; HTTPS obligatoire en production |
| CODEAUDIT_STORAGE_ROOT | .tmp/imports ; répertoire dédié partagé par API et worker, même valeur dans les deux processus |
| TEST_DATABASE_URL | Base migrée distincte, nom terminé par _test, obligatoire pour intégration/E2E |
| E2E_API_PORT, E2E_WEB_PORT | 3100 et 5175 ; ports réservés aux serveurs Playwright |

Les services écoutent sur l'interface locale. `/health` vérifie seulement que l'API
répond ; utiliser `pnpm db:check` pour vérifier PostgreSQL et ses migrations.
Si une analyse reste en attente, vérifier la console du worker et sa connexion à
la même base et au même stockage. Un worker réessaie lorsque la base est indisponible.

### Parcours de démonstration

1. Ouvrir `/projects`, ajouter un projet et remplir le formulaire.
2. Dans sa fiche, sélectionner une archive via « Archive ZIP du projet ».
3. Cliquer sur « Lancer l’analyse » ; le navigateur ouvre le suivi.
4. Suivre En attente / En cours / Terminée, actualisés automatiquement.
5. Consulter les fichiers, positions, règles, gravités et messages.
6. Combiner les filtres par gravité, nom de fichier et règle ; naviguer entre les pages.
7. Revenir au projet, consulter l'historique et rouvrir une ancienne analyse.
8. Télécharger « Exporter le rapport JSON » depuis une analyse réussie.

Ces étapes nécessitent un compte connecté. Le menu « Mon profil » affiche le
profil courant ; « Se déconnecter » révoque la session en base et efface son cookie.
Voir [l'authentification, les limites et la migration](docs/authentication.md).

L'interface partage un système de styles dans apps/web/src/style.css : navigation
adaptée aux petits écrans, recherche locale des projets, diagnostics lisibles en
fiches sur téléphone et confirmations utilisables au clavier. Les captures des
tests d'interface sont jointes au rapport Playwright (`pnpm exec playwright show-report`)
et aux artefacts de la CI. Elles utilisent les réponses réelles de l'API de test.

Depuis l'historique d'un projet, cocher deux analyses réussies puis cliquer sur
« Comparer les analyses ». La plus ancienne sert de référence par défaut ; le sens
peut être inversé. La comparaison distingue diagnostics nouveaux, persistants et
résolus, avec les filtres habituels. « Résolu » signifie absent du rapport cible,
pas nécessairement corrigé. Les rapports doivent avoir les mêmes profils, moteurs
et limites. La sélection peut traverser plusieurs pages d'historique.

À l'import, l'option facultative « Conserver un aperçu du code » enregistre des
extraits bornés autour des diagnostics. Elle est désactivée par défaut. « Voir le
code » les charge à la demande ; leur suppression peut être confirmée depuis les
résultats. Les extraits peuvent contenir des informations sensibles : ils restent
privés au même titre que les analyses. Les fichiers temporaires sont supprimés
après traitement ; les extraits ne sont pas ajoutés aux exports JSON existants.

Pour préparer un petit ZIP depuis PowerShell, créer un dossier contenant un fichier
`index.js` avec `missing;` et `console.log('demo');`, puis utiliser
`Compress-Archive -Path chemin/du/dossier/* -DestinationPath demo.zip`.
Ces sources sont analysées comme du texte ; leurs scripts et dépendances ne sont
jamais exécutés ni installés. Une nouvelle analyse exige un nouvel import.
Préparer de préférence un ZIP des sources sans node_modules, .git, dist, build ou
coverage : ces répertoires ignorés par le moteur comptent néanmoins dans les limites d'import.

Limites : ZIP 10 Mio, 2 000 entrées et nœuds extraits, fichier 5 Mio, total extrait
50 Mio, extraction/analyse 60 secondes chacune et rapport 10 Mio. Un diagnostic
de code donne SUCCEEDED ; FAILED indique un échec technique. Une réservation
abandonnée n'est pas relancée avec le même identifiant.

## Gestion des projets

| Méthode | Endpoint | Résultat |
| --- | --- | --- |
| POST | /api/projects | Création, HTTP 201 |
| GET | /api/projects | Liste du plus récent au plus ancien |
| GET | /api/projects/:id | Détail |
| PATCH | /api/projects/:id | Modification partielle |
| DELETE | /api/projects/:id | Suppression, HTTP 204 |

Nom : 1 à 120 caractères après suppression des espaces périphériques.
Description : facultative, 2 000 caractères maximum ; null ou vide pour l'effacer.
Les noms identiques sont autorisés ; les identifiants UUID sont uniques.
Les champs inconnus, les identifiants invalides et les modifications vides sont rejetés.
Erreurs : corps JSON avec code stable, message, détails de validation éventuels
et identifiant de requête. Ressource absente : 404 ; analyse active : 409.

La suppression d'un projet est transactionnelle : refus pour QUEUED/RUNNING,
suppression en cascade des analyses terminées.
Voir [le module projets](docs/projects.md).

## Exécution des analyses

Importer un ZIP avec `POST /api/projects/:id/analyses`, champ multipart `archive`.
Suivre son état avec `GET /api/analyses/:id`, son historique avec
`GET /api/projects/:id/analyses` et ses résultats avec `GET /api/analyses/:id/results`.
`pnpm dev` lance aussi le worker ; API et worker partagent `.tmp/imports`.
Voir [les commandes, limites ZIP et garanties de concurrence](docs/analyses.md).
Le tableau de bord utilise `GET /api/dashboard` ; chaque projet donne accès à son
historique et les rapports sont consultables dans `/analyses/:id`.
Voir [les indicateurs et filtres de consultation](docs/consultation.md).
L'historique conserve les rapports de chaque analyse. Le bouton d'export du détail
télécharge le rapport complet et versionné via `GET /api/analyses/:id/report`.
Voir [le schéma JSON et la conservation historique](docs/report-export.md).

## Base de données et migrations

```powershell
pnpm db:generate
pnpm db:validate
pnpm db:migrate
pnpm db:check
```

db:migrate applique les migrations versionnées, sans réinitialisation.
db:check vérifie en lecture seule la connexion et l'absence de dérive du schéma
pris en charge par Prisma. Les contraintes CHECK personnalisées sont versionnées
dans le SQL de migration et couvertes par les tests d'intégration.
Pour une prochaine évolution : pnpm db:migrate:dev --name nom_de_migration.

Le package database fournit Prisma Client 7 et l'adaptateur PostgreSQL.
Le code généré est ignoré par Git ; son build le régénère automatiquement.
Les contrats publics proposent des exports ESM pour Vite et CommonJS pour NestJS.
Les tâches pnpm des workspaces sont séquentielles pour limiter la consommation mémoire.
Le lint racine impose la configuration du dépôt et exclut `.tmp`, afin que les
sources importées et leurs éventuelles configurations restent hors de ces vérifications.

## Vérifications sans base de tests

```powershell
pnpm check
pnpm -r --if-present lint
pnpm audit --prod
pnpm audit
```

check lance lint, typage (incluant Playwright), builds, tests unitaires/frontend
et validation du schéma. Les tests d'intégration et E2E sont des commandes explicites.
Les tests unitaires simulent les dépendances ; les écrans de production n'ont
aucune donnée fictive ni mécanisme de repli vers de telles données.

## Tests avec PostgreSQL réel

Utiliser une base dédiée dont le nom se termine par _test.
Exemple avec le PostgreSQL du dépôt, en adaptant le port à .env :

```powershell
docker compose exec -T postgres createdb -U codeaudit codeaudit_test
$env:TEST_DATABASE_URL = 'postgresql://codeaudit:codeaudit@127.0.0.1:5432/codeaudit_test?schema=public'
$env:DATABASE_URL = $env:TEST_DATABASE_URL
pnpm db:migrate
Remove-Item Env:DATABASE_URL
pnpm test:integration
pnpm test:e2e:install
pnpm test:e2e
```

La commande createdb n'est nécessaire qu'une fois. Si DATABASE_URL était déjà
défini dans le terminal, restaurer sa valeur après migration au lieu de la supprimer.
Les tests nettoient seulement les identifiants qu'ils ont créés ; aucune table
n'est tronquée. Ne pas utiliser une base contenant des données à conserver.

Les tests Supertest utilisent le vrai Prisma Client.
Jest est lancé avec --experimental-vm-modules pour le moteur Prisma 7.
Playwright démarre son API et Vite, sans réutiliser un serveur existant.
Ports E2E par défaut : API 3100, frontend 5175 ; surcharge par E2E_API_PORT et
E2E_WEB_PORT. TEST_DATABASE_URL doit être défini dans le terminal.
Le parcours navigateur réalise le CRUD complet via HTTP, sans intercepter les données.
Le scénario `tests/e2e/demo.spec.ts` réalise aussi les huit étapes ci-dessus depuis
Vue, avec un vrai ZIP, PostgreSQL et le worker. Il observe la file avant de lancer
son worker de test. Les scénarios sont séquentiels pour éviter qu'un autre worker
ne consomme ce travail avant l'observation de son état.

Le stockage E2E est isolé dans `.tmp/playwright-imports` ; les serveurs et workers
de test utilisent ce répertoire au lieu des sources de développement.
Playwright produit `playwright-report/` et conserve une trace des échecs. Pour lire
le rapport : `pnpm exec playwright show-report`. Seul Chromium est testé ici.

## CI et documentation

Workflow Git : une branche par tâche, PR vers `staging`, puis PR de livraison
`staging` vers `main`. Voir [les commandes et règles de fusion](docs/git-workflow.md).

GitHub Actions installe le lockfile, vérifie le code, démarre une base dédiée,
applique les migrations et exécute les tests d'intégration et navigateur.
L'arrêt PostgreSQL est prévu même après un échec.
La CI vérifie aussi les dépendances d'exécution et conserve les résultats
Playwright pendant sept jours. Les contrôles `check` et `pr-policy` sont requis
pour fusionner vers staging. Les actions sont validables avec actionlint.

## Limites avant un usage en production

Ce MVP est destiné à une démonstration locale avec des comptes et données isolés. Les contrôles V8
et les threads ne fournissent ni plafond RSS global, ni sandbox système, ni
interdiction réseau. Les limites sont par import/analyse, sans quota global de
stockage ou de file. Aucun audit des ACL Windows, test de charge prolongé,
test de restauration de sauvegarde, audit d'image système ou pentest n'est réalisé.
L'authentification par session et l'isolation des données sont implémentées et testées.
Le déploiement HTTPS public, la confiance des reverse proxies, la supervision et
une revue de sécurité de production restent à établir avant exposition réseau.

Le profil ESLint est maîtrisé et versionné, sans informations de types, résolution
des imports ni règles de framework ; il ne certifie pas l'absence de failles.
Les dates, versions et diagnostics exportés sont ceux persistés, avec la provenance
des instantanés historiques. Voir les limites détaillées du moteur et de l'exécution.

Au contrôle du 31 octobre 2026, l'audit d'exécution ne signale plus d'alerte après
correction de Multer et minimatch. L'audit complet signale encore deux alertes
sur l'outillage de développement : deepmerge 4.3.1 (faible, sans correctif publié
dans [l'avis amont](https://github.com/advisories/GHSA-gcqx-w48m-w2h4)) et glob
(modérée, utilisé par Jest et Vue Test Utils ; le correctif nécessite une migration
vers glob 14 selon [l'avis amont](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4)).
Ces outils ne chargent aucune configuration des ZIP importés. Leur mise à jour
reste à valider séparément. Refaire les audits avant une livraison ; leur résultat évolue.

- [Spécification du MVP](docs/specification.md)
- [Module projets et validation](docs/projects.md)
- [Import ZIP et exécution des analyses](docs/analyses.md)
- [Moteur analyzer, règles et résultats des fixtures](packages/analyzer/README.md)
- [Audit initial du socle](docs/verification.md)
- [Journal des expérimentations avec Codex](docs/experiment-log.md)

Licence MIT, voir LICENSE.
