# Workflow Git de CodeAudit

`main` représente les versions livrées. `staging` intègre les tâches terminées.
Chaque nouvelle tâche possède une branche courte et une PR distincte vers
`staging`. Les fonctionnalités déjà présentes dans `main` constituent le point
de départ ; elles ne font pas l'objet de PR rétrospectives.

```text
staging → feat/nom-de-tache → PR vers staging → squash merge
staging → fix/nom-du-correctif → PR vers staging → squash merge
staging → PR de livraison vers main → merge commit
```

Ne créer une branche qu'au début de la tâche correspondante, pour partir du
dernier état de `staging`. Préfixes : `feat/`, `fix/`, `chore/`, `docs/`,
`refactor/` ou `test/`. Utiliser un nom court décrivant la tâche.

## Réaliser une tâche

Commencer avec un répertoire de travail propre ; conserver séparément les
changements en cours avant de changer de branche.

```powershell
git fetch origin
git switch staging
git pull --ff-only origin staging
git switch -c feat/nom-de-tache
# Développer et exécuter les vérifications adaptées.
git add chemin/des/fichiers
git commit -m "feat: description de la tache"
git push -u origin feat/nom-de-tache
gh pr create --base staging --head feat/nom-de-tache --title "feat: description de la tache" --body-file description-pr.txt
```

Garder le fichier temporaire de description hors des fichiers versionnés.
La PR explique le problème, le comportement obtenu, les vérifications réellement
exécutées et les limites restantes. Utiliser le modèle fourni par le dépôt.
Ne pas regrouper des fonctionnalités indépendantes dans une seule PR.

La CI complète doit réussir avant fusion, y compris les tests PostgreSQL et
Playwright. `pr-policy` vérifie la destination de la PR. Les branches `main`
et `staging` exigent ces contrôles et une PR, y compris pour les administrateurs.
Les branches de tâches doivent être à jour avec `staging`. Aucun avis externe n'est obligatoire
dans ce MVP mono-utilisateur ; relire néanmoins le diff et les résultats avant fusion.

Si `staging` a évolué pendant le développement, fusionner `origin/staging` dans
la branche de tâche, résoudre les conflits, pousser et attendre la nouvelle CI.
Ne pas pousser de force pour contourner cette étape.

```powershell
gh pr checks NUMERO_PR --watch
gh pr merge NUMERO_PR --squash --delete-branch
git switch staging
git pull --ff-only origin staging
```

Une CI en échec bloque la fusion. Corriger le problème sur la branche de tâche.
La fusion squash produit un commit par tâche dans `staging` et permet de revenir
sur une tâche avec une nouvelle PR de revert si nécessaire.

## Livrer staging vers main

Une livraison est explicitement décidée lorsque les tâches visées sont intégrées
et les vérifications de `staging` sont vertes. Vérifier le diff et les migrations,
puis créer une PR récapitulant les changements depuis la livraison précédente :

```powershell
gh pr create --base main --head staging --title "release: description de la livraison" --body-file description-livraison.txt
gh pr checks NUMERO_PR --watch
gh pr merge NUMERO_PR --merge
```

Utiliser un **merge commit** pour cette PR, afin que les commits de `staging`
restent dans l'historique de `main` et ne réapparaissent pas dans les livraisons
suivantes. Ne pas supprimer `staging`, ne pas la réinitialiser et ne pas pousser
directement sur `main`. La prochaine tâche repart de `staging` à jour.

La protection de `main` exige les contrôles de la PR, sans imposer à `staging`
d'intégrer les merge commits des livraisons précédentes. La CI de la PR vérifie
le résultat combiné avec `main`. Cela permet les livraisons successives sans
branche de synchronisation ni réécriture d'historique.

Un correctif urgent suit aussi `fix/... → staging → main` ; aucun contournement
des protections ni antidatage n'est prévu par ce workflow.

## Contrôles GitHub

- CI : le contrôle `check` exécute installation figée, lint, typage, builds,
  tests unitaires, migrations, tests d'intégration PostgreSQL et Playwright.
- Politique : `pr-policy` accepte les tâches vers `staging` et uniquement
  `staging` du même dépôt vers `main`.
- Les pushs sur `main` et `staging` exécutent aussi la CI ; les branches de
  tâches sont vérifiées par leur PR pour éviter deux exécutions identiques.
- Les pushs de force et la suppression des branches permanentes sont interdits.
- Les protections sont des réglages GitHub, distincts des fichiers du dépôt.
  Elles doivent être recréées si le dépôt est déplacé ou dupliqué.
