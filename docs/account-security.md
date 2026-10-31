# Comptes et sécurité

Le module comprend récupération du mot de passe, vérification et changement
d'adresse, modification du profil et du mot de passe, TOTP et codes de secours,
sessions, connexion GitHub/GitLab, suppression, export personnel et journal de
sécurité. Une fonctionnalité implémentée peut nécessiter une configuration :
SMTP pour les e-mails, clé de chiffrement pour TOTP/OAuth et applications OAuth
enregistrées pour les connexions externes. Aucun fournisseur n'est simulé dans
les écrans fonctionnels.

## Configuration locale

Conserver le .env existant. Si nécessaire, le créer depuis .env.example, puis :

```powershell
pnpm auth:init-key
pnpm db:migrate
pnpm mail:up
pnpm dev
```

Le script crée SECURITY_ENCRYPTION_KEY (32 octets en base64) dans le seul .env
ignoré, sans afficher sa valeur et sans remplacer une clé existante. Sauvegarder
cette clé hors de Git : la remplacer empêcherait de déchiffrer les secrets TOTP
et les échanges OAuth en attente. En déploiement, la fournir via un gestionnaire
de secrets. Aucune clé n'est envoyée au frontend.

SMTP_HOST, SMTP_PORT, MAIL_FROM et AUTH_APP_ORIGIN doivent correspondre à
l'environnement. Mailpit reçoit les messages locaux sans livraison externe ;
ses ports par défaut sont SMTP 1026 et HTTP 8026. Sur le poste de démonstration,
les ports réservés sont 1027 et 8027 pour laisser 1026/8026 aux tests.

Si le processus Vite de développement rencontre le problème natif Windows décrit
dans le journal, utiliser les builds compilés dans trois terminaux après pnpm build :

```powershell
pnpm --filter @codeaudit/api start
# Autre terminal
pnpm --filter @codeaudit/worker start
# Autre terminal
pnpm --filter @codeaudit/web preview --port 5173 --strictPort
```

Ce mode sert à la démonstration locale ; Vite preview n'est pas un serveur de
production. Le proxy /api utilise API_PROXY_TARGET, par défaut http://127.0.0.1:3000.

## Adresse, profil et mot de passe

Dans Mon profil, modifier le nom ou envoyer un lien de vérification de l'adresse.
Les comptes existants restent non vérifiés : aucune preuve n'est inventée lors
de la migration. Les projets restent accessibles ; la vérification est nécessaire
avant de configurer la 2FA ou d'associer une identité externe.

Les liens contiennent un secret aléatoire de 32 octets dans un fragment d'URL.
Seul son SHA-256 est stocké ; validité 30 minutes, usage unique et confirmation
explicite dans l'écran. Un renvoi remplace le précédent. Une panne SMTP est
signalée et invalide le nouveau lien. L'origine vient de AUTH_APP_ORIGIN, jamais
de l'en-tête Host. Le fragment est effacé après confirmation.

Changer d'adresse exige le mot de passe actuel et le second facteur si activé.
L'adresse actuelle reste en place tant que la nouvelle n'est pas confirmée.
À la confirmation, sessions, clés CI et liens en attente sont révoqués et une
nouvelle connexion est nécessaire. Une rotation du mot de passe invalide aussi
les anciens liens de changement d'adresse.

Changer le mot de passe depuis le profil exige le mot de passe actuel et la 2FA
si active, puis déconnecte tous les appareils et révoque les clés CI et liens en
attente. La récupération par e-mail conserve la 2FA et révoque en plus les
associations OAuth : les réassocier explicitement après connexion. Elle ne
constitue pas un moyen de contourner le second facteur.

## Double authentification

