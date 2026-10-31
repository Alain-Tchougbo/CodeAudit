# Journal des expérimentations avec Codex

Ce journal décrit les actions observées dans cette session de développement.
Les données des tests sont des fixtures ; aucun résultat d'audit fictif n'est
injecté dans les écrans. Les tests simulés et les tests sur services réels sont
distingués ci-dessous. Les commandes temporaires de contrôle ne constituent pas
des fonctionnalités de l'application.

## Étapes précédentes vérifiables dans Git et les échanges

- Architecture validée avec Vue 3/Vite, NestJS, Prisma/PostgreSQL, moteur indépendant,
  pnpm et worker séparé. Codex a initialisé le socle, puis développé projets,
  moteur, file PostgreSQL et protections ZIP ; l'utilisateur a validé ces étapes.
- Le moteur a été exercé sur les fixtures clean/errors/warnings/syntax/ignored :
  24 tests réels ESLint, sans exécution des configurations importées ni autofix.
- Lors du lot worker, une multiplication SQL d'une durée liée comme texte par un
  intervalle PostgreSQL échouait. Des casts numériques explicites ont corrigé la
  réservation. Une erreur de flux ZIP pouvait aussi survenir avant l'installation
  de son consommateur ; l'ouverture du fichier cible a été placée avant celle du
  flux pour assurer la réception des erreurs de décompression.
- PR #1, commit caebe06 : staging, branches par tâche, modèle de PR, politique de
  destination et protections GitHub. Les PR de tâche sont fusionnées par squash ;
  une livraison staging vers main reste distincte.
- PR #2, commit 175c061 : tableau de bord, historique, détail, filtres et pagination.
  Résultats rapportés à cette étape : 102 tests, 46 intégrations PostgreSQL et
  3 parcours Playwright.
- PR #3, commit a54ce24 : instantanés du projet, export JSON v1, validation Ajv et
  conservation des anciennes analyses. Résultats rapportés à cette étape :
  111 tests, 57 intégrations PostgreSQL et 3 parcours Playwright. Un test Blob
  utilisait une méthode absente de jsdom ; sa lecture a été adaptée avec FileReader.

Ces totaux historiques ne sont pas les résultats de la revue courante.

## Revue avant démonstration — 31 octobre 2026

### Environnement et méthode

Branche de travail : `fix/demo-readiness`, issue de staging à jour.
Versions observées : Windows/PowerShell, Node 24.15.0, pnpm 12.3.4,
Docker 29.5.2, Compose 5.1.3 et Playwright 1.64.1.

Codex a lu les applications, packages, contrats, migrations, tests, workflows et
documents. Les corrections ont été écrites dans le dépôt puis vérifiées par les
commandes ci-dessous. Aucun sous-agent n'a été utilisé pour cette revue.

PostgreSQL 17 a été lancé avec Compose dans un projet dédié
`codeaudit-demo-mvvliu5w`, volume propre et base `codeaudit_demo_test`.
Les trois migrations ont été appliquées sur cette base vide. Les services de
développement préexistants et leurs volumes n'ont pas été réinitialisés.
Les données de test ont été nettoyées par identifiants ; aucun TRUNCATE.
Après les contrôles, le conteneur, le réseau et le volume de ce seul projet
Compose temporaire ont été supprimés. Le PostgreSQL de développement est resté sain.

### Constats et corrections

1. Le parcours complet n'était pas disponible dans Vue : le ZIP était envoyé par
   l'API dans les anciens E2E, pas par un formulaire. Ajout d'AnalysisImport avec
   sélection de fichier, limite de 10 Mio partagée avec le serveur, multipart sans
   Content-Type forcé, prévention du double envoi, erreurs et navigation vers le
   suivi réel. Une annulation HTTP n'est pas présentée comme une annulation garantie
   d'un travail déjà accepté ; l'interface invite à vérifier l'historique.
2. Les workers Playwright utilisaient le répertoire temporaire de développement.
   Leur maintenance, connectée à une autre base, pouvait considérer des sources
   locales comme orphelines. Les tests utilisent désormais exclusivement
   `.tmp/playwright-imports`, partagé par leur API et leurs workers.
3. Les scénarios partageaient la même file avec plusieurs vrais workers. Les E2E
   sont maintenant séquentiels afin que l'observation QUEUED soit déterministe,
   avant le lancement du worker du scénario. Les tests de concurrence restent
   présents séparément dans l'intégration PostgreSQL.
