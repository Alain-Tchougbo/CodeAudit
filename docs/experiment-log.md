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

## 31 octobre 2026 — refonte visuelle du frontend

Audit des huit vues Vue, des composants, des routes et des interactions : styles
des projets différents de ceux des analyses, hiérarchie irrégulière, actions et
espacements disparates, absence de recherche de projets, tableau de diagnostics
trop large sur téléphone et métadonnées d'analyse trop volumineuses sur mobile.

Direction retenue et implémentée sur feat/interface-redesign : « atelier de code »,
navigation vert profond, surfaces claires légèrement chaudes, accents menthe,
typographie système locale et monospace. Variables réutilisables dans style.css,
icônes SVG locales AppIcon et composants EmptyState/AnalysisProgress ; aucune
dépendance supplémentaire, police distante, image décorative ou donnée fictive
introduite dans les écrans. Les fixtures restent dans les tests et bases dédiées.

Les huit vues ont été reprises : connexion/inscription, tableau de bord, liste,
création, modification et détail de projet, détail d'analyse et profil. Les parcours
gardent les appels API existants et les contrôles d'authentification. Recherche
locale dans les projets reçus, indicateurs regroupés, historique en lignes,
diagnostics en tableau sur ordinateur et fiches sur téléphone. La durée et l'état
restent visibles ; identifiant technique et provenance se consultent dans un volet
natif details. Aucun pourcentage d'avancement ou score qualité n'est inventé.

Accessibilité : labels de champs, affichage/masquage du mot de passe, lien
d'évitement, titres de document, focus après navigation, confirmation de suppression
avec focus initial sur Annuler, Échap et restitution du focus, états textuels et
icônes associés aux couleurs, mouvement réduit et transitions discrètes.

Vérifications locales réellement exécutées :

- Installation pnpm figée réussie, sans modification des dépendances ou du lockfile.
- pnpm check réussi : lint, TypeScript, builds, schéma Prisma et 152 tests
  (24 analyzer, 39 analysis-jobs, 12 API, 77 frontend).
- Après les derniers ajustements visuels, typage Vue, build Vite et les 77 tests
  frontend relancés avec succès ; ESLint a aussi été relancé sans erreur.
- Deux passes Playwright complètes réussies : 9 scénarios chacune, avec API,
  PostgreSQL et worker réels dans l'environnement dédié codeaudit_ui_test.
  Le parcours import/analyse/diagnostics/historique/export, l'authentification,
  la recherche de projets et la confirmation au clavier ont été exercés.
- Tests d'intégration API sur PostgreSQL réel : 84 réussis, dont l'isolation des
  comptes, les sessions, les imports et l'exécution des analyses.
- Une passe ciblée interface a aussi réussi après ajout du contrôle ordinateur.
  Les scénarios vérifient l'absence de débordement horizontal à 320/390/768/1440 pixels,
  le mouvement réduit et des contrastes calculés à partir des styles du navigateur
  pour l'action primaire et la navigation active (seuil 4,5:1).
- Captures Chromium de connexion/inscription, tableau de bord, projets, formulaire,
  profil et analyses examinées visuellement ; ajustement de la densité des métadonnées
  mobiles et remplacement du sélecteur de fichier natif tronqué par un contrôle stylé.
  Les captures privées sont des pièces jointes du rapport Playwright.

Difficultés et corrections : une balise option incorrecte a été signalée par
ESLint puis corrigée avant les contrôles réussis. Le build des packages partagés
redémarre l'API de développement : une première capture de connexion montrait
l'erreur réelle du proxy pendant ce redémarrage. Les captures ont été reprises
après disponibilité de l'API. Une ancienne erreur réseau restait affichée après
confirmation d'une session absente ; clearSession l'efface désormais, avec un test
de régression. Le suivi d'un échec technique ne marque pas le traitement comme
réussi et ne promet pas de rapport disponible.

Limites : Chromium uniquement ; Safari, Firefox, lecteurs d'écran, zoom système
et appareils tactiles physiques restent à contrôler. Les contrastes ciblés et
tests clavier ne constituent pas un audit exhaustif WCAG. Les avertissements
Node VM Modules/couleurs restent présents sans échec des passes réussies.
Traces locales dans .tmp/redesign-*.log ; captures et rapports sont ignorés par Git.

## 31 octobre 2026 — huit évolutions approuvées et comparaison

L'utilisateur a confirmé l'enchaînement de huit lots distincts : comparaison,
aperçu du code, récupération du mot de passe et sessions, profils contrôlés,
annulation/suivi, import Git/pull requests, seuils qualité/CI, collaboration.
Chaque lot suit une branche et une PR vers staging, avec vérifications avant fusion.
Les lots autres que la comparaison ne sont pas décrits comme livrés à cette étape.

Lot comparaison, branche feat/analysis-comparison : endpoint authentifié de lecture,
sélection de deux analyses réussies dans l'historique sur plusieurs pages, page Vue
avec compteurs, écarts, couverture de fichiers, sens inversable et filtres existants.
Le calcul s'appuie exclusivement sur les rapports persistés, sans migration ou
réexécution du moteur. Les exports historiques restent identiques.

