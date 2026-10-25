# Audit du socle technique — CodeAudit

Audit réalisé le 30 octobre 2026, sous Windows/PowerShell.
Aucune fonctionnalité métier développée ; aucune nouvelle dépendance ajoutée.

## Environnement

- Node.js 24.15.0 ; pnpm 12.3.4.
- Docker 29.5.2 ; Docker Compose 5.1.3.
- PostgreSQL testé : 17.11, image postgres:17-alpine.
- Validation statique GitHub Actions : actionlint 1.7.12, image officielle
  rhysd/actionlint, digest sha256:b1934ee5f1c509618f2508e6eb47ee0d3520686341fec936f3b79331f9315667.

## Organisation et configurations examinées

Le monorepo contient la racine et sept workspaces privés, découverts par
apps/* et packages/*. Les dépendances internes utilisent workspace:*.
Les builds de contracts et analyzer précèdent leurs applications consommatrices ;
leurs déclarations sont générées avant le typage global.

- Vue : point d'entrée, composant racine, route / et historique HTML5,
  plugin Vue Vite, plugin Tailwind et import CSS présents.
- TypeScript : base stricte commune, configuration navigateur, configurations
  Node16 pour les serveurs/packages, compilation API séparée des tests.
- NestJS : reflect-metadata, décorateurs et métadonnées, arrêt du processus,
  écoute locale, transformation Jest et démarrage ts-node cohérents.
- PostgreSQL : port lié à 127.0.0.1, volume nommé et healthcheck Compose.
- Prisma 7 : URL dans prisma.config.ts, schéma PostgreSQL valide sans modèle.
  Aucun client Prisma ni migration à ce stade.
- Analyzer : package indépendant, exports compilés, identifiant de profil et
  extensions pris en charge. Le moteur et les règles effectives ne sont pas implémentés.
- Worker : dépend uniquement d'analyzer ; sa version compilée démarre puis termine
  en annonçant qu'elle ne consomme aucun travail. Le watcher de développement reste
  un outil de surveillance du squelette.
- Tests : Jest/Supertest pour HTTP ; Vitest/jsdom/Vue Test Utils pour l'accueil ;
  Playwright/Chromium pour le navigateur.
- CI : installation figée, contrôles locaux, validation Compose, connexion PostgreSQL,
  test navigateur et arrêt de la base même en cas d'échec ; durée maximale 15 minutes.

## Corrections apportées pendant cet audit

1. Ajout de tsconfig.tools.json et de typecheck:tools pour inclure
   playwright.config.ts et tests/e2e/**/*.ts dans le typage global.
2. Ajout des scripts lint aux six workspaces contenant du TypeScript.
3. Découverte récursive des suites existantes via pnpm -r --if-present test.
4. Ajout de check:connection au package database et de db:check à la racine :
   lecture du schéma réel par Prisma, sans écriture SQL.
5. Ajout du démarrage PostgreSQL, du contrôle de connexion et de l'arrêt garanti
   à la CI, ainsi qu'un timeout de job.
6. Documentation des scripts, des commandes exécutées et des limites de validation.

## Scripts disponibles par workspace

| Workspace | Scripts applicables |
| --- | --- |
| api | dev, build, start, typecheck, lint, test |
| web | dev, build, preview, typecheck, lint, test |
| worker | dev, build, start, typecheck, lint |
| analyzer | build, typecheck, lint |
| contracts | build, typecheck, lint |
| database | validate, check:connection, typecheck, lint |
| config | Aucun script nécessaire : configuration JSON statique utilisée par les autres workspaces |

Pas de scripts de test factices pour worker/analyzer/contracts : ils n'ont pas
encore de suites. Pas de build artificiel pour database ou config, qui ne
produisent actuellement aucun code exécutable.
Les outils sont installés à la racine ou dans leur workspace utilisateur.
La racine orchestre les commandes globales et les commandes Docker.

## Commandes exécutées et résultats

Les commandes regroupées par pnpm check ont bien été exécutées, avant puis après
les corrections. Les vérifications réussies correspondent au code actuel.

