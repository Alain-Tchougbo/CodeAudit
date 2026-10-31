# Exécution des analyses

## Aperçu facultatif du code

POST /api/projects/:id/analyses accepte le champ multipart captureContext=true ou
false en plus du ZIP. Par défaut false. Les autres champs sont refusés. Le worker
enregistre les extraits avec le rapport avant le nettoyage des sources ; la migration
20261031000200_code_context ajoute captureContext et codeContext dans Analysis.
Les rapports existants restent sans extraits et leurs exports JSON ne changent pas.

GET /api/analyses/:id/context retourne requested et context après une réussite.
DELETE /api/analyses/:id/context supprime tous les extraits de cette analyse et
retourne 204, sans modifier son rapport. Les deux routes contrôlent le propriétaire ;
la suppression exige CSRF et est refusée pendant un travail actif. Un contexte
corrompu est refusé par validation de schéma et de taille.

Capture : au plus les 100 premiers diagnostics positionnés, rayon de trois lignes,
128 Kio lus par fichier, 2 Mio lus au total, lignes de 500 caractères et enveloppe
JSON de 128 Kio maximum. Les lignes communes sont fusionnées. Les chemins traversants,
absolus et symboliques sont refusés. Aucune source n'est exécutée ; l'aperçu effectue
seulement des lectures bornées. L'interface indique les extraits tronqués ou absents.
Les délais et annulations du traitement restent applicables.

Le consentement signale que les extraits peuvent contenir des informations sensibles.
Ils suivent la conservation du rapport jusqu'à suppression explicite ou suppression
du projet. Les fichiers sources temporaires restent supprimés après traitement.
Le frontend charge les extraits à la demande, partage la requête entre les diagnostics
affichés, échappe le texte et propose une coloration lexicale JS/TS simple (pas un
parseur complet). Aucune requête ne relit un chemin source arbitraire après traitement.

## Comparaison des rapports enregistrés

GET /api/analyses/:targetId/comparison?baselineId=UUID exige une session. Les deux
analyses sont recherchées avec le propriétaire connecté avant tout autre contrôle.
Une ressource absente ou étrangère renvoie 404. Identifiants invalides, analyses
identiques ou projets différents donnent 400 ; analyses non réussies, rapports
invalides/incohérents ou configurations différentes donnent 409.

La réponse schemaVersion=1 et matchingVersion=file-rule-message-v1 comprend les
références des deux analyses, diagnostics ajoutés/résolus/persistants, positions
avant/après, compteurs et écarts cible moins référence. Les ensembles de fichiers
nouvellement analysés et plus analysés expliquent les changements de couverture.
Le calcul ne relance pas le moteur, n'écrit rien en base et n'utilise pas de sources.
Les exports d'origine restent inchangés. Aucune migration n'est nécessaire.

Le même profil complet (versions des moteurs comprises) et les mêmes limites
sont exigés. Le rapprochement utilise fichier/règle/type/gravité/message. Il conserve
la multiplicité, apparie d'abord les positions de début exactes, puis les occurrences
restantes ordonnées par ligne/colonne. Il tolère les décalages de lignes, sans suivre
les renommages. Un changement de message, règle, type ou gravité apparaît comme
une disparition et un ajout. Les correspondances entre occurrences identiques
restent heuristiques, sans preuve d'identité du code.

« Résolu » signifie absent du rapport cible : une suppression ou exclusion de fichier
peut aussi produire ce résultat. Les positions des résolus viennent de la référence,
celles des nouveaux/persistants de la cible. Les diagnostics complets sont renvoyés
et filtrés/paginés dans le navigateur, comme les résultats actuels ; une pagination
serveur reste une évolution pour les gros rapports. Les limites de taille des rapports
de chaque analyse s'appliquent toujours.

L'API importe un ZIP, valide et extrait ses sources avant de créer un travail
QUEUED dans PostgreSQL. Le worker est un processus indépendant. Les règles et le
moteur restent dans `packages/analyzer`, sans dépendance envers la file ni Prisma.
`packages/analysis-jobs` contient le stockage, l'import sécurisé et la file partagés
entre l'API et le worker.

## Démarrage et utilisation

```powershell
pnpm install --frozen-lockfile
pnpm db:up
pnpm db:migrate
pnpm dev
```

`pnpm dev` lance l'API, Vue et le worker. Pour lancer le worker compilé seul :
`pnpm build`, puis `pnpm --filter @codeaudit/worker start`.
L'API et tous les workers doivent utiliser la même base et le même répertoire
local de sources, accessible au même utilisateur système. Par défaut :
`.tmp/imports` à la racine du dépôt. Surcharge : variable d'environnement du terminal
`CODEAUDIT_STORAGE_ROOT`, chemin absolu ou relatif à la racine du dépôt.
Ce n'est pas un déploiement distribué sur plusieurs machines.

