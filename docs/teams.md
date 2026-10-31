# Équipes et contrôle des accès

Les équipes complètent les projets personnels. Elles ne changent ni les rapports
déjà enregistrés ni leur schéma d'export. Le moteur et le worker restent indépendants
de l'identité de la personne qui consulte les résultats.

## Utilisation

1. Créer une équipe dans `/teams` ; son créateur devient administrateur.
2. Inviter une adresse avec le rôle Membre ou Lecture seule. SMTP doit être
   configuré ; `pnpm mail:up` fournit une boîte locale de développement.
3. Le destinataire ouvre le lien reçu, utilise un compte correspondant à l'adresse,
   puis accepte. L'inscription seule ne donne aucun accès à l'équipe.
4. Depuis un projet personnel, choisir une équipe dont on est membre actif avec
   droit d'écriture et confirmer le partage de tout l'historique.
5. Gérer les rôles et retraits depuis l'équipe. Le dernier administrateur ne peut
   pas quitter ni se rétrograder ; un autre membre doit d'abord devenir administrateur.

## Matrice des droits

| Opération sur un projet | Personnel : propriétaire | Administrateur | Membre | Lecture seule |
| --- | --- | --- | --- | --- |
| Projet, historique, résultats, comparaison, extraits, export, décision qualité | Oui | Oui | Oui | Oui |
| Modifier le nom ou la description | Oui | Oui | Oui | Non |
| Demander une analyse ZIP/Git ou une annulation | Oui | Oui | Oui | Non |
| Supprimer des extraits enregistrés | Oui | Oui | Oui | Non |
| Gérer ses propres clés CI | Oui | Oui | Oui | Non |
| Choisir le profil ou les seuils des prochaines analyses | Oui | Oui | Non | Non |
| Supprimer le projet et ses analyses terminées | Oui | Oui | Non | Non |
| Gérer les invitations et rôles de l'équipe | Sans objet | Oui | Non | Non |

Tous les membres peuvent quitter l'équipe, sous réserve de conserver au moins un
administrateur. Seuls les administrateurs voient les adresses des autres membres.
Une équipe contenant des projets ne peut pas être supprimée. Les clés CI restent
personnelles : même un administrateur ne peut pas lire ni révoquer individuellement
la clé d'une autre personne. Un changement de rôle ou retrait révoque toutes ses
clés pour les projets de l'équipe, ainsi que ses invitations en attente.

## API et persistance

La migration `20261031000800_teams` ajoute Team, TeamMember, TeamInvitation et le
rattachement facultatif Project.teamId. Aucun projet existant n'est partagé
automatiquement. Les projets historiques sans propriétaire restent en quarantaine.
La relation projet/équipe utilise ON DELETE RESTRICT pour éviter une restauration
involontaire des droits du propriétaire historique lors d'une suppression d'équipe.

- `GET/POST /api/teams`, `GET/PATCH/DELETE /api/teams/:id`.
- `PUT/DELETE /api/teams/:id/members/:userId` ; PUT reçoit `{ "role": "MEMBER" }`.
- `GET/POST /api/teams/:id/invitations` ; POST reçoit email et role MEMBER/READER.
- `DELETE /api/teams/:id/invitations/:invitationId`.
- `POST /api/team-invitations/preview` et `/accept`, corps `{ "token": "…" }`.
- `PUT /api/projects/:id/team`, corps `{ "teamId": "UUID" }`.

Les sessions et protections CSRF s'appliquent à ces routes. Un compte extérieur
reçoit 404 ; un membre sans droit suffisant reçoit 403. Les scopes centralisés
s'appliquent aussi aux recherches, tableaux de bord et accès directs aux analyses.
La permission d'écriture est revérifiée dans la transaction de mise en file, après
préparation des sources. Une requête déjà autorisée ou un travail déjà accepté ne
peut pas être rappelé rétroactivement ; le retrait interdit les requêtes suivantes.
Les permissions fournies à Vue servent à présenter les actions ; l'API les vérifie
indépendamment. Aucune règle de sécurité ne repose uniquement sur l'interface.

Les invitations utilisent 32 octets aléatoires, un SHA-256 en base, une durée de
sept jours et une consommation transactionnelle à usage unique. Un renvoi remplace
le lien précédent. La limite est de trois envois par équipe/adresse et dix par IP
sur quinze minutes, cinquante invitations actives et cent membres par équipe.
Une panne SMTP donne une erreur explicite et supprime le nouveau lien en base.
Le jeton voyage dans le fragment du lien, jamais dans une redirection de connexion,
ni localStorage/sessionStorage. Il est conservé uniquement en mémoire pendant la
navigation SPA : après rechargement pendant la connexion, rouvrir le lien de l'e-mail.

Les transactions Serializable empêchent deux départs concurrents de supprimer tous
les administrateurs. Une modification concurrente peut renvoyer 409 : actualiser et
réessayer. Les modifications de rôles ne modifient aucun rapport déjà enregistré.

## Vérification et limites

`pnpm --filter @codeaudit/api test:integration --testPathPatterns teams.spec.ts`
nécessite une base PostgreSQL migrée dédiée dont le nom finit par `_test`, ainsi
que Mailpit sur TEST_SMTP_PORT et TEST_MAILPIT_API_URL. Les tests utilisent uniquement
des destinataires synthétiques `@example.test`. `pnpm test:e2e` comprend le parcours
d'invitation, inscription, partage, lecture, changement de rôle puis retrait réel.

Pas de SSO, MFA, validation générale des adresses à l'inscription, changement
d'adresse, audit administratif, facturation ou quotas par organisation dans ce lot.
Le lien d'invitation établit l'accès à la boîte destinataire pour rejoindre l'équipe.
Le retour d'un projet partagé à un projet personnel, le transfert entre équipes
et la suppression de compte ne sont pas proposés. Les migrations ne suppriment pas
les projets ou rapports existants. Le lancement documenté reste local ; HTTPS,
transport de messagerie réel et revue de sécurité indépendante restent à préparer
avant une exposition publique.