Le matching versionné conserve les occurrences multiples, privilégie les positions
exactes puis tolère les décalages de lignes dans chaque identité fichier/règle/
type/gravité/message. Les mêmes profils complets, moteurs et limites sont exigés.
L'interface précise qu'un diagnostic absent peut aussi provenir d'un fichier retiré
ou ignoré ; il ne s'agit pas d'une preuve de correction.

Vérifications locales réellement exécutées : pnpm check réussi (lint, typage,
builds, validation Prisma et 172 tests, dont 24 API et 85 frontend), 97 intégrations
sur PostgreSQL dédié codeaudit_comparison_test réussies et 10 parcours Chromium
réussis. Le nouveau parcours utilise ZIP, worker et deux rapports réels, sélection,
filtres, inversion, rechargement, erreurs 404 et exports inchangés, sur des largeurs
320/390/768/1440. Les intégrations refusent les comptes/projets étrangers, états
non réussis, profils/moteurs/limites différents, rapports malformés ou incohérents.

Difficulté corrigée : une fixture typée AnalysisReport n'était pas assignable au
type JSON Prisma ; l'altération de test passe désormais par une requête SQL
paramétrée sérialisant ce rapport, sans contourner le typage par any. Les contrôles
réussis ci-dessus ont suivi cette correction. Les traces sont dans .tmp/comparison-*.log.
Les correspondances restent heuristiques pour occurrences identiques et renommages ;
la pagination est côté navigateur. Les autres navigateurs/lecteurs d'écran restent
hors des vérifications exécutées.

## 31 octobre 2026 — aperçu facultatif du code, lot 2

Après fusion de la PR 7 avec CI verte, branche feat/code-context créée depuis
origin/staging. Migration 20261031000200_code_context appliquée sur les bases locale
et dédiée de test : consentement captureContext (false par défaut) et JSON codeContext
séparé du rapport. Le serveur local a été arrêté avant génération/migration.

L'import propose un consentement explicite. Le worker lit seulement des fenêtres
bornées autour des diagnostics, sans exécution, puis publie rapport et extraits
atomiquement avec les gardes de réservation existantes. Les fichiers temporaires
sont supprimés comme auparavant. Taille maximale, encodage, chemins traversants,
liens, positions, délai et interruption sont contrôlés. Les limites et la politique
de conservation ont été ajoutées à la spécification, au README et au guide d'analyse.

GET/DELETE context sont protégés par propriétaire et CSRF pour la suppression.
Le JSON enregistré est validé à la lecture. L'interface charge les extraits à la
demande, partage la requête entre lignes, colore du texte échappé et permet leur
suppression confirmée sans toucher aux diagnostics ou exports. Les comparaisons
ouvrent le contexte de la référence pour les résolus, de la cible pour les autres.

Résultats locaux réels : pnpm check réussi avec 185 tests (24 analyzer, 48 jobs,
24 API et 89 frontend). Après amélioration des séparateurs CR/LF/Unicode, passe
ciblée de 13 tests d'extraits réussie, dont 4 nouveaux : 189 cas unitaires/frontend
distincts exercés au total. Typage/build API relancés après optimisation des lectures ;
build jobs et lint final relancés. Les 103 tests d'intégration PostgreSQL réel et
11 parcours Chromium réussissent, dont opt-in, nettoyage, conservation/rechargement,
suppression, refus étrangers, CSRF, contexte corrompu et exports inchangés. Le parcours
inclut un faux élément HTML avec onerror : aucun élément img n'est créé et aucun
marqueur d'exécution n'apparaît dans window. Largeurs 320/390/1440 sans débordement.

Difficulté corrigée : ESLint exigeait une valeur par défaut pour la nouvelle prop
optionnelle analysisId ; le défaut undefined a été déclaré avant le contrôle réussi.
Les intégrations locales ont pris environ 345 secondes ; elles ont terminé avec
103 succès, sans présenter leur durée comme un résultat de performance garanti.
Traces dans .tmp/context-*.log. Coloration lexicale simple, extraits parfois tronqués,
absence d'aperçu pour les rapports antérieurs ou sans consentement ; aucun nouveau
contrôle Safari/Firefox/lecteur d'écran ni déploiement HTTPS n'est revendiqué.

## 31 octobre 2026 — récupération de compte et sessions, lot 3

Branche feat/account-recovery depuis origin/staging après fusion de la PR 8.
Migration 20261031000300_account_recovery exécutée sur PostgreSQL local et dédié
aux tests : UUID public de session et jeton de récupération condensé, unique par
compte, expirant en 15 minutes. Réinitialisation transactionnelle à usage unique,
scrypt et révocation des sessions. Révocation individuelle et globale protégée
par propriétaire et CSRF. Écrans Vue, erreurs, confirmations, routes publiques et
annulation des réponses obsolètes ajoutés sans stockage local de jetons.

Nodemailer 10.3.1 ajouté pour le transport SMTP réel ; Mailpit v1.33.0 facultatif
sur loopback pour les messages de développement et tests, sans relais externe.
Difficulté réellement observée : quatre tests de récupération échouaient faute
de message. Le TCP Docker s'ouvrait mais l'accueil SMTP attendait un reverse DNS.
Après désactivation documentée du reverse DNS dans Mailpit, l'envoi de diagnostic
SMTP réel a réussi. Aucun assouplissement TLS du transport de production.

