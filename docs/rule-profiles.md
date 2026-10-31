# Profils de règles contrôlés

Deux versions sont publiées dans le registre de packages/analyzer/src/profile.ts.
Les règles et options de `codeaudit-js-ts-v1` restent identiques au profil initial.
`codeaudit-js-ts-strict-v1` reprend ces règles avec les différences suivantes :

| Règle | Essentiel | Strict |
| --- | --- | --- |
| no-console | avertissement | erreur |
| no-unused-vars en JavaScript | avertissement | erreur |
| @typescript-eslint/no-unused-vars en TypeScript | avertissement | erreur |
| @typescript-eslint/no-explicit-any | avertissement | erreur |
| complexity | désactivée | avertissement, maximum 10 |
| max-depth | désactivée | avertissement, maximum 4 |

GET/PUT /api/projects/:id/rule-profile exigent une session et la propriété du
projet ; PUT exige aussi le CSRF. Le corps contient seulement `version`.
Les configurations personnalisées, noms de modules et chemins sont refusés.
L'API fournit la liste et les règles exactes du registre au frontend.

La migration 20261031000400_rule_profiles donne Essentiel aux projets existants
et ajoute une contrainte SQL sur les versions prises en charge. Une future
modification de règles exige une nouvelle version et une migration du registre
autorisé ; les versions déjà publiées ne doivent pas être réécrites.

L'enqueue lit la version du projet dans sa transaction et l'enregistre sur
Analysis avant réservation. Le worker transmet cette version au moteur isolé.
La publication vérifie à nouveau que le rapport utilise la version demandée.
Une version inconnue échoue techniquement, sans remplacement silencieux.
Les anciennes lignes sans version demandée utilisent le profil historique.

Les rapports gardent les règles complètes et versions des moteurs réellement
utilisés. L'export ne recalcule rien. La comparaison exige toujours les mêmes
règles, versions de moteurs et limites. Changer le profil n'altère ni les analyses
en attente ni les rapports terminés. Les règles restent syntaxiques, sans typage
de projet, résolution de dépendances ni exécution de code importé. Strict ne
constitue pas une certification de qualité ou de sécurité.
