# Authentification et isolation des données

## Architecture retenue

L'API conserve des sessions opaques dans PostgreSQL. Un cookie HttpOnly contient
32 octets aléatoires encodés en hexadécimal ; seul son condensat SHA-256 est stocké
en base. Le serveur consulte la session à chaque requête et peut donc la révoquer
sans attendre l'expiration d'un jeton autonome. Aucun JWT ou identifiant de session
n'est placé dans localStorage, sessionStorage ou une URL.

Le frontend conserve le profil et le jeton CSRF uniquement en mémoire. Au démarrage,
GET /api/auth/me restaure le profil via le cookie. Les routes Vue privées attendent
cette réponse avant d'afficher les données. Une réponse 401 sur une requête privée
efface cet état, masque les vues privées et ouvre la connexion avec une destination
interne validée. Un échec réseau de déconnexion n'est pas présenté comme une
révocation confirmée.

Les mots de passe sont hachés avec le scrypt natif de Node : N=131072, r=8, p=1,
sel aléatoire de 16 octets et clé de 32 octets. Ce choix évite une dépendance native
supplémentaire ; ses paramètres suivent
[la recommandation OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).
Le format stocké contient les paramètres, le sel et le dérivé, jamais le mot de passe.
Deux calculs au plus sont admis simultanément par processus ; une saturation renvoie
429. Un email inconnu effectue aussi un calcul pour éviter une sortie rapide évidente.

## Endpoints

| Méthode et route | Résultat |
| --- | --- |
| POST /api/auth/register | Nom, email et password ; 201, session ouverte et profil |
| POST /api/auth/login | Email/password ; 200, nouvelle session et profil |
| GET /api/auth/me | Profil courant, csrfToken et expiresAt ; 401 si absent/expiré |
| POST /api/auth/logout | Révocation de la session courante, cookie effacé, 204 |

Le profil expose seulement id, name, email et createdAt. Le nom est tronqué des
espaces périphériques et limité à 120 caractères. L'adresse est trimée, passée en
minuscules, validée et limitée à 254 caractères, avec contrainte unique en base.
Le mot de passe garde ses caractères d'origine : 12 à 128 caractères, pas uniquement
des espaces. Les champs inconnus sont refusés. Les erreurs de connexion utilisent
le même message pour email inconnu et mot de passe incorrect. Un email déjà inscrit
donne EMAIL_ALREADY_USED ; ce comportement révèle volontairement l'existence du
compte à l'inscription, conformément au besoin fonctionnel.

## Cookies, CSRF et expiration

- Développement HTTP : cookie codeaudit.sid, HttpOnly, SameSite=Lax, Path=/.
- Production : cookie __Host-codeaudit.sid, Secure, HttpOnly, SameSite=Lax,
  Path=/, sans Domain. NODE_ENV=production exige AUTH_APP_ORIGIN en HTTPS au démarrage.
- Durée absolue : 8 heures. Inactivité HTTP : 30 minutes, contrôlée en base, même
  si le navigateur possède encore le cookie. Les requêtes autorisées actualisent
  lastSeenAt. Une analyse en cours continue indépendamment de la session du navigateur.
- Chaque connexion réussie produit un nouvel identifiant et invalide la session
  précédente fournie par ce navigateur. La déconnexion ne ferme pas les autres
  sessions/appareils de l'utilisateur. Une session expirée peut aussi être déconnectée.
- Les réponses API sont no-store. Les sessions expirées et anciens compteurs sont
  nettoyés à la création de sessions ; la validité est toujours vérifiée à la lecture.

Les mutations demandent X-CodeAudit-Request: 1, un jeton X-CSRF-Token lié à la
session et une origine autorisée si Origin/Referer est présent. Le jeton est dérivé
par HMAC-SHA-256 de l'identifiant de session et d'un contexte fixe, puis comparé
en temps constant ; il ne permet pas de retrouver le cookie. Login et inscription
exigent l'en-tête dédié et le contrôle d'origine, sans exiger une session existante.
La déconnexion est idempotente et contrôle le CSRF quand la session est active.
Ces protections complètent SameSite ; les API n'activent pas de CORS permissif.
Voir [les principes OWASP CSRF](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html).

Avec curl/Supertest, conserver le cookie reçu, demander /auth/me pour le jeton et
envoyer les deux en-têtes sur les mutations, y compris l'import multipart. Ne pas
forcer le Content-Type multipart : le client doit générer sa boundary.

Exemple PowerShell pour les exemples HTTP des autres documents, après création
d'un compte dans Vue (le mot de passe est demandé interactivement, pas écrit ici) :

```powershell
$credential = Get-Credential -Message 'Compte CodeAudit : email et mot de passe'
$http = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$inputJson = @{ email = $credential.UserName; password = $credential.GetNetworkCredential().Password } | ConvertTo-Json
$profile = Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:3000/api/auth/login' -WebSession $http -Headers @{ 'X-CodeAudit-Request' = '1' } -ContentType 'application/json' -Body $inputJson
Remove-Variable inputJson, credential
$cookieHeader = $http.Cookies.GetCookieHeader([uri]'http://127.0.0.1:3000')
$csrfToken = $profile.csrfToken
Invoke-RestMethod 'http://127.0.0.1:3000/api/projects' -WebSession $http
```

