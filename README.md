# CodeAudit

Application locale mono-utilisateur d'audit statique JavaScript/TypeScript.
Le module de gestion des projets est disponible : création, liste, détail,
modification et suppression persistées dans PostgreSQL.

Le moteur ESLint JavaScript/TypeScript est disponible dans packages/analyzer,
avec profil versionné, diagnostics et statistiques. L'API importe des ZIP et expose
le suivi, l'historique et les rapports JSON persistés. Un worker indépendant traite
la file PostgreSQL, avec réservation atomique, délais et reprise après interruption.
L'interface des analyses reste à développer.

## Installation et démarrage

Prérequis : Node.js 24.15+ dans la branche 24, pnpm 12.3.4, Docker avec Compose.

```powershell
pnpm install --frozen-lockfile
# Seulement si .env n'existe pas :
Copy-Item .env.example .env
pnpm db:up
pnpm db:migrate
pnpm dev
```

Conserver un fichier .env existant. Si 5432 est occupé, modifier POSTGRES_PORT
et le port de DATABASE_URL ensemble avant de démarrer la base.
Compose, Prisma CLI et le client de l'API lisent .env à la racine ;
les variables du terminal sont prioritaires.
Les identifiants fournis sont destinés au poste local uniquement.

Frontend : http://127.0.0.1:5173/projects.
API : http://127.0.0.1:3000/api/projects ; santé du processus : /health.
Vite transmet /api/projects à l'API et /api/health à /health.
PORT, WEB_PORT et API_PROXY_TARGET peuvent être définis dans le terminal pour
utiliser d'autres ports. Ils ne sont pas chargés implicitement depuis .env par Vite.

pnpm dev génère le client Prisma et compile les packages partagés avant les serveurs.
Après modification d'un package partagé, relancer pnpm build:packages.
pnpm db:down arrête PostgreSQL en conservant son volume.

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

## Vérifications sans base de tests

```powershell
pnpm check
pnpm -r --if-present lint
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

## CI et documentation

GitHub Actions installe le lockfile, vérifie le code, démarre une base dédiée,
applique les migrations et exécute les tests d'intégration et navigateur.
L'arrêt PostgreSQL est prévu même après un échec.

- [Spécification du MVP](docs/specification.md)
- [Module projets et validation](docs/projects.md)
- [Import ZIP et exécution des analyses](docs/analyses.md)
- [Moteur analyzer, règles et résultats des fixtures](packages/analyzer/README.md)
- [Audit initial du socle](docs/verification.md)

Licence MIT, voir LICENSE.
