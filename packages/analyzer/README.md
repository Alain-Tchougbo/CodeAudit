# @codeaudit/analyzer

Moteur indépendant de NestJS et Prisma. Il lit un répertoire de sources JS/TS,
analyse chaque fichier avec ESLint et retourne un objet JSON sérialisable.
Il n'exécute pas les sources et ne corrige aucun fichier.

## Utilisation

Depuis un consommateur TypeScript, dans une fonction async :

```ts
import { analyzeProject, AnalysisError } from '@codeaudit/analyzer';

const abortController = new AbortController();

try {
  const report = await analyzeProject('/chemin/vers/des/sources-isolees', {
    signal: abortController.signal,
    limits: { maxEntries: 2000, maxDurationMs: 60_000 },
  });
  // report.issues, report.files, report.ignoredEntries, report.statistics
} catch (error) {
  if (error instanceof AnalysisError) {
    // error.code distingue annulation, limite et erreur technique.
  }
}
```

Formats : .js, .jsx, .ts, .tsx, .mjs, .cjs, .mts, .cts (extension sans distinction
de casse). Les .cjs/.cts sont analysés en CommonJS ; les autres en modules.
Le type de module indiqué dans package.json n'est pas chargé.

## Profil codeaudit-js-ts-v1

ECMAScript 2024 ; syntaxe TypeScript 5.9.3 ; JSX/TSX activés.
ESLint 10.13.0 et typescript-eslint 8.72.1 sont des dépendances directes fixes.
Le manifeste du rapport contient aussi les versions réellement chargées,
les options de chaque règle, les globals et les exclusions.

| Règle | Gravité / portée |
| --- | --- |
| eqeqeq, option always | Erreur JS/TS |
| no-debugger | Erreur JS/TS |
| no-unreachable | Erreur JS/TS |
| no-dupe-args | Erreur JS/TS |
| no-duplicate-case | Erreur JS/TS |
| valid-typeof | Erreur JS/TS |
| no-constant-condition, checkLoops:false | Erreur JS/TS |
| no-undef | Erreur JS seulement |
| no-console | Avertissement JS/TS |
| prefer-const | Avertissement JS/TS |
| no-unused-vars | Avertissement JS |
| @typescript-eslint/no-unused-vars | Avertissement TS |
| @typescript-eslint/no-explicit-any | Avertissement TS |

Les variables et arguments préfixés par _ sont tolérés ; les paramètres sont
contrôlés après le dernier paramètre utilisé. Les variables catch sont contrôlées,
avec la même tolérance _. Les frères d'une déstructuration rest sont ignorés.
Une règle interne codeaudit/jsx-uses-vars marque les composants JSX comme utilisés,
sans produire de diagnostic ni transformer le code. Elle ne constitue pas une
analyse React ou d'un autre framework.

Le profil déclare une liste fixe de globals usuels Node et navigateur. Il ne
déduit pas l'environnement réel du projet. La liste exacte figure dans le manifeste.
Toute évolution du comportement ou des versions du moteur doit faire évoluer le profil.

## Isolation

- overrideConfigFile:true : aucune recherche de configuration ESLint.
- Les plugins sont importés depuis les dépendances du moteur seulement.
- Chaque source est transmise par lintText avec un nom virtuel contrôlé ; le parser
  ne reçoit jamais les chemins réels du projet.
- allowInlineConfig:false : les commentaires ne peuvent ni désactiver des règles,
  ni déclarer des globals ou des règles supplémentaires.
- project:false et projectService:false : pas de tsconfig ni de programme de types.
- Pas de configuration .eslintignore/.gitignore importée et pas de package.json,
  de script, de plugin ou de dépendance importés exécutés.
- fix:false, aucun appel à outputFixes ; pas de source ou de correction dans le rapport.
- Les liens symboliques rencontrés sont ignorés ; une racine directement symbolique
  est refusée. Les fichiers doivent rester immuables pendant l'analyse.

## Rapport et statistiques

