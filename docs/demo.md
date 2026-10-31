# Tester CodeAudit avec un vrai projet

Ce parcours utilise les sources non modifiées d'**Express 5.1.0**, un projet
JavaScript public sous licence MIT. Il vérifie le fonctionnement réel de
CodeAudit : navigateur → API → PostgreSQL → worker → rapport enregistré.
Il ne lance pas Express et n'installe aucune de ses dépendances.

Pour installer CodeAudit, suivre le [README](../README.md#run-locally).
Compter environ dix minutes pour le parcours une fois les services démarrés ;
la durée d'installation dépend du poste et de la connexion.

## 1. Préparer l'archive

Depuis la racine de CodeAudit :

```sh
pnpm demo:prepare
```

Le script télécharge une archive GitHub bornée à 10 Mio, vérifie son empreinte,
et la conserve dans **`.tmp/demo/express-5.1.0.zip`**. Une deuxième exécution
vérifie et réutilise le fichier. Un fichier existant différent est refusé,
sans remplacement automatique. Les sources restent hors de Git.

| Élément | Valeur vérifiée |
| --- | --- |
| Dépôt | [expressjs/express](https://github.com/expressjs/express) |
| Version utilisée | 5.1.0 ; choix reproductible, pas une recommandation de version à déployer |
| Commit | [`cd7d4397c398a3f3ecadeaf9ef6ac1377bd414c4`](https://github.com/expressjs/express/tree/cd7d4397c398a3f3ecadeaf9ef6ac1377bd414c4) |
| Archive | [ZIP du commit](https://codeload.github.com/expressjs/express/zip/cd7d4397c398a3f3ecadeaf9ef6ac1377bd414c4) |
| SHA-256 | `f1d730c4a89ca142cef7da22229b99cec1aefabda7d71115cd4f935eda719628` |
| Taille téléchargée | 250 407 octets |
| Entrées ZIP | 295, répertoires compris |
| Taille décompressée déclarée | 743 122 octets ; l'import contrôle aussi les octets réellement lus |
| Licence conservée dans l'archive | [MIT, auteurs Express](https://github.com/expressjs/express/blob/cd7d4397c398a3f3ecadeaf9ef6ac1377bd414c4/LICENSE) |

Si GitHub régénère un jour l'archive avec une empreinte différente, le script
échoue explicitement. Vérifier le commit et le contenu amont avant toute mise à
jour de l'empreinte ; ne pas supprimer le contrôle pour poursuivre.

## 2. Créer son espace de démonstration

1. Ouvrir **http://127.0.0.1:5173/register** et créer son propre compte.
2. Ouvrir **Projets → Nouveau projet**.
3. Nom : **Express · 5.1.0**.
4. Description : `Sources expressjs/express, commit cd7d4397c398a3f3ecadeaf9ef6ac1377bd414c4, licence MIT.`
5. Créer le projet et conserver le profil **Essentiel** (`codeaudit-js-ts-v1`).

La vérification d'adresse n'est pas requise pour analyser un projet. Elle est
nécessaire pour configurer la 2FA ou associer une identité externe. Les emails
de développement se lisent dans Mailpit, normalement **http://127.0.0.1:8026**.
Aucun compte ni mot de passe public commun n'est fourni dans le dépôt.

## 3. Importer et suivre une analyse ZIP

1. Dans la fiche projet, sélectionner `.tmp/demo/express-5.1.0.zip` sous
   **Archive ZIP du projet**. Afficher les fichiers cachés si le sélecteur masque `.tmp`.
2. Facultatif : cocher **Conserver un aperçu du code pour les diagnostics**.
   Pour cette démonstration, les sources sont publiques ; sur un projet privé,
   décider explicitement si ces extraits peuvent être conservés.
3. Cliquer sur **Lancer l'analyse**.
4. Suivre **En attente → En cours → Terminée**. Sur un poste rapide, l'état
   intermédiaire peut être trop bref pour être visible.
5. Vérifier le profil, les compteurs et la durée affichés.
6. Recharger la page : les résultats doivent être conservés.

`SUCCEEDED` / « Terminée » signifie que le traitement a abouti, même si le code
produit des diagnostics. `FAILED` correspond à un échec technique.

## 4. Parcourir les diagnostics

- Sélectionner **Avertissements** dans le filtre de gravité.
- Rechercher `lib/`, puis retirer le filtre de gravité et sélectionner `eqeqeq` :
  **trois diagnostics** correspondent dans ce snapshot avec ce profil.
- Effacer les filtres et utiliser **Suivant** pour vérifier la pagination.
- Examiner fichier, ligne, colonne, règle et message.
- Si les extraits ont été conservés, ouvrir **Voir le code** sur un diagnostic.
- Revenir au projet par **Voir le projet et son historique**, puis rouvrir l'analyse.
- Cliquer sur **Exporter le rapport JSON** : le téléchargement contient le rapport
  complet enregistré, indépendamment des filtres et de la page visibles.

Pour tester la comparaison, réimporter le **même ZIP avec le même profil**, puis
sélectionner les deux analyses réussies dans l'historique. Les diagnostics sont
persistants, sans nouveaux ni résolus. Pour comparer des versions différentes,
garder une structure de chemins identique et le même profil/moteur.

## 5. Tester aussi l'import GitHub

Dans la même fiche projet :

1. Ouvrir **Analyser depuis GitHub**.
2. Dépôt public : `expressjs/express`.
3. Référence : `cd7d4397c398a3f3ecadeaf9ef6ac1377bd414c4`.
4. Cliquer sur **Importer et analyser depuis GitHub**.
5. Vérifier la provenance et le commit dans le détail de l'analyse.

Ce parcours a été exécuté contre GitHub réel, sans simuler les réponses du fournisseur.
Il nécessite Internet ; le quota anonyme GitHub peut être atteint. En cas d'erreur
fournisseur, l'import ZIP permet de poursuivre sans prétendre que l'import Git a réussi.

Les compteurs des deux imports sont identiques. Les chemins des imports Git sont
normalisés relativement au dépôt ; le ZIP conserve son dossier enveloppe
`express-cd7d4397c398a3f3ecadeaf9ef6ac1377bd414c4/`. Il ne faut donc pas utiliser
une comparaison ZIP/Git pour conclure à des changements de code.
L'export ZIP est en schéma v1 ; l'export Git est en v2 avec provenance.

## Résultats réellement observés

Parcours effectué le **31 octobre 2026**, depuis Chromium, sur les serveurs locaux,
avec PostgreSQL et le worker réels. Aucun appel API intercepté, aucune statistique
fictive, aucune exécution des sources importées. Le profil embarque ESLint 10.13.0,
TypeScript 5.9.3 et typescript-eslint 8.72.1.

| Indicateur | ZIP | Import GitHub |
| --- | ---: | ---: |
| État final | SUCCEEDED | SUCCEEDED |
| Fichiers analysés | 142 | 142 |
| Fichiers avec diagnostics | 122 | 122 |
| Erreurs | 1 728 | 1 728 |
| Avertissements | 294 | 294 |
| Total des diagnostics | 2 022 | 2 022 |
| Erreurs de syntaxe | 0 | 0 |
| Entrées ignorées par le moteur | 83 | 83 |

Les dates et durées dépendent de la machine et ne sont pas des critères d'égalité.
Les [mesures structurées](demo-evidence.json) et les [captures](images/) documentent
cette exécution. Le rapport téléchargé via le navigateur a été comparé au résultat
persisté retourné par l'API : égalité vérifiée. Même vérification pour l'export Git.
L'affichage mobile a aussi été vérifié à 390 px, sans débordement horizontal.

### Interpréter les chiffres sans surpromettre

| Règle | Diagnostics |
| --- | ---: |
| `no-undef` | 1 725 |
| `no-unused-vars` | 252 |
| `no-console` | 42 |
| `eqeqeq` | 3 |

Le profil n'importe volontairement pas la configuration ESLint d'Express ni ses
globals de tests. Il signale notamment `describe`, `it` ou `XMLHttpRequest` comme
non définis. **Ces compteurs ne démontrent pas 1 728 bugs ni des failles d'Express.**
Ils illustrent les règles génériques choisies par CodeAudit et leurs limites de
contexte. L'extraction comprend tests, exemples et benchmarks, pas seulement `lib/`.
CodeAudit ne réalise pas de vérification sémantique TypeScript, de scan de secrets
ou d'audit des dépendances. Voir [les limites du moteur](../packages/analyzer/README.md).

## Tester ensuite son propre projet

- Préparer un ZIP de sources sans `.git`, `node_modules`, `dist`, `build`,
  `coverage`, fichiers `.env`, clés privées ou données personnelles.
- Respecter les limites : ZIP 10 Mio, fichier 5 Mio, contenu extrait 50 Mio,
  2 000 entrées/nœuds. Les fichiers ignorés comptent malgré tout à l'import.
- Conserver une structure de chemins stable entre versions pour les comparaisons.
- Noter le commit analysé et le profil choisi.
- Examiner les diagnostics dans leur contexte plutôt que les présenter comme des failles.
- Tester l'historique après rechargement et l'export complet.

## Si le parcours bloque

| Symptôme | Vérification |
| --- | --- |
| Interface inaccessible | Vérifier les trois processus ; suivre le [démarrage et le mode compilé](development.md#démarrage-en-mode-compilé). |
| Analyse bloquée en attente | Vérifier le worker, sa connexion à la même base et `CODEAUDIT_STORAGE_ROOT` partagé avec l'API. |
| PostgreSQL inaccessible | `pnpm db:check` ; vérifier le port réel et `DATABASE_URL`. |
| Aucun email | `pnpm mail:up` ; faire correspondre `SMTP_PORT` et le port hôte SMTP de Mailpit. |
| Connexion GitHub/GitLab indisponible | L'authentification OAuth exige des identifiants fournisseur ; **l'import d'un dépôt GitHub public est une fonctionnalité distincte**. |
| Archive refusée | Lire l'erreur affichée ; ne pas désactiver les protections ZIP pour contourner un rejet. |

Ce parcours valide une démonstration locale avec un vrai projet. Il ne remplace
pas un test de charge, un pentest, une restauration de sauvegarde ou une validation
du déploiement HTTPS public.
