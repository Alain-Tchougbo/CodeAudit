# Seuils qualité et intégration CI

## Politique figée

Dans une fiche projet, ouvrir « Seuils qualité », activer la politique et choisir
le maximum d'erreurs et d'avertissements. Valeurs entières de 0 à 1 000 000,
seuil inclusif. Les erreurs de syntaxe sont déjà incluses dans les erreurs.
GET/PUT /api/projects/:id/quality-policy exigent propriété et session, avec CSRF
sur PUT. Une demande d'analyse copie la politique dans qualityPolicySnapshot.
Les analyses déjà demandées, y compris les rapports historiques, ne changent pas.

GET /api/analyses/:id/quality-gate retourne une décision versionnée : PASS, FAIL,
PENDING, UNAVAILABLE ou NOT_CONFIGURED, sa politique et ses compteurs réels.
L'API valide le rapport enregistré et sa cohérence avant de lire les statistiques.
Les états incomplets n'inventent aucun compteur. Le calcul v1 utilise uniquement
les seuils figés et les statistiques enregistrées ; aucune réanalyse.
FAIL est un refus qualité : l'analyse reste SUCCEEDED et son rapport disponible.
FAILED reste un échec technique. Un rapport sans politique active n'est pas
présenté comme une validation qualité réussie.

## Clés personnelles limitées à un projet

Ouvrir « Intégration CI · Clés personnelles », nommer une clé et choisir sa durée
de 1 à 90 jours, 30 par défaut. Maximum 20 clés actives par utilisateur/projet.
Copier la valeur affichée une seule fois puis la masquer. Le frontend la garde
uniquement en mémoire ; rechargement/navigation ne permettent pas de la relire.
La liste ne contient que nom, UUID public et dates. Révoquer une clé exige une
confirmation et le CSRF. Les clés expirées sont refusées et nettoyées à la création.
La récupération de mot de passe révoque aussi les clés CI du compte.

Un secret aléatoire de 32 octets est préfixé ca_. Seul son SHA-256 est conservé.
Les clés ne remplacent pas les sessions : connexion, profil, réglages, contexte
source, suppression, gestion des clés et autres routes restent sous cookie/CSRF.
Bearer est accepté seulement pour demande d'analyse ZIP, état, résultats, rapport
et décision qualité, sur le projet lié. Un autre projet du même compte est refusé.
Mélanger un cookie de session et Bearer est refusé. Les droits du compte sur le
projet sont revérifiés. Une révocation bloque les nouvelles requêtes ; une requête
déjà admise et les travaux déjà en file ne sont pas annulés implicitement.

## CLI sans dépendance d'exécution supplémentaire

Node 24.15+ est requis. Depuis le dépôt CodeAudit :

```powershell
$secret = Read-Host 'Clé CI CodeAudit' -AsSecureString
$env:CODEAUDIT_TOKEN = [System.Net.NetworkCredential]::new('', $secret).Password
try {
  pnpm audit:ci --api-url http://127.0.0.1:3000 --project UUID_DU_PROJET --archive sources.zip --report rapport.json
} finally {
  Remove-Item Env:CODEAUDIT_TOKEN
  Remove-Variable secret
}
```

La clé ne passe ni en argument ni dans une URL. Le CLI autorise HTTPS, avec HTTP
réservé à localhost/127.0.0.1/::1, refuse les redirections et borne les réponses.
Le fichier est lu avec une limite de 10 Mio, y compris s'il grossit pendant la
lecture. Les scripts/dépendances de l'archive ne sont pas exécutés.

| Code | Signification |
| --- | --- |
| 0 | Analyse réussie et seuils respectés |
| 1 | Analyse réussie, seuils dépassés |
| 2 | Erreur technique, traitement annulé/échoué, délai, clé invalide ou politique absente |

Sans politique active figée, la CI échoue explicitement avec 2. Le délai total
vaut 120 secondes, réglable par CODEAUDIT_WAIT_MS (1 seconde à 1 heure) ; polling
par CODEAUDIT_POLL_MS, défaut 1 seconde, borné de 50 ms à 10 secondes. Chaque
requête réseau est limitée à 30 secondes et au délai restant. Un délai du CLI
ne supprime pas un travail déjà accepté : il reste consultable dans l'historique.

--report écrit les octets exacts de l'export API, sans recomposition. Le fichier
adjacent rapport.json.gate.json garde séparément la décision et sa politique
versionnées. La sortie console contient seulement l'UUID d'analyse, l'état qualité
et les compteurs, jamais la clé ni les corps d'erreurs fournisseur.

## Action GitHub réutilisable

L'action composite .github/actions/codeaudit utilise Node et le CLI du dépôt,
sans installation de dépendances. Exemple à adapter dans le dépôt analysé :

```yaml
name: CodeAudit
on: workflow_dispatch
permissions:
  contents: read
jobs:
  audit:
    runs-on: self-hosted
    steps:
      - uses: actions/checkout@v4
      - run: git archive --format=zip HEAD -o sources.zip
      - uses: Alain-Tchougbo/CodeAudit/.github/actions/codeaudit@staging
        with:
          api-url: ${{ vars.CODEAUDIT_API_URL }}
          project-id: ${{ vars.CODEAUDIT_PROJECT_ID }}
          archive: sources.zip
          token: ${{ secrets.CODEAUDIT_TOKEN }}
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: codeaudit-report
          path: |
            codeaudit-report.json
            codeaudit-report.json.gate.json
          retention-days: 7
```

Définir le secret et les variables GitHub ; préférer un SHA revu au nom de branche
pour figer l'action. L'exemple utilise un runner de confiance pouvant atteindre
l'API locale. Un runner hébergé exige une API HTTPS joignable et un déploiement revu.
Ne pas exposer le secret à du code de PR non approuvé, notamment via un checkout
non fiable dans pull_request_target. Les rapports peuvent contenir des noms et
messages issus du code : choisir les droits et la conservation de leurs artefacts.

Les tests d'intégration lancent le CLI réel contre l'API et un vrai worker sur
PostgreSQL dédié, vérifient les sorties 0/1/2, les fichiers et les refus d'accès.
Ils ne prouvent pas un déploiement public HTTPS ni un workflow externe configuré
avec de vrais secrets de production. La migration 20261031000700_quality_ci ajoute
politiques, snapshots et ApiKey ; aucun projet existant ne reçoit de seuil implicite.
