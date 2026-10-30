# Workflow Git

Suivre [docs/git-workflow.md](docs/git-workflow.md) pour chaque nouvelle tâche.

- Partir de `origin/staging` à jour et créer une branche dédiée à une seule tâche.
- Ne pas développer ni pousser directement sur `main` ou `staging`.
- Ouvrir une PR de la branche de tâche vers `staging`, avec le contexte et les
  vérifications réellement exécutées. Ne pas présenter un test non exécuté comme réussi.
- Fusionner les PR de tâches par squash uniquement après réussite des contrôles
  obligatoires, puis supprimer leur branche distante.
- Réserver les PR vers `main` à la branche `staging` du même dépôt. Les fusionner
  par merge commit afin de conserver l'ascendance de `staging`.
- Conserver `staging` après une livraison. Ne pas réécrire l'historique partagé,
  pousser de force ni contourner les protections de branche.
- Une demande de fonctionnalité autorise son développement sur sa branche ; la
  livraison `staging → main` reste une opération distincte à la demande de l'utilisateur.

Les secrets, sources importées, dépendances et résultats de build restent exclus de Git.
