# Module projets

Implémentation du 30 octobre 2026.

Mise à jour du 31 octobre : les routes ci-dessous nécessitent une session et ne
retournent que les projets du compte connecté. Le modèle inclut désormais ownerId ;
les anciens projets non affectés restent privés et inaccessibles aux nouveaux
inscrits. Voir [authentification et migration](authentication.md). Les résultats
chiffrés en fin de document décrivent le lot historique du 30 octobre ; les nouveaux
contrôles sont consignés dans [le journal](experiment-log.md).

## Périmètre

CRUD réel NestJS / Prisma / PostgreSQL et écrans Vue :
/projects, /projects/new, /projects/:id et /projects/:id/edit.
L'ancienne page d'accueil est remplacée par une redirection vers /projects.

Les écrans affichent les réponses du backend, le chargement, la liste vide,
les erreurs avec nouvelle tentative, et les confirmations de succès.
Le formulaire est désactivé pendant l'enregistrement ; la suppression demande
une confirmation. Les anciennes réponses annulées ne remplacent pas un autre projet.

## Contrats et intégrité

Project : UUID, nom obligatoire (varchar 120), description nullable (varchar 2000),
dates de création et de modification avec fuseau.
Index sur createdAt/id pour l'ordre de liste.
Une contrainte CHECK SQL interdit les noms vides ou non normalisés.

Analysis : UUID, projectId obligatoire, clé étrangère ON DELETE CASCADE,
statut enum et date de création ; index projectId/status.
Il s'agit du socle relationnel des analyses futures, sans API ni worker d'analyse.

Les DTO valident les types, longueurs, champs inconnus et chaînes normalisées.
PATCH distingue l'absence d'un champ de null pour effacer la description ;
name:null et un corps vide sont refusés.
Les noms identiques restent autorisés.

La suppression vérifie l'existence et les analyses actives en transaction
SERIALIZABLE. QUEUED/RUNNING entraîne 409 PROJECT_BUSY.
Les conflits de sérialisation sont réessayés au maximum trois fois avant 409.
Les futures écritures d'analyses devront respecter les mêmes invariants de concurrence.

Les erreurs publiques ont statusCode, code, message, requestId et éventuellement
details. Les erreurs internes et les secrets de connexion ne sont pas exposés.
La santé /health indique que le processus répond ; elle n'est pas un rapport d'analyse.

## Migration

20261030000100_projects/migration.sql crée les tables, enum, index et clé étrangère,
puis la contrainte CHECK du nom. Elle est versionnée avec migration_lock.toml.
La migration a été appliquée à la base de développement et à une base de tests
isolée ; Prisma n'a détecté aucune dérive du schéma.

Sur ce poste, le port 5432 étant occupé, PostgreSQL de développement écoute sur
127.0.0.1:32770. Le .env local ignoré par Git contient ce port et DATABASE_URL.
Les autres services existants n'ont pas été modifiés.

## Tests

Les tests backend couvrent validation, CRUD, erreurs 400/404, suppression 409,
cascade et contraintes PostgreSQL. Les tests frontend couvrent les données
reçues, les formulaires, les erreurs, les transitions de route, les annulations
et les confirmations. Playwright exerce le CRUD complet sur une API réelle.

Les résultats finaux sont consignés dans la section suivante après exécution.

## Résultats réels du 30 octobre 2026

| Vérification finale | Résultat |
| --- | --- |
| pnpm install --frozen-lockfile | Réussite |
| pnpm check | Réussite : lint, TypeScript, builds et validation Prisma |
| Tests Jest backend, via pnpm test | 9 réussis |
| Tests Vitest frontend, via pnpm test | 16 réussis |
| pnpm test:integration / script API équivalent | 29 tests Supertest/PostgreSQL réussis après correction du lanceur Jest |
| pnpm test:e2e | 2 parcours Chromium réussis, avec API et frontend temporaires réels |
| pnpm db:migrate | Migration appliquée en développement et sur la base de tests |
| pnpm db:check et migrate diff | Connexion valide et aucune dérive après migration |
| docker compose config --quiet | Réussite |
| actionlint .github/workflows/ci.yml | Réussite ; aucune exécution GitHub Actions effectuée |

Le parcours navigateur crée un projet, le retrouve après rechargement, vérifie sa
persistance via l'API, le modifie, le retrouve dans la liste, puis le supprime et
vérifie le 404. Un second parcours couvre une ressource absente depuis une URL directe.
Aucun mock réseau n'est utilisé dans ces parcours.

Corrections issues des contrôles : exports ESM/CommonJS des contrats partagés,
tâches pnpm séquentielles après une erreur mémoire, option VM Modules pour les
imports dynamiques de Prisma dans Jest. Un redémarrage Docker a interrompu une
première relance d'intégration ; les conteneurs ont été redémarrés et les 29 tests
ont ensuite réussi. Le lanceur Jest affiche l'avertissement expérimental Node
associé à --experimental-vm-modules.

Les journaux locaux ignorés par Git sont dans .tmp/projects-check.log,
.tmp/projects-integration.log et .tmp/projects-e2e.log.
La base de tests isolée est supprimée après validation ; la base de développement
et son volume sont conservés pour l'utilisation de l'application.
Les modèles de rapports, l'import et l'exécution des analyses restent hors de ce lot.