| Commande / contrôle | Résultat |
| --- | --- |
| pnpm install --frozen-lockfile | Réussite ; installation existante et lockfile cohérents |
| pnpm check | Réussite avant et après corrections |
| pnpm lint | Réussite, zéro avertissement ESLint |
| pnpm -r --if-present lint | Six scripts locaux réussis |
| pnpm typecheck | Réussite ; inclut désormais le typage Playwright |
| pnpm typecheck:tools | Réussite via typecheck |
| pnpm build:packages | Réussite via typecheck |
| pnpm build | Réussite : frontend, API, worker, analyzer et contracts |
| pnpm test | 1 test Jest/Supertest et 1 test Vitest/Vue Test Utils réussis |
| pnpm db:validate | Schéma Prisma valide |
| pnpm --filter @codeaudit/database exec prisma format --check | Format du schéma correct |
| pnpm test:e2e:install | Navigateur Chromium disponible |
| pnpm test:e2e | 1 test Chromium réussi ; serveur local existant réutilisé |
| pnpm --filter @codeaudit/worker start | Réussite, état de squelette explicite |
| pnpm --filter @codeaudit/api start | Réussite sur le port temporaire 31987 ; GET /health correct |
| HTTP GET :3000/health et :5173/api/health | Réponses attendues des serveurs déjà présents |
| docker compose config --quiet | Configuration valide |
| actionlint .github/workflows/ci.yml via Docker | Réussite avant et après correction du workflow |
| pnpm --filter @codeaudit/api why glob | Origine de glob 10.5.0 identifiée : test-exclude / outils Jest |

L'API temporaire a été arrêtée après son contrôle. Les services préexistants n'ont
pas été arrêtés ou modifiés. Les journaux temporaires sont ignorés par Git.

## Vérification réelle PostgreSQL / Prisma

Projet Docker isolé utilisé : codeaudit-audit-mvuti728.

1. docker compose -p codeaudit-audit-mvuti728 up -d --wait postgres
   avec POSTGRES_PORT=55432 : échec, port déjà réservé par Docker.
2. Même commande avec POSTGRES_PORT=0 : réussite, service healthy ;
   Docker a attribué 127.0.0.1:32768.
3. docker compose -p codeaudit-audit-mvuti728 exec -T postgres
   psql -U codeaudit -d codeaudit -v ON_ERROR_STOP=1
   -c "SELECT current_database(), current_user, version();" : réussite.
4. DATABASE_URL pointant sur ce port, pnpm db:check : réussite.
   La commande sous-jacente est prisma migrate diff --from-empty
   --to-config-datasource ; résultat : No difference detected.
5. docker compose -p codeaudit-audit-mvuti728 down --volumes : réussite.
   Le conteneur, le réseau et le volume créés pour cet audit ont été supprimés.
   docker compose -p codeaudit-audit-mvuti728 ps -a ne liste plus de conteneur.

Ces contrôles démontrent le démarrage et l'authentification PostgreSQL, ainsi que
la connexion du CLI Prisma à la base. Ils ne démontrent pas une connexion via
Prisma Client, qui n'existe pas encore, ni le fonctionnement de futures migrations.

## Limites et points restants

- Aucun contrôle automatique exécuté ne reste en échec après les corrections.
- Le test de nouveau lancement global pnpm dev a été arrêté au précontrôle :
  des ports habituels étaient déjà utilisés. La commande globale n'a donc pas été
  lancée par cet audit. L'API compilée a été démarrée séparément ; l'accueil,
  l'API et le proxy déjà présents ont été contrôlés. Les redémarrages automatiques
  des watchers n'ont pas été testés.
- Le workflow est validé statiquement et ses contrôles principaux ont été exécutés
  localement ; aucune exécution réelle GitHub Actions ni validation complète sous Linux.
- L'installation figée a été vérifiée sur le poste courant, pas depuis un clone vierge.
- glob 10.5.0 reste une dépendance transitive dépréciée de test-exclude/Jest.
  Aucun override de version majeure n'a été imposé.
- L'analyzer, la file PostgreSQL, les modèles, les imports ZIP et les protections
  des sources sont toujours à développer. Aucun test métier ou de sécurité
  des imports n'a été exécuté ; les trois tests actuels couvrent seulement le socle.

## Références

- https://github.com/rhysd/actionlint/blob/main/docs/usage.md
- https://www.prisma.io/docs/cli/v7/migrate
- https://pnpm.io/cli/run