4. `pnpm audit --prod` a signalé Multer 2.4.0, alerte haute
   [GHSA-q7qp-rjg7-q26m](https://github.com/advisories/GHSA-q7qp-rjg7-q26m).
   L'avis a été consulté : il concerne les fileFilter asynchrones, absents de la
   configuration actuelle de CodeAudit. Le parseur a néanmoins été corrigé vers
   2.5.0 par un override ciblé de Nest/platform-express, sans migration majeure
   de NestJS. Le lockfile a été régénéré et l'installation figée vérifiée.
5. Les noms de périphériques supplémentaires COM¹, LPT², CONIN$, CONOUT$ et CLOCK$
   sont maintenant rejetés par la politique ZIP, avec cinq tests supplémentaires.
   Les rares messages ZIP encore en anglais ont été traduits.
6. Le worker pouvait sortir si sa connexion initiale échouait. La connexion est
   maintenant dans sa boucle de reprise. Un test démarre le vrai processus avec
   un port PostgreSQL fermé, puis ouvre un relais TCP vers la vraie base : le
   worker reste vivant et finit le travail sans être redémarré.
7. Les défaillances techniques d'extraction ne sont plus assimilées à un mauvais
   ZIP : erreurs moteur/stockage en 500, délai d'extraction en 422, validation ZIP
   en 400 et limites en 413. La consultation d'état ne charge plus le rapport JSONB
   complet ; elle sélectionne les seuls champs de synthèse.
8. Après le contrôle de persistance, le fichier JS volontairement fautif placé dans
   `.tmp` était analysé par le lint du dépôt : reproduction avec deux erreurs
   no-unused-vars/no-debugger. Ajout de `.tmp/**` aux exclusions et configuration
   racine imposée par le script lint. Un fichier eslint.config.mjs contrôlé qui
   lève une exception a ensuite été laissé dans ce dossier temporaire : `pnpm lint`
   réussit sans charger cette configuration ni analyser ces sources.
9. Le README et le README analyzer contenaient encore des mentions de moteur non
   branché ou de formulaire à développer. Mise à jour des instructions réelles,
   limites, configuration et parcours. La CI ajoute audit de production et
   conservation des résultats Playwright ; les workflows passent actionlint.

### Vérifications exécutées et résultats observés

| Vérification | Observation |
| --- | --- |
| `pnpm install --frozen-lockfile` | Réussite après modification du lockfile |
| `pnpm check` | Lint, TypeScript strict, builds, validation Prisma et 125 tests réussis |
| Répartition des 125 tests | 24 analyzer, 53 frontend, 39 ZIP/threads/stockage, 9 API unitaires |
| `pnpm --filter @codeaudit/api test:integration` | 58 tests réussis avec PostgreSQL réel |
| `pnpm exec playwright test` | 5 parcours Chromium réussis, un worker Playwright, aucun mock réseau |
| `docker compose config --quiet` | Réussite |
| `docker compose -p <projet_dédié> up -d --wait postgres` | Conteneur PostgreSQL sain, migrations appliquées |
| `pnpm db:check` sur la base dédiée | Connexion et schéma sans dérive détectée par Prisma |
| actionlint via l'image rhysd/actionlint | Les deux workflows sont valides |
| `pnpm audit --prod --json` après correction | Code de sortie 0, aucune alerte connue signalée |
| `pnpm audit --json` sur tout le monorepo | Code de sortie 1 : une alerte faible sur deepmerge de Jest, décrite plus bas |
| `pnpm lint` après création des sources et du config-sentinelle dans .tmp | Réussite ; fichiers importés exclus et configuration du dépôt imposée |

Les tests frontend simulent les réponses pour exercer erreurs et interactions.
Les intégrations ouvrent plusieurs connexions PostgreSQL et utilisent le vrai
analyzer. Elles couvrent réservation atomique, anciens jetons, interruption réelle
SIGKILL, délais, reconnexion, sources absentes, nettoyage, historique et export.
Le test de reprise avance l'expiration du bail en base pour ne pas attendre
15 secondes. Une panne de nettoyage est injectée ; aucun disque physique n'a été
mis en panne. Les tests de limites ZIP emploient aussi des seuils réduits, sans
prétendre constituer un essai de charge à toutes les limites maximales.

Le nouveau scénario `tests/e2e/demo.spec.ts` a réalisé, par le navigateur :

1. création d'un projet par son formulaire ;
2. sélection d'un véritable ZIP via le contrôle de fichier ;
3. lancement via le vrai endpoint, réponse 202 et navigation vers l'analyse ;
4. observation En attente, démarrage du vrai worker et passage à Terminée ;
5. rechargement et consultation des deux diagnostics persistés ;
6. combinaison gravité, fichier et règle ;
7. consultation de l'historique et réouverture du même identifiant ;
8. téléchargement du fichier et égalité de son JSON avec l'export API et le rapport stocké.

Le scénario ne force pas l'affichage fugace RUNNING : le polling peut passer de
QUEUED à SUCCEEDED entre deux lectures. RUNNING est vérifié dans les intégrations.
Un autre E2E rejette un ZIP traversant depuis le formulaire et constate qu'aucune
analyse n'a été créée. Les anciens parcours vérifient toujours CRUD, ressource
absente, pagination, affichage à 390 pixels et conservation d'un ancien rapport.

### Persistance et démarrage manuel

Un script temporaire `.tmp/persistence-check.cjs` a créé un projet, importé un vrai
ZIP et fait produire un rapport par le moteur et la file. Les sources ont été
supprimées, puis le conteneur PostgreSQL dédié a été recréé/redémarré avec le même
volume. Une nouvelle connexion Prisma a relu un rapport strictement identique.
Le projet marqueur a ensuite été supprimé. Ce contrôle ne constitue pas un test
de restauration de sauvegarde.

Difficulté observée : le port alloué avec POSTGRES_PORT=0 est passé de 32768 à
32769 après redémarrage. La première lecture a échoué avec P1001, avant toute
conclusion sur les données. Le port 32769 a été fixé dans la configuration du
projet de test, puis le redémarrage et la lecture ont été refaits avec succès.
Le README demande des ports hôte et DATABASE_URL cohérents.

`pnpm dev` a été lancé sur les ports dédiés API 3197 et Vite 5189, avec stockage
`.tmp/demo-dev-imports` et base dédiée. Contrôles réels : `/health`, page Vue,
proxy `/api/projects`, création d'un projet, POST multipart via curl, travail
traité par le worker de développement, export JSON contenant l'erreur attendue,
puis suppression du projet. Les processus de contrôle ont été arrêtés par Ctrl+C.
La première tentative, encore dirigée vers l'ancien port PostgreSQL, avait montré
la boucle de reconnexion du worker ; elle n'est pas comptée comme un succès.

Sous PowerShell, la redirection de stderr peut afficher NativeCommandError pour
des lignes de progression de pnpm ou des avertissements Node. Les conclusions
ci-dessus se fondent sur les codes de sortie et les résumés effectifs des outils.

### Limites et points restant ouverts

- Audit complet : alerte faible
  [deepmerge GHSA-gcqx-w48m-w2h4](https://github.com/advisories/GHSA-gcqx-w48m-w2h4),
  version 4.3.1 utilisée par Jest en développement, sans correctif publié lors de
  la consultation. Les configurations Jest sont maîtrisées ; aucune configuration
  d'un ZIP n'y est chargée. L'alerte reste visible, elle n'est pas ignorée par l'audit.
- Aucune certification de production : pas de sandbox système, limite RSS globale,
  interdiction réseau, quota global disque/file, audit des ACL Windows, pentest,
  benchmark prolongé ou restauration de sauvegarde vérifiée.
- Compose couvre PostgreSQL ; l'exécution applicative a été vérifiée localement.
  Chromium est le seul navigateur E2E exercé. Les workflows sont relus et validés
  avec actionlint ; la CI de la PR reste le contrôle obligatoire avant fusion.
- Le moteur ne réalise ni vérification sémantique des types TypeScript, ni
  résolution des imports, ni recherche exhaustive de vulnérabilités ou de secrets.
- Les avertissements VM Modules de Jest/Prisma et de couleurs du terminal sont
  encore présents ; ils n'ont pas produit d'échec lors des passes réussies.

Les preuves locales détaillées restent dans `.tmp/demo-*.log` et
`playwright-report/`, ignorés par Git. Les résultats CI sont attachés à la PR de
la branche fix/demo-readiness ; ce journal ne transforme pas les vérifications
locales en déclaration de préparation à la production.

## 31 octobre 2026 — authentification et isolation des comptes

Avant modification, lecture des modèles Prisma, des contrôleurs, des clients Vue,
des tests et du workflow Git. Stratégie présentée : sessions opaques PostgreSQL,
cookie HttpOnly, hachage scrypt, contrôle global des endpoints et propriétaire
obligatoire dans les requêtes métier. Le comptage initial des projets de la base
locale était nul. Les anciens projets éventuels restent conservés avec ownerId
NULL, invisibles aux comptes ; aucun premier inscrit ne les récupère implicitement.

Implémentation sur feat/session-authentication : tables User, Session et AuthThrottle,
relation Project.ownerId, migration SQL, inscription/connexion/profil/déconnexion,
expiration absolue et par inactivité, quotas persistants, protection CSRF et origine.
Le cookie de production est Secure et préfixé __Host ; les secrets de session et
les mots de passe ne sont pas renvoyés dans le profil. Le frontend restaure la
session via /api/auth/me, protège les routes, gère les 401 et ne stocke aucun
jeton d'authentification dans localStorage ou sessionStorage.

La migration a été exécutée sur la base locale et sur une base PostgreSQL de test
dédiée codeaudit_auth_test, dans un projet Docker Compose isolé. L'ancien serveur
de démonstration a été arrêté avant cette modification. Aucun compte de démonstration
ni mot de passe par défaut n'a été ajouté.

### Vérifications réellement exécutées

- Installation pnpm avec lockfile figé : réussie.
- Génération Prisma et migration deploy : réussies sur les deux bases.
- pnpm db:check : aucune différence entre le schéma et les bases locale/de test.
- pnpm check : lint sans avertissement, typage, builds et validation Prisma réussis ;
  144 tests réussis (24 analyzer, 39 analysis-jobs, 12 API, 69 frontend).
- Tests d'intégration API sur PostgreSQL réel : 84 réussis, dont 26 cas auth.
  Deux comptes échangent leurs identifiants de projets et d'analyses dans les
  requêtes HTTP : lecture, modification, suppression, import, historique, résultats,
  rapports et indicateurs sont contrôlés. Les ressources étrangères répondent 404.
- Tests Playwright Chromium : 8 réussis, dont 3 nouveaux scénarios auth ; inscription
  mobile, profil, rechargement, connexion/déconnexion, rejet du cookie révoqué,
  expiration réelle en base et accès étranger refusé. Le parcours ZIP/analyse/
  filtres/historique/export existant fonctionne avec un compte authentifié.
- docker compose config --quiet et git diff --check : réussis.
- pnpm audit --prod : aucune vulnérabilité signalée après correction de minimatch.
  pnpm audit complet : 1 alerte faible deepmerge et 1 modérée glob, dans l'outillage
  de développement ; la commande complète ne passe donc pas sans alerte.

### Difficultés et corrections observées

La première passe frontend a échoué sur quatre assertions des anciens clients HTTP :
elles attendaient des objets d'en-têtes sans les nouveaux marqueurs CSRF/cookies.
Les assertions vérifient désormais les vrais Headers et credentials, tout en
préservant l'absence de Content-Type forcé pour les imports multipart. Les passes
suivantes ont réussi. Une passe globale a aussi signalé le formatage Vue du profil ;
il a été corrigé puis le contrôle global entièrement relancé.

Une réponse 401 ancienne pouvait effacer l'état d'une session ouverte entre-temps.
Le client compare maintenant une génération de session ; un test frontend couvre
ce cas. L'audit a révélé une nouvelle alerte minimatch : passage à la version
11.0.1 corrigée, mise à jour du lockfile, puis nouvelle passe complète check,
intégration et navigateur avec succès. Les deux alertes de développement restantes
sont documentées ; glob nécessite une migration majeure de l'outillage à valider.

Les avertissements Node VM Modules/couleurs et l'affichage NativeCommandError par
les redirections PowerShell restent présents. Les résultats ci-dessus se fondent
sur les résumés des tests et les codes de sortie, pas sur ces lignes de progression.
Les traces locales sont dans .tmp/auth-*.log et les rapports Playwright ignorés par Git.

### Limites

Les attributs Secure/__Host sont vérifiés via les réponses HTTP de test ; aucun
déploiement HTTPS réel ni pentest n'a été réalisé. Réinitialisation du mot de passe,
validation d'adresse, MFA et gestion des appareils ne sont pas implémentées.
L'affectation de projets anciens à un compte doit être une opération administrateur
explicite. Les limites système/worker et les quotas publics restent à revoir avant
production. Ces vérifications ne constituent pas une garantie générale de sécurité.
