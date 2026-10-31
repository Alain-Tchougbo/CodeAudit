# Historique et export JSON

L'historique d'un projet présente chaque demande, son identifiant, sa date, sa durée
lorsqu'elle est connue et son état. Le lien d'une analyse ouvre toujours son propre
rapport. Une nouvelle demande crée un autre identifiant et ne remplace aucun résultat.
Les rapports sont conservés après suppression des sources, jusqu'à suppression
explicite du projet selon la politique existante.

## Télécharger un rapport

Sur `/analyses/:id`, utiliser « Exporter le rapport JSON ». Le bouton est disponible
après SUCCEEDED. Le fichier contient le rapport entier, même lorsque les filtres ou
la pagination de l'écran ne montrent qu'une partie des diagnostics. Le navigateur
télécharge directement la réponse du serveur, sans recalcul ni sélection de champs.
Les erreurs de téléchargement restent affichées et permettent de réessayer.

```powershell
$analysisId = 'REMPLACER_PAR_UUID_ANALYSE'
# $http est la session obtenue dans docs/authentication.md
Invoke-WebRequest -UseBasicParsing -WebSession $http -OutFile rapport.json "http://127.0.0.1:3000/api/analyses/$analysisId/report"
```

`GET /api/analyses/:id/report` retourne `application/json`, `Cache-Control: no-store`
et un en-tête attachment avec le nom `codeaudit-analysis-<UUID>.json`.
L'endpoint `/results` existant continue de retourner uniquement le rapport du moteur.

## Contrat versionné

Le schéma JSON Schema draft-07 est versionné dans
`packages/contracts/schemas/report-export.v1.schema.json`, également accessible par
le sous-chemin `@codeaudit/contracts/schemas/report-export.v1.schema.json`.
Le contrat TypeScript public correspondant est `AnalysisExport`.

L'enveloppe contient :

- `schemaVersion: 1`, version du format d'export ;
- `project`, instantané des informations du projet, dates et provenance de capture ;
- `analysis`, identifiants, état SUCCEEDED, dates de demande/début/fin, durée de
  traitement en millisecondes, version du profil et erreur technique nulle ;
- `report`, copie intégrale du JSONB enregistré : sa propre schemaVersion, profil,
  versions exactes ESLint/TypeScript/typescript-eslint, règles, limites, dates du
  moteur, statistiques, diagnostics complets, fichiers et exclusions.

Les diagnostics gardent leurs positions nulles éventuelles, positions de fin,
gravités, messages, règles et nature syntaxique. La durée du moteur garde sa
précision décimale enregistrée ; celle du traitement est dérivée exclusivement des
horodatages persistés. Les versions actuelles des dépendances ne sont jamais
substituées aux versions historiques du rapport.

Le serveur valide le schéma avec Ajv et ajv-formats, sans conversion de types,
valeurs par défaut ni suppression de propriétés. Il contrôle aussi la cohérence
du projet, du profil, des statistiques de synthèse et de l'état avec le rapport.
Un document incohérent est refusé, jamais corrigé silencieusement.
Le contenu JSONB est préservé sémantiquement ; PostgreSQL ne conserve pas les espaces
ou l'ordre des clés d'un JSON initial. Deux exports d'une même analyse donnent les
mêmes valeurs : aucun timestamp de téléchargement n'est injecté.

## Informations historiques du projet

La migration `20261030000300_project_snapshots` ajoute `Analysis.projectSnapshot`.
Les nouvelles demandes capturent nom, description et dates dans la transaction
de création de l'analyse, avec `origin: ANALYSIS_REQUEST`. Un renommage ultérieur
du projet ne modifie ni cet instantané ni les anciens exports. Le détail de l'analyse
affiche cet instantané, tandis que le lien vers le projet ouvre sa fiche actuelle.

Pour les analyses déjà présentes, la migration reprend les informations disponibles
à son exécution et indique `origin: MIGRATION_BACKFILL` avec sa date de capture.
Elle ne prétend pas reconstituer un nom ou une description antérieurs qui n'avaient
jamais été enregistrés. Cette provenance apparaît aussi à l'écran.

## Erreurs

| Situation | HTTP | Code |
| --- | --- | --- |
| UUID invalide | 400 | VALIDATION_ERROR |
| Analyse absente | 404 | ANALYSIS_NOT_FOUND |
| QUEUED ou RUNNING | 409 | ANALYSIS_NOT_FINISHED |
| FAILED, aucun rapport du moteur disponible | 409 | ANALYSIS_FAILED |
| CANCELLED, arrêt demandé sans rapport publié | 409 | ANALYSIS_CANCELLED |
| Rapport ou métadonnées incomplets | 409 | REPORT_UNAVAILABLE |
| Schéma historique non pris en charge ou document mal formé | 409 | REPORT_SCHEMA_INVALID |
| Métadonnées et rapport divergents | 409 | REPORT_INCONSISTENT |

Les erreurs ne portent pas l'en-tête de pièce jointe. Les chemins de stockage, jetons
de worker et sources ne sont pas ajoutés à l'export.

## Vérifications

`pnpm check` couvre notamment le client HTTP, les états du bouton, le blocage des
doubles clics et l'annulation à la navigation. `pnpm test:integration` utilise une
base PostgreSQL dédiée pour vérifier conformité, égalité avec les données stockées,
conservation après nouvelle analyse/renommage, versions historiques, reprise de
migration et erreurs de données. `pnpm test:e2e` télécharge un vrai fichier produit
par l'API et le worker, compare son contenu à l'écran et à l'API, puis consulte de
nouveau l'ancien résultat après une nouvelle analyse.