schemaVersion:1 ; dates ISO, durée en millisecondes ; chemins relatifs avec séparateurs /.
Un diagnostic contient filePath, severity (error/warning), ruleId nullable,
message, line/column et endLine/endColumn nullables, kind (lint/syntax).
Les positions sont à base 1 ; les positions de fin sont celles d'ESLint.
Les erreurs de syntaxe ont généralement ruleId:null et comptent parmi les erreurs,
sans provoquer un échec technique ni empêcher l'analyse du fichier suivant.

files contient les compteurs par fichier, y compris les fichiers propres.
statistics contient fichiers découverts/pris en charge/analysés/concernés,
entrées ignorées, erreurs, avertissements, total de diagnostics, erreurs de syntaxe,
octets lus et durée. syntaxErrorCount est un sous-ensemble de errorCount.

Les répertoires node_modules, .git, dist, build et coverage sont ignorés à toute
profondeur, sans parcourir leur contenu. Une entrée directory représente tout le
répertoire ; le moteur ne prétend pas compter ses fichiers descendants.
Les formats non pris en charge, fichiers binaires, UTF-8 invalide, liens et fichiers
non réguliers ont un motif d'exclusion explicite. Les octets des sources binaires
ou invalides déjà lus sont inclus dans bytesRead.
L'ordre des fichiers et exclusions est stable ; les diagnostics suivent l'ordre ESLint.

## Erreurs et limites

Par défaut : 2 000 entrées, 5 Mio par fichier, 50 Mio de sources lues, 60 secondes.
Les tailles sont contrôlées sur les octets lus, avec un buffer borné.
Les limites sont configurables par le consommateur de confiance ; le buffer par
fichier ne peut pas dépasser 50 Mio.

AnalysisError.code : INVALID_ROOT, INVALID_OPTIONS, FILE_READ_FAILED,
LIMIT_EXCEEDED, NO_SUPPORTED_FILES, CANCELLED, ESLINT_FAILURE.
Un rapport n'est retourné qu'après une analyse complète. Une erreur technique ne
doit pas être transformée en succès avec zéro problème.
Si toutes les sources sont ignorées ou non prises en charge, NO_SUPPORTED_FILES
est renvoyé.

La durée et AbortSignal sont vérifiés entre les opérations ; ils n'interrompent
pas un parsing ESLint synchrone en cours. Le worker impose maintenant un délai
avec terminaison effective d'un worker_thread et des limites V8. Le moteur ne garantit pas à lui seul un
plafond mémoire global ou une isolation face aux modifications concurrentes du disque.

Pas de vérification sémantique TypeScript, de résolution des imports, de règles de
framework, d'analyse de sécurité exhaustive, de détection de secrets ou de dépendances
vulnérables. Certaines constructions récentes hors ECMAScript 2024 peuvent être
signalées comme syntaxe invalide. Un résultat sans problème ne certifie pas la qualité
ou l'absence de défauts. Le package est branché au worker ; l'API importe et met
en file les demandes. Les règles ne certifient pas une application sûre en production.

## Vérification

```sh
pnpm --filter @codeaudit/analyzer typecheck
pnpm --filter @codeaudit/analyzer lint
pnpm --filter @codeaudit/analyzer test
pnpm --filter @codeaudit/analyzer build
pnpm check
```

Cinq fixtures sont présentes dans test/fixtures : clean, errors, warnings, syntax,
ignored. Les tests exécutent réellement ESLint, et contrôlent aussi l'isolation,
les fichiers binaires, les liens, les limites et l'absence de correction.
Les fixtures intentionnellement fautives sont exclues du lint du dépôt.

## Résultats des fixtures

Vérification du 30 octobre 2026 : 24 tests analyzer réussis avec le vrai ESLint.

| Fixture | Fichiers analysés | Erreurs | Avertissements | Syntaxe |
| --- | ---: | ---: | ---: | ---: |
| clean | 8 | 0 | 0 | 0 |
| errors | 2 | 4 | 0 | 0 |
| warnings | 2 | 0 | 5 | 0 |
| syntax | 2 | 2 | 0 | 2 |
| ignored | 1 | 0 | 0 | 0 |

ignored exclut build/ (un répertoire, contenu non parcouru) et notes.txt
(un fichier au format non pris en charge). Les erreurs de syntaxe sont déjà
comptées dans la colonne Erreurs.
