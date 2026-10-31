# Spécification MVP — CodeAudit

Statut : projets, moteur, import ZIP, file PostgreSQL et worker disponibles.
Le tableau de bord, le suivi et les filtres de diagnostics sont disponibles.
Le formulaire de lancement ZIP est disponible dans la fiche projet.

## Objectif et périmètre

Application d'audit statique JavaScript et TypeScript avec comptes et projets privés.
Le MVP couvre les projets, l'import ZIP, les analyses asynchrones, les résultats
détaillés, les indicateurs, l'historique et l'export JSON.
Pas d'intégration Git, de correction automatique,
d'exécution des sources ni d'installation des dépendances des projets importés.

## Architecture retenue

- pnpm workspaces, Node.js 24 ; versions résolues consignées dans pnpm-lock.yaml.
- apps/web : Vue 3, TypeScript, Vite, Vue Router, Tailwind CSS.
- apps/api : NestJS, TypeScript, validation HTTP et orchestration métier.
- apps/worker : processus distinct pour les analyses ; ne sert pas de requêtes HTTP.
- packages/analyzer : moteur ESLint indépendant de NestJS et Prisma.
- packages/contracts : contrats publics, sans modèle Prisma exposé au navigateur.
- packages/database : PostgreSQL, Prisma et migrations versionnées.
- packages/analysis-jobs : import ZIP sécurisé, stockage temporaire et file partagée.
- packages/config : configuration TypeScript commune.
- Jest/Supertest pour l'API ; Vitest/Vue Test Utils pour le frontend ;
  Vitest pour le futur moteur ; Playwright pour les parcours navigateur.
- Docker Compose fournit PostgreSQL ; GitHub Actions vérifie le socle.

Flux : navigateur → API → PostgreSQL (travaux) → worker → rapports persistés.
Les archives sont déposées sur un espace temporaire partagé entre API et worker
sur la même machine. Aucun chemin arbitraire fourni par le navigateur n'est accepté.
Un répertoire de travail distinct est réservé à chaque analyse.

## Modèle et états prévus

User : profil, adresse unique normalisée, hash scrypt ; sessions persistées et quotas.
Project : identifiant, nom, description, dates et propriétaire ; anciens projets
non attribués invisibles. Voir docs/authentication.md pour les contrôles et la migration.
Analysis : projet, état, horodatages, empreinte des sources, profil et versions
du moteur, compteurs, erreur technique, réservation et référence temporaire.
Les diagnostics sont inclus dans le rapport JSONB de l'analyse : chemin relatif,
ligne et colonne facultatives, règle nullable, gravité, message et erreur de parsing.
Les nouvelles tentatives ont des identifiants distincts, sans lien dédié en MVP.

États : QUEUED → RUNNING → SUCCEEDED ou FAILED.
Une analyse terminée avec des problèmes de code est SUCCEEDED.
Une erreur de syntaxe est un diagnostic ; un délai dépassé ou un crash est un échec technique.
Une nouvelle tentative produit une nouvelle analyse ; les résultats terminaux sont immuables.
Les diagnostics ne sont publiés qu'avec la finalisation transactionnelle du rapport.
Aucun fichier pris en charge : rejet avant création d'un travail exécutable.

La file utilise une réservation atomique PostgreSQL, une durée de réservation,
un heartbeat et un jeton de propriété. Un worker ayant perdu sa réservation ne peut
plus finaliser le rapport. Une réservation expirée devient FAILED avec un code explicite ;
la reprise utilisateur crée une nouvelle tentative. Pas de relance automatique en MVP.
La concurrence initiale est de 1.
La file et ces garanties sont implémentées et testées avec PostgreSQL réel.

## Import, analyse et limites

Valeurs initiales, à mesurer avant ajustement :
- archive : 10 Mio maximum, y compris contrôle du flux reçu ;
- contenu décompressé cumulé : 50 Mio maximum ;
- entrées de l'archive : 2 000 maximum ;
- fichier individuel : 5 Mio maximum après décompression ;
- extraction et analyse : 60 secondes chacune ;
- processus d'analyse : limite mémoire cible de 512 Mio.

La limite mémoire doit être imposée par l'environnement d'exécution ; une option
de heap Node seule n'est pas une limite globale. Le mécanisme dépendra de l'OS cible.
Refuser chemins absolus, chemins sortant du répertoire après normalisation,
liens symboliques, entrées chiffrées et doublons de chemins normalisés.
Contrôler les tailles réellement lues, sans se fier uniquement aux métadonnées ZIP.
Ne pas extraire récursivement les archives imbriquées.
Ignorer node_modules, .git, dist, build, coverage et fichiers binaires.
Extensions : .js, .jsx, .ts, .tsx, .mjs, .cjs, .mts, .cts.

