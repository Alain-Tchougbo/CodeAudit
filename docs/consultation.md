# Consultation des analyses

Le tableau de bord `/` affiche les projets enregistrés, les analyses terminées,
les échecs techniques, les travaux en attente/en cours et les dix dernières demandes.
`GET /api/dashboard` calcule les compteurs en PostgreSQL et récupère les dernières
analyses dans une transaction à lecture cohérente. Les rapports complets ne sont
pas chargés pour cette synthèse ni pour les listes d'historique.

« Analyses réalisées » compte SUCCEEDED et FAILED. La répartition par gravité
additionne les diagnostics des analyses SUCCEEDED de tout l'historique, y compris
plusieurs analyses d'un même projet. Elle ne représente donc pas uniquement l'état
le plus récent de chaque projet. Les échecs techniques n'y contribuent pas.
Les compteurs n'apparaissent qu'après réponse de l'API ; une erreur n'est jamais
remplacée par des zéros. Aucun score de qualité ni donnée de démonstration.

Chaque page projet contient un historique paginé par curseur, vingt analyses par
page, avec actualisation manuelle. Un clic ouvre `/analyses/:id`, également
accessible directement. L'analyse est suivie toutes les trois secondes tant
qu'elle est QUEUED ou RUNNING ; ce suivi s'arrête à la fin, en cas d'erreur, au
changement de route et au démontage. Les erreurs proposent une nouvelle tentative
de lecture. FAILED présente le code et le message technique, sans inventer de rapport.

Pour un rapport disponible, la page présente les fichiers analysés et concernés,
erreurs, avertissements, entrées ignorées et erreurs de syntaxe. La durée du
traitement correspond à startedAt/finishedAt ; pendant RUNNING, le temps écoulé
est actualisé. La durée propre au moteur provient de statistics.durationMs.

Les diagnostics exposent fichier, ligne/colonne disponibles, règle, gravité et
message. Les messages sont rendus comme texte. Les positions inconnues sont
affichées « — » ; les erreurs sans règle ont un filtre dédié. Les filtres sont
combinables : gravité, chemin de fichier insensible à la casse et règle exacte.
Ils s'appliquent au rapport complet reçu, avant pagination par 20, 50 ou 100
problèmes. Leur modification réinitialise la page. Le filtrage est local au
navigateur ; le rapport reste borné par la limite serveur de 10 Mio. Les filtres
ne sont pas persistés dans l'URL.

La navigation comporte tableau de bord, projets et liens de retour. Les composants
de statut, indicateurs, listes, chargements/erreurs et diagnostics sont réutilisables.
Les contrôles ont des libellés, un focus visible et des états désactivés. La table
reste accessible par défilement horizontal sur petit écran, sans élargir la page.

Vérifications : `pnpm check`, `pnpm test:integration` et `pnpm test:e2e` avec
TEST_DATABASE_URL ciblant une base migrée dédiée terminée par `_test`.
Les tests Vue utilisent des réponses simulées uniquement dans les tests.
Le parcours Playwright crée un projet et importe un ZIP via les vrais endpoints,
démarre un vrai worker, consulte le rapport produit, filtre/pagine et vérifie
l'absence de débordement de la page à 390 pixels. Les tests d'intégration vérifient
les agrégats PostgreSQL, leur mise à jour après suppression et l'ordre de la liste.