Vérifications déjà terminées : pnpm check (198 cas), puis 96 tests Vue dont le
nouveau cas de navigation pendant une requête (199 cas distincts au total).
Lint et typage Vue finaux, builds, validation Prisma, configuration Compose et
pnpm audit --prod réussis. Les suites PostgreSQL et Chromium sont relancées après
la correction SMTP ; leurs résultats définitifs seront inscrits ci-dessous.
SMTP/TLS de production, délivrabilité, MFA et audit externe non vérifiés.

Résultats après correction SMTP : 111/111 tests d'intégration PostgreSQL réels
réussis (297 secondes). Première passe Chromium : 12 succès et un échec de
sélecteur ambigu entre chargement et confirmation ; même échec en CI, sans fusion.
Sélecteur précisé par son texte, puis suite Chromium complète : 13/13 réussis
(1,4 minute), dont récupération via vrai SMTP, ancien cookie refusé, révocation
d'un autre appareil puis de toutes les sessions. Traces .tmp/recovery-*.log.

## 31 octobre 2026 — profils de règles versionnés, lot 4

Branche feat/rule-profiles depuis origin/staging pendant la CI du lot 3, puis
intégration de staging190a640 après fusion de la PR 9 avec contrôles verts.
Conflit package.json résolu en conservant analyzer workspace et Nodemailer ;
installation avec lockfile figé réussie, sans nouveau package externe pour ce lot.

Registre immuable de deux profils : Essentiel préserve exactement les règles v1 ;
Strict renforce console, variables inutilisées, any explicite et avertit sur la
complexité/profondeur. Moteur toujours indépendant, aucun chargement de config du
projet, de plugin externe, ni correction. Choix projet via API protégée et Vue ;
version figée dans la transaction d'enqueue et transmise au thread. Publication
conditionnée au profil demandé, aucune substitution silencieuse. Migration
20261031000400_rule_profiles appliquée aux bases locale et dédiée aux tests.

pnpm check réussi : 205 tests (28 moteur, 52 jobs, 27 API, 98 frontend), lint,
types, builds, Prisma. Un avertissement de mise en forme Vue avait interrompu la
première passe ; corrigé avant la passe réussie. Cinq nouveaux tests ciblés
PostgreSQL réels réussis en 22 secondes : propriété/CSRF/validation, snapshot avant
exécution et exports inchangés, comparaison incompatible, profil inconnu refusé,
contrainte SQL et refus de publication incompatible. Suites complètes intégration
et Chromium lancées ; résultats définitifs à inscrire après exécution.

Résultats définitifs du lot 4 : 116/116 intégrations PostgreSQL réelles réussies
(317 secondes), 14/14 parcours Chromium réussis (1,8 minute), dont règles
strictes réelles et détail des règles déplié aux largeurs 320/390/1440. CI verte.
PR 10 fusionnée par squash sur staging8ee5e08 après revalidation pr-policy ;
branche feat/analysis-cancellation alignée par fast-forward sur ce staging.

## 31 octobre 2026 — annulation et suivi, lot 5

Migration 20261031000500_analysis_cancellation exécutée sur les deux bases.
CANCELLED est distinct de FAILED. Annulation atomique d'un travail en attente ;
drapeau d'arrêt sur RUNNING, heartbeat et publication SQL conditionnés à son
absence, terminaison du thread attendue avant acquittement. Reprise des demandes
abandonnées à expiration du bail, fencing des anciens workers, nettoyage des
sources annulées par la maintenance. Les rapports déjà terminés restent inchangés.
API propriétaire/CSRF, confirmation Vue au clavier, suivi différenciant demande
et arrêt confirmé, dates réelles du heartbeat/deadline et compteur dédié.

Vérifications terminées : typage, builds, lint, migrations ; première passe ciblée
PostgreSQL de six tests réussie en 18 secondes, dont interruption d'un vrai thread
et nettoyage. Un test frontend échouait car un beforeEach retournait implicitement
une fonction mock, interprétée comme cleanup par Vitest ; retour supprimé. Suite
frontend ensuite 104/104. pnpm check complet réussi avec 211 tests (28 analyzer,
52 jobs, 27 API, 104 Vue), lint/types/builds/Prisma. Ajout d'une septième intégration
répétant cinq fois la course réservation/annulation, puis lancement des suites
complètes PostgreSQL et Chromium ; résultats définitifs à inscrire après exécution.

Sept intégrations ciblées finales réussies (31 secondes), puis suite complète
PostgreSQL : 123/123 réussis (204 secondes). Première suite Chromium : 14 succès
et un échec dans le nouveau test, qui ciblait un tbody inexistant pour l'historique
rendu comme liste. Même échec en CI, aucune fusion. Sélecteur corrigé pour la
section d'historique réelle, avec réouverture de l'analyse depuis cette liste.
Suite Chromium complète relancée ; résultat définitif à consigner après exécution.