| Méthode | Endpoint | Comportement |
| --- | --- | --- |
| POST | `/api/projects/:projectId/analyses` | Champ multipart `archive`, réponse 202 avec identifiant et état QUEUED |
| GET | `/api/analyses/:id` | État, dates, compteurs et erreur technique éventuelle |
| GET | `/api/projects/:projectId/analyses?limit=50&cursor=UUID` | Historique décroissant, `items` et `nextCursor` ; limite 1 à 100 |
| GET | `/api/analyses/:id/results` | Rapport JSON complet, uniquement après SUCCEEDED ; sinon 409 |

Exemple avec un projet déjà créé, depuis PowerShell :
se connecter d'abord selon [le guide d'authentification](authentication.md) pour
obtenir `$http`, `$cookieHeader` et `$csrfToken`. Un appel anonyme retourne 401.

```powershell
$projectId = 'REMPLACER_PAR_UUID_PROJET'
$queued = curl.exe --fail-with-body -s -H "Cookie: $cookieHeader" -H 'X-CodeAudit-Request: 1' -H "X-CSRF-Token: $csrfToken" -F 'archive=@C:/sources/projet.zip' "http://127.0.0.1:3000/api/projects/$projectId/analyses" | ConvertFrom-Json
Invoke-RestMethod "http://127.0.0.1:3000/api/analyses/$($queued.id)" -WebSession $http
Invoke-RestMethod "http://127.0.0.1:3000/api/projects/$projectId/analyses" -WebSession $http
# Après passage à SUCCEEDED :
Invoke-WebRequest -UseBasicParsing -WebSession $http -OutFile rapport.json "http://127.0.0.1:3000/api/analyses/$($queued.id)/results"
```

Les UUID invalides, archives absentes ou dangereuses sont rejetés ; ressource
inexistante : 404 ; limite de taille : 413 ; deux extractions déjà en cours dans
une instance API : 429. Le nom et le type MIME fournis ne sont pas considérés
comme une preuve de validité du ZIP. Les chemins internes et jetons de réservation
ne sont pas exposés. Le tableau de bord, le suivi, l'historique et les résultats
sont consultables dans Vue ; le formulaire ZIP de chaque projet lance une demande réelle.
Voir [les interfaces de consultation](consultation.md).

## File, concurrence et interruption

États : `QUEUED → RUNNING → SUCCEEDED | FAILED`, ou `CANCELLED` sur demande.
Des diagnostics ESLint, y compris erreurs de syntaxe, donnent SUCCEEDED lorsque
le moteur a produit un rapport. FAILED signifie un échec technique.

La réservation utilise une seule instruction SQL avec CTE, verrou de ligne
`FOR UPDATE SKIP LOCKED` et mise à jour conditionnelle de QUEUED vers RUNNING.
Chaque réservation reçoit un jeton UUID unique. Un worker traite un travail à
la fois ; plusieurs processus peuvent prendre des travaux différents.
Le bail dure 15 secondes, renouvelé toutes les 5 secondes, sans dépasser le délai
maximal de l'analyse. Le temps de validité est contrôlé côté PostgreSQL.
Le rapport, le profil, les compteurs et SUCCEEDED sont publiés atomiquement,
uniquement si le jeton, l'état et les échéances sont encore valides.

Un ancien worker ne peut ni renouveler un bail expiré ni publier tardivement.
Au démarrage puis entre les travaux, avec un intervalle minimal de 5 secondes,
les RUNNING expirés deviennent FAILED (CANCELLED si une annulation était demandée)
avec WORKER_INTERRUPTED ou ANALYSIS_TIMEOUT. Ils ne sont jamais remis en QUEUED :
un même identifiant n'est donc jamais exécuté par deux workers, même si le premier
processus reprend après une pause. Les QUEUED persistés sont traités au redémarrage.
Une nouvelle tentative exige un nouvel import et crée un nouvel identifiant.

Extraction et analyse tournent dans des `worker_threads` contrôlés. Timeout ou
SIGINT/SIGTERM demandent leur arrêt ; la terminaison effective est attendue avant
la finalisation et le nettoyage. L'arrêt brutal du processus arrête aussi ses threads.
Après indisponibilité de PostgreSQL, le worker retente sa boucle ; une réservation
qui n'a pas pu être finalisée sera réconciliée après expiration.

## Protection des sources

| Limite | Valeur |
| --- | --- |
| ZIP reçu | 10 Mio, flux multipart borné |
| Entrées ZIP et fichiers/dossiers matérialisés | 2 000 maximum chacun, dossiers implicites inclus |
| Un fichier décompressé | 5 Mio |
| Total réellement décompressé | 50 Mio |
| Profondeur / longueur d'un chemin | 32 segments / 1 024 caractères |
| Extraction / analyse | 60 secondes chacune |
| Rapport JSON | 10 Mio |