Profil codeaudit-js-ts-v1, configuration détenue par CodeAudit :
règles JS/TS sans informations de types en MVP, plugins approuvés uniquement.
Ne jamais charger la configuration ESLint, les plugins, les scripts ou les dépendances
du projet importé ; ne jamais exécuter ses sources. Désactiver l'auto-détection
de configuration et l'autofix. Les fichiers restent inchangés.
Le manifeste du profil, les paramètres effectifs et les versions exactes seront enregistrés.
Le profil est implémenté dans packages/analyzer avec un moteur indépendant, des
fixtures et des tests. Voir packages/analyzer/README.md pour les règles et les limites.

## Sources et rapports

Racine temporaire dédiée .tmp/imports, exclue de Git ; sous-répertoire créé côté
serveur avec un identifiant aléatoire, jamais choisi par le client.
Permissions limitées à l'utilisateur du service, sans accès réseau pour le processus
d'analyse lorsque le mécanisme d'isolation le permet.
Suppression après succès, échec, dépassement de délai et rejet d'import.
Avant suppression récursive, vérifier le chemin absolu et son appartenance à la
racine temporaire ; aucun lien ne doit permettre d'en sortir.
Au redémarrage, réconcilier les travaux interrompus puis supprimer les répertoires
orphelins âgés de plus de 24 heures. Un nettoyage échoué est journalisé et retenté.
Ces protections sont implémentées dans packages/analysis-jobs ; détails et limites
effectives dans [l'exécution des analyses](analyses.md). Les threads ont des limites
V8 mais aucune limite RSS globale ni isolation réseau n'est imposée actuellement.

Ne pas persister les sources dans PostgreSQL ni les inclure dans les logs et exports.
Les rapports et métadonnées restent jusqu'à suppression explicite.
Supprimer un projet entraîne la suppression transactionnelle de ses rapports ;
refuser cette opération tant qu'un travail est QUEUED ou RUNNING.
Une nouvelle analyse nécessite un nouvel import après suppression des sources.

## API et interface

Routes disponibles sous /api :
- POST/GET /projects ; GET/PATCH/DELETE /projects/:id ;
- POST /projects/:id/analyses (ZIP), GET /projects/:id/analyses ;
- GET /analyses/:id ; GET /analyses/:id/results (rapport du moteur, SUCCEEDED uniquement).
- GET /analyses/:id/report (export JSON versionné avec instantané du projet).
- GET /dashboard (compteurs réels et dix dernières analyses).
Les filtres de diagnostics et leur pagination sont disponibles côté navigateur.
Un endpoint de filtrage/pagination serveur reste à développer. Le rapport complet
est téléchargeable en JSON ; les instantanés historiques sont décrits dans docs/report-export.md.

GET /health indique que le processus HTTP répond
et ne garantit pas l'accès à PostgreSQL. Vite transmet /api/health à /health en local.
États d'écran : vide, chargement, succès, absence de problèmes et erreur.
Indicateurs : fichiers analysés/ignorés, erreurs, avertissements, fichiers concernés,
durée. Pas de score global non défini.
Export : schemaVersion, métadonnées, profil/moteur, indicateurs et diagnostics.
Erreurs API : code stable, message lisible, identifiant de requête ; aucune stack exposée.

## Lots et critères d'acceptation futurs

1. Socle : installation figée, lint, typage, builds, tests de démarrage, documentation.
2. Projets/persistance : migrations reproductibles sur PostgreSQL vide, validation des
   entrées, CRUD et erreurs 404, politique de suppression ; tests Supertest avec vraie base isolée.
3. Moteur : fixtures JS/TS propres et fautives, positions/règles/gravités attendues,
   parsing invalide, extensions et exclusions, déterminisme du profil, zéro exécution importée.
4. Imports/worker : cas ZIP dangereux, tailles réelles, timeout, nettoyage,
   concurrence, crash, réservations expirées, finalisation unique et indisponibilité de la base.
5. Interface : navigation clavier, projets, lancement, suivi, filtres, pagination,
   historique durable ; tests de composants et parcours Playwright.
6. Export : validation du schéma JSON, compteurs cohérents, export refusé si inachevé,
   vérification complète import → analyse → résultats → export.

Les tests du moteur, de l'import et de l'exécution complètent ceux du socle.
Les garanties couvertes et les limites sont détaillées dans docs/analyses.md.

## Références techniques consultées

- https://eslint.org/docs/latest/integrate/nodejs-api
- https://typescript-eslint.io/getting-started/typed-linting/
- https://vite.dev/guide/
- https://tailwindcss.com/docs/installation/using-vite
- https://www.prisma.io/docs/orm/v7/reference/prisma-config-reference