Ces variables restent en mémoire pour la session de terminal. Ne pas afficher
le cookie/jeton, les copier dans Git ou les réutiliser dans un script public.

## Limitation des tentatives

Une fenêtre fixe de 15 minutes est persistée dans AuthThrottle. L'admission est
atomique avec INSERT ON CONFLICT conditionnel PostgreSQL :

- connexion : 30 demandes par adresse IP et 10 par adresse email ;
- inscription : 10 demandes par IP et 10 par email ;
- les demandes valides comme invalides consomment un quota avant le calcul du hash ;
  les erreurs de validation du DTO n'effectuent pas de vérification de mot de passe.

Les adresses utilisées pour les compteurs sont condensées. L'adresse IP vient de
la connexion TCP ; X-Forwarded-For n'est pas cru. Derrière un reverse proxy, les
clients peuvent donc partager un quota IP : une politique de proxy de confiance
et une limitation en bordure devront être définies avant un déploiement public.
Les plafonds scrypt sont locaux au processus ; les quotas de tentatives sont partagés
entre instances via PostgreSQL. Aucun test de résistance à une attaque distribuée
n'est revendiqué.

## Propriété et migration

La migration 20261031000100_authentication ajoute User, Session, AuthThrottle et
Project.ownerId avec index et clé étrangère. Les nouveaux projets reçoivent toujours
l'identifiant de l'utilisateur côté serveur ; le client ne peut pas le choisir.
Les analyses héritent de la propriété de leur projet. Les contrôles s'appliquent
à création/import, lecture, modification, suppression, historique, statut, résultats,
export et tableau de bord, pas seulement aux routes Vue. Une ressource étrangère
renvoie 404 sans révéler si cet identifiant existe. Le worker traite la file interne
avec ses accès de service et n'expose pas d'endpoint HTTP utilisateur.

Les projets préexistants conservent ownerId=NULL et sont invisibles à tous les
comptes. Ils ne sont jamais attribués au premier inscrit. La base locale comptait
zéro projet lors de l'examen initial. Pour une autre base existante, un administrateur
doit sélectionner explicitement les projets et leur propriétaire et effectuer une
attribution contrôlée via ses accès PostgreSQL. Aucun endpoint public de revendication
ou transfert n'a été ajouté. La suppression d'un User possédant encore des projets
est refusée par la clé étrangère ; supprimer le compte n'est pas exposé par l'API.

Les snapshots historiques du projet restent inchangés. Les nouveaux snapshots
n'incluent pas ownerId, afin de conserver le schéma d'export et de limiter les
informations exposées. Les résultats d'analyses ne sont pas réécrits par la migration.

## Configuration et vérifications

Développement : pnpm db:migrate, puis pnpm dev et /register. Aucun compte ni mot
de passe de démonstration n'est créé. AUTH_APP_ORIGIN doit correspondre exactement
à l'origine du navigateur ; adapter cette variable si WEB_PORT change. Pour ouvrir
via localhost plutôt que 127.0.0.1 avec un origin explicite, adapter aussi cette valeur.
Ne pas mélanger les deux noms d'hôte, car les cookies sont liés à leur hôte.

Production : NODE_ENV=production et AUTH_APP_ORIGIN=https://votre-origine, TLS via
un déploiement revu, frontend et /api sous la même origine. Les secrets de base
restent côté serveur et dans des variables non versionnées. Cette implémentation
n'exige pas de secret de signature global : l'entropie vient du cookie aléatoire
par session. Ne jamais inscrire de vraies identités/mots de passe dans les fixtures.

Les intégrations utilisent deux comptes réels sur PostgreSQL et remplacent les
UUID dans les requêtes HTTP. Elles vérifient aussi expiration absolue/inactivité,
rejeu après logout, session lue par une nouvelle instance API, CSRF, origine hostile,
quotas, cookie de production et projets anciens sans propriétaire.
Les anciens E2E obtiennent un compte de test ; leurs requêtes directes ajoutent
les en-têtes requis, mais le navigateur utilise exclusivement ceux du vrai code Vue.
Les nouveaux E2E réalisent l'inscription mobile, rechargement, profil, reconnexion,
expiration réelle en base et refus de lecture/modification/suppression étrangères.

## Limites restantes

Les attributs Secure/__Host sont vérifiés en test API ; un déploiement HTTPS réel
n'a pas été testé de bout en bout. Ni pentest, audit cryptographique indépendant,
MFA, vérification d'adresse, récupération de mot de passe, gestion d'appareils ou
déconnexion globale n'est fourni par ce lot. La configuration de proxy, les quotas
publics, la supervision et les protections système du worker restent à revoir
avant production. Un logout ne peut pas annuler une requête déjà admise ni un
travail d'analyse déjà mis en file. Les tests exercés ne constituent pas une garantie
générale de sécurité.

Au contrôle local du 31 octobre 2026, `pnpm audit --prod` ne signale aucune
vulnérabilité après passage de minimatch à 11.0.1. L'audit complet garde deux
alertes sur l'outillage de développement (deepmerge faible et glob modérée).
Voir les avis et les limites dans le README ; ce résultat dépend de la date du contrôle.