Chemins absolus, traversées, séparateurs Windows, noms de périphériques, liens
symboliques, fichiers spéciaux, doublons après normalisation Unicode/casse et
conflits fichier/dossier sont refusés. Les fichiers sont créés exclusivement dans
un répertoire UUID généré côté serveur. Le stockage refuse les liens sur les
répertoires de travail et vérifie leur appartenance avant toute suppression.
Chiffrement et méthodes autres que ZIP stocké/deflate sont refusés. Les tailles
déclarées et réellement lues ainsi que les CRC sont contrôlés. Les ZIP imbriqués
ne sont jamais extraits récursivement. Même les fichiers ignorés par ESLint
comptent dans les limites de l'import.

Aucun `npm install`, script du projet, import de son code ou chargement de sa
configuration ESLint n'est lancé. Seuls le moteur, les règles et les plugins
installés et contrôlés par CodeAudit sont utilisés. Aucun autofix.

Les limites V8 des threads sont 384 Mio pour l'ancienne génération, 64 Mio pour
la jeune génération et 4 Mio de pile. Elles ne bornent pas la mémoire RSS totale.
Les threads ne constituent pas une isolation système ni une interdiction réseau.
Une limite mémoire globale ou une isolation OS renforcée nécessiterait un
conteneur/cgroup ou un mécanisme équivalent ; ce mécanisme n'est pas implémenté ici.

## Suppression et conservation

Les sources sont supprimées après rejet, réussite ou échec, une fois le calcul
arrêté. En cas d'échec de suppression d'un travail terminé, sa référence reste
en base pour permettre une nouvelle tentative ; le worker journalise les échecs
persistants lors de la maintenance. Les répertoires UUID non référencés et âgés
de plus de 24 heures sont nettoyés par la maintenance. Ce délai protège notamment
un import dont le travail n'est pas encore enregistré.

Les rapports et métadonnées restent en PostgreSQL jusqu'à suppression explicite
du projet. Cette suppression est refusée lorsqu'une analyse est QUEUED ou RUNNING.
Une erreur de nettoyage ne supprime ni ne modifie un rapport terminé. Les sources
ne sont pas enregistrées en base ni ajoutées au rapport JSON.

Migration versionnée : `20261030000200_analysis_execution`. Elle ajoute les
horodatages, baux, jetons, références temporaires, rapports JSONB et index de file.

## Vérifications reproductibles

```powershell
pnpm check
# Tests ciblés après compilation des packages partagés :
pnpm build:packages
pnpm --filter @codeaudit/analysis-jobs test
# PostgreSQL dédié, nom de base terminé par _test ; migrations appliquées :
$env:TEST_DATABASE_URL = 'postgresql://codeaudit:codeaudit@127.0.0.1:5432/codeaudit_test?schema=public'
pnpm test:integration
```

Les tests ZIP utilisent de vraies archives, dont tailles mensongères, CRC invalides,
liens, collisions, traversées et dépassements. Les tests de threads exercent
timeout, crash et interruption réels. Les tests Supertest/Prisma utilisent deux
connexions PostgreSQL pour les réservations concurrentes, vérifient les anciens
jetons, les résultats et le nettoyage. Un test démarre un vrai processus worker,
le tue brutalement et démarre son remplaçant. Il avance ensuite l'expiration du
bail en base pour éviter d'attendre 15 secondes. Les défaillances de nettoyage
sont injectées ; il ne s'agit pas d'une panne physique du disque.

## Bilan de vérification de cette implémentation

Vérifications exécutées localement sous Windows, Node 24.15 et PostgreSQL 17 réel :

| Commande | Résultat |
| --- | --- |
| `pnpm install --frozen-lockfile` | Réussite, lockfile à jour |
| `pnpm check` | Lint, typage, builds et validation Prisma réussis ; 83 tests réussis |
| `pnpm test:integration` | 44 tests réussis : 15 exécution/import et 29 projets |
| `pnpm db:check` sur la base de test | Connexion réussie et aucune dérive du schéma |

Les 83 tests comprennent 24 tests analyzer, 16 frontend, 34 sécurité/threads/stockage
et 9 tests API unitaires. La migration d'exécution a été appliquée à la base locale
et à la base de test dédiée. La première passe a révélé une conversion SQL manquante
pour les durées du bail et une course sur les erreurs de flux ZIP : ces défauts ont
été corrigés avant les passes finales réussies. Les tests navigateur Playwright
n'ont pas été relancés pour ce lot. L'avertissement Node sur les VM Modules
expérimentaux de Jest/Prisma reste présent, sans échec de test.
