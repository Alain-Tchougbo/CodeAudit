# Import de dépôts et pull requests GitHub

Depuis la fiche projet, ouvrir « Analyser depuis GitHub ». Indiquer
`propriétaire/dépôt`, puis une branche, un tag ou un commit ; une référence vide
utilise la branche par défaut résolue par GitHub. Le mode Pull request analyse
la tête de la PR, y compris depuis un fork public. Il n'analyse pas une fusion
hypothétique avec la branche cible. Le dépôt doit être public.

POST /api/projects/:projectId/analyses/github accepte un JSON :

```json
{ "repository": "expressjs/cookie-parser", "ref": "master", "captureContext": false }
```

Remplacer `ref` par `pullRequest: 12` pour une PR ; les deux sont exclusifs.
L'API exige une session avec droit d'écriture sur le projet et le CSRF. Les champs inconnus, URL complètes,
jetons fournisseur et valeurs nulles sont refusés. La propriété est contrôlée
avant le réseau puis avant l'import. Aucun accès privé ou secret Git n'est stocké.

## Téléchargement et sécurité

L'API interroge seulement `https://api.github.com/repos/...`, avec identifiants de
dépôt validés. La référence est résolue en SHA de 40 caractères avant téléchargement.
La redirection d'archive doit viser HTTPS sur `codeload.github.com`, sans
identifiants, fragment ou port personnalisé. Une seconde redirection est refusée.
Ni commande git, script, gestionnaire de paquets, configuration ESLint importée,
hook ou dépendance du projet ne sont exécutés.

Le réseau partage un délai de 30 secondes, métadonnées limitées à 1 Mio et archive
à 10 Mio réellement lus, même sans Content-Length. Deux téléchargements au plus
par processus API. Les quotas anonymes GitHub peuvent déclencher une erreur 429.
Les corps d'erreur fournisseur ne sont pas transmis aux utilisateurs.

Le ZIP utilise ensuite toutes les protections existantes : 2 000 entrées, 5 Mio
par fichier, 50 Mio décompressés et délai d'extraction de 60 secondes. Les traversées,
liens, types spéciaux, doublons et corruptions sont contrôlés avant normalisation.
Un unique dossier enveloppe est requis. Son déplacement reste dans le répertoire
temporaire généré et vérifié ; les octets sources sont préservés. Les diagnostics
restent donc relatifs au dépôt, sans dossier variant avec le commit. Les imports
ZIP classiques gardent leurs chemins d'origine.

## Persistance et export

La migration 20261031000600_git_source ajoute sourceMetadata. La provenance est
figée avec la demande, affichée dans son détail et conservée après nettoyage des
sources. Le profil projet suit la même sélection versionnée que l'import ZIP.
L'option d'extraits reste explicitement désactivée par défaut.

Un rapport Git réussi est exporté en v2 avec sa provenance enregistrée et le
rapport moteur exact. Un rapport ZIP sans provenance reste en v1. Une modification
du projet ou de la branche distante ne réécrit aucun ancien rapport. Les schémas
v1/v2 et la provenance enregistrée sont validés à la lecture ; un document corrompu
est refusé. Les résultats seuls restent accessibles par /results comme auparavant.

## Vérifications et limites

Les tests automatiques du fournisseur utilisent des réponses HTTP contrôlées
pour exercer les redirections, limites, forks, réponses invalides et délais.
Les intégrations utilisent PostgreSQL, de vrais ZIP, le vrai moteur et le worker,
avec uniquement la réponse fournisseur remplacée. Le parcours navigateur valide
les modes du formulaire et le refus d'une URL arbitraire sans requête d'import.

Un essai réseau local réel du 31 octobre 2026 a téléchargé expressjs/cookie-parser,
commit 1f2a3a2037c4efe01605e064e7cc326008be7287, archive de 14 369 octets,
puis normalisé et analysé deux fichiers JS avant suppression contrôlée des sources.
Le profil Essentiel a produit 45 erreurs et un avertissement. Les globals de
frameworks de tests ne sont pas reconnus automatiquement : des no-undef peuvent
être de faux positifs. Ces compteurs sont ceux du moteur, sans qualification
manuelle de chaque diagnostic ni conclusion de sécurité sur ce dépôt.

Ce lot ne configure ni OAuth privé, GitLab/Bitbucket, webhook, commentaire de PR,
statut envoyé au fournisseur ou analyse planifiée. Les sous-modules et objets Git
LFS ne sont pas récupérés séparément. Les archives trop volumineuses sont refusées.
Le test réseau réel porte sur un dépôt public ; la résolution PR/fork est couverte
avec réponses contrôlées, sans prétendre avoir validé une connexion privée réelle.

Références fournisseur : [archives GitHub](https://docs.github.com/en/rest/repos/contents#download-a-repository-archive-zip)
et [lecture d'une PR](https://docs.github.com/en/rest/pulls/pulls#get-a-pull-request).
