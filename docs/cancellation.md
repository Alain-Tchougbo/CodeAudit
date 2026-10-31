# Annulation et suivi

POST /api/analyses/:id/cancel exige une session propriétaire et le CSRF. Une
ressource étrangère ou absente renvoie 404. Une analyse réussie ou échouée est
immuable et renvoie 409. Une demande déjà acceptée est idempotente et renvoie 202.

En attente, une mise à jour conditionnelle QUEUED → CANCELLED gagne ou perd
atomiquement face à la réservation. Si un worker a réservé entre-temps, la demande
est inscrite sur RUNNING via cancelRequestedAt. Le contrôle porte aussi sur le
propriétaire dans les écritures, pas seulement sur un premier GET.

En cours, aucun état terminal n'est annoncé par l'API : le worker détecte le
drapeau au heartbeat (toutes les 5 secondes avec la réservation par défaut).
Le thread est interrompu et sa terminaison est attendue avant acquittement.
La publication SQL refuse toute demande d'annulation concurrente ; une fin du
moteur avant le prochain heartbeat ne permet donc pas de publier son rapport.
La finalisation atomique distingue CANCELLED de FAILED et ne conserve aucun
résultat partiel. La réservation empêche un autre worker de lancer cette analyse.

Après une interruption, une réservation expirée avec drapeau d'annulation est
classée CANCELLED par la maintenance, sans réexécution. Le fencing bloque une
publication tardive d'un ancien worker. Cette reprise repose sur l'expiration du
bail et ne prétend pas observer directement un processus distant arrêté.

La maintenance supprime les sources des analyses annulées avec les mêmes gardes
de stockage que les autres états terminaux. Worker arrêté : nettoyage différé
à son retour ; les dossiers orphelins gardent leur politique de rétention bornée.
L'API ne supprime pas les fichiers qu'un worker pourrait encore lire.

Le détail expose seulement les dates de heartbeat, d'échéance et d'annulation,
sans lockToken ni identifiant de réservation. Le navigateur actualise toutes les
3 secondes, puis arrête le polling à l'état terminal. Aucun pourcentage fictif.
Le tableau de bord compte les annulations séparément : « Analyses réalisées »
garde son sens historique SUCCEEDED + FAILED, les annulations restent dans le
nombre total de demandes. Historique conservé, export et résultats refusés avec
409 pour CANCELLED. Les rapports des autres analyses ne sont jamais modifiés.

Une nouvelle demande nécessite un nouvel import : les sources ne sont pas
conservées pour offrir une relance implicite. La migration
20261031000500_analysis_cancellation ajoute l'état et la date de demande.