TOTP SHA-1 à six chiffres, pas de 30 secondes, fenêtre de décalage de ±1 pas,
compatible avec les applications d'authentification. L'interface fournit une clé
manuelle et un lien otpauth ; elle ne nécessite pas de service QR externe.
Le calcul suit [RFC 6238](https://www.rfc-editor.org/rfc/rfc6238) et ses vecteurs
SHA-1 sont testés. Les secrets sont chiffrés par AES-256-GCM avec un contexte
lié au compte. La clé de configuration expire après dix minutes ; l'activation
exige un premier code valide et renouvelle la session courante en révoquant les
autres sessions et clés CI. Un enrôlement non confirmé est invalidé lors d'un
changement/réinitialisation du mot de passe ou d'une déconnexion globale ; il faut
alors recommencer sa configuration.

Dix codes de secours de 128 bits sont affichés une fois, conservés seulement en
mémoire dans l'écran, et stockés sous forme de condensats liés au compte.
Les conserver dans un lieu sûr avant de quitter la page. Chaque code est à
usage unique. Un pas TOTP déjà utilisé est refusé atomiquement, y compris en cas
de connexions concurrentes. Attendre le prochain code ou utiliser un code de
secours pour une nouvelle action sensible. L'heure du serveur doit être correcte.

La connexion demande d'abord le mot de passe puis le code ; aucune session n'est
émise après le seul mot de passe. Les actions sensibles exigent aussi le second
facteur. La désactivation exige mot de passe et code, ferme les sessions et
révoque les clés CI. Les codes de secours permettent encore de s'authentifier
si la clé de chiffrement serveur est indisponible ; ils permettent de désactiver
la 2FA sans déchiffrer le secret. Pas de procédure de contournement administratif
ou de suppression de 2FA sur simple e-mail.

## GitHub et GitLab

Créer d'abord un compte CodeAudit, vérifier son e-mail puis associer explicitement
le fournisseur depuis Mon profil, avec mot de passe et second facteur si actif.
L'écran de connexion permet ensuite d'utiliser cette identité. Une adresse e-mail
commune ne provoque jamais une association automatique. L'inscription directe
via OAuth et les instances GitLab auto-hébergées ne font pas partie de ce module.

Créer une application OAuth pour chaque fournisseur et renseigner côté serveur :

| Fournisseur | Variables | Callback local exact |
| --- | --- | --- |
| GitHub.com | GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET | http://127.0.0.1:5173/api/auth/oauth/GITHUB/callback |
| GitLab.com | GITLAB_CLIENT_ID, GITLAB_CLIENT_SECRET | http://127.0.0.1:5173/api/auth/oauth/GITLAB/callback |

Changer le domaine/port avec AUTH_APP_ORIGIN et enregistrer le même callback chez
le fournisseur. HTTPS est obligatoire en production. Les secrets restent dans
l'environnement serveur ; ne pas les préfixer VITE_ ni les committer.

Authorization Code avec PKCE S256 et state aléatoire liés au navigateur par cookie
HttpOnly, Secure en production et SameSite=Lax. État et vérificateur expirent après
cinq minutes, consommation atomique, vérificateur chiffré, état haché. Les endpoints
de token et d'identité sont fixes en HTTPS, sans redirection, avec délai de dix
secondes et réponse limitée à 512 Kio. Les jetons fournisseur sont utilisés en
mémoire pour lire l'identité et ne sont pas persistés. Scopes read:user sur GitHub
et read_user sur GitLab. Les callbacks répondent avec Referrer-Policy: no-referrer.
Voir [GitHub](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps)
et [GitLab](https://docs.gitlab.com/api/oauth2/) pour l'enregistrement et le protocole.

La 2FA CodeAudit reste exigée après le retour OAuth : le cookie de challenge ne
donne pas accès aux projets. La dissociation est protégée, ferme les sessions et
ne supprime pas le mot de passe local. La révocation de l'autorisation dans les
paramètres GitHub/GitLab reste distincte de la dissociation locale.

Les tests vérifient les échanges et callbacks avec un transport fournisseur
contrôlé et une vraie base PostgreSQL. Aucun secret d'application externe n'a été
fourni pour valider une connexion interactive réelle : ces deux connexions restent
à configurer et à vérifier chez les fournisseurs avant d'être déclarées opérationnelles.

## Export et suppression

L'export personnel JSON schemaVersion=1 demande une réauthentification. Il contient
le profil, les métadonnées des sessions/clés/identités, adhésions, événements des
90 derniers jours, métadonnées des confirmations et de la 2FA, projets personnels
et leurs rapports enregistrés. Les projets partagés sont seulement référencés.
Il exclut mots de passe, condensats, jetons, secrets/codes 2FA, extraits de code,
sources temporaires et rapports des équipes. Limites synchrones : 500 projets
personnels, 5 000 analyses, 10 000 événements et 32 Mio. La taille des JSON des
rapports est vérifiée dans PostgreSQL avant chargement en mémoire de l'API.
Un dépassement donne 413 sans export partiel.
Le snapshot utilise une transaction RepeatableRead.

Supprimer le compte exige mot de passe, second facteur si actif et le texte
SUPPRIMER. Suppression irréversible des projets personnels, rapports, sessions,
clés, preuves, identités et journal du compte. Une analyse personnelle QUEUED ou
RUNNING bloque la suppression ; l'annuler ou attendre sa fin d'abord. Les sources
temporaires restent gérées par le nettoyage contrôlé et la reprise du worker.
Les projets et rapports partagés restent aux équipes ; leur attribution historique
au compte supprimé devient nulle. Il faut conserver un autre administrateur pour
une équipe active. Une équipe vide dont on est l'unique membre peut être supprimée
avec le compte. Les contrôles et la suppression sont dans une transaction Serializable.

## Journal, migration et limites

Événements de connexion, récupération, changements de profil/adresse/mot de passe,
2FA, identités externes, révocations et exports. Pagination de 20 éléments, isolation
par compte, aucune adresse IP, mot de passe, cookie ou secret dans les événements.
Rétention 90 jours ; purge des anciennes lignes à l'écriture ou à la consultation,
et suppression en cascade avec le compte. Les événements antérieurs au déploiement
ne sont pas reconstruits. Les connexions réussies sont journalisées dans la même
transaction que la création de leur session.

Migration additive 20261031000900_account_security : nouvelles tables dédiées,
emailVerifiedAt nul pour les comptes existants, authVersion=0 pour comptes et sessions,
attribution du créateur d'équipe nullable. Le changement de version invalide une
session obsolète même si une connexion concurrente tente de la recréer après une
rotation du mot de passe ou une déconnexion globale. Les clés CI restent refusées
sur les endpoints du compte. Les quotas de connexion existants sont conservés ;
confirmation 2FA et actions sensibles sont également limitées.

Ce module n'est pas une certification de sécurité ou de conformité juridique.
La messagerie Internet, OAuth chez les fournisseurs, HTTPS en déploiement,
gestion/sauvegarde des clés et revue indépendante restent à vérifier. Les tests
navigateur exécutés couvrent Chromium. Les limites natives Windows déjà observées
restent documentées ; aucune protection système n'a été désactivée.
