# Tsugi

Carnet personnel de mangas et d’animés, en français. Interface volontairement sobre : bibliothèque, recherche, progression et trophées.

**Site : https://feuille2cedric.github.io/manga-tracker/**

## Utilisation

- Explorer le catalogue Kitsu, ajouter une série, puis cliquer sur **+1 chapitre** ou ouvrir sa fiche pour saisir directement sa progression.
- Classer en cours, à jour, terminé, à lire/voir, en pause ou abandonné.
- Ouvrir une fiche manga pour accéder à ses adaptations animées. Chaque saison/adaptation a sa progression indépendante ; aucun mélange entre chapitres et épisodes.
- Retrouver 200 trophées et les statistiques dans l’onglet Trophées.
- Ajouter les titres absents manuellement. Un total personnalisé remplace le total automatique jusqu’à ce que le champ soit vidé.
- Exporter/importer sa bibliothèque JSON depuis le menu **···**. L’import fusionne les titres absents, sans écraser les progressions déjà présentes.

## Compte et sauvegarde

Même Supabase et même système d’authentification que Curio et Mes Apps : e-mail/mot de passe, inscription, récupération, changement du mot de passe, session partagée sur l’origine GitHub Pages. Aucun nouveau compte nécessaire si un compte existe déjà.

La bibliothèque utilise le document privé `tsugi` dans `personal_app_state`, isolé par RLS, avec comparaison de révision et historique serveur. Tsugi fusionne les changements par titre : les ajouts indépendants sont réunis, les champs distincts sont conservés, deux avancées simultanées gardent le chapitre le plus élevé. Une correction vers un chapitre inférieur sur un seul appareil reste respectée. Pour les autres changements simultanés du même champ, la modification la plus récente est retenue (horloge des appareils). Une suppression simultanée à une modification conserve le titre modifié ; une suppression seule se propage normalement.

Les modifications enregistrées restent dans le stockage local jusqu’à confirmation du serveur, même après rechargement. Le compteur des modifications en attente est calculé par comparaison avec la dernière version confirmée. Envoi après modification, au retour sur l’onglet et au rétablissement du réseau ; contrôle toutes les 15 secondes. Les fiches ouvertes ne bloquent plus les envois, et les brouillons non enregistrés ne sont pas remplacés. Les trois dernières fusions concurrentes sont sauvegardées localement avant résolution et exportables depuis Mon compte. Si cette sauvegarde ou la validation échoue, la résolution automatique s’arrête sans remplacer les données. La déconnexion masque les données du compte ; pour changer de compte, utiliser un autre profil de navigateur.

Sans compte, la bibliothèque reste locale. Une fois connecté, attendre **✓ Synchronisé** avant de changer d’appareil. Les couvertures et métadonnées publiques sont un cache reconstructible, distinct des progressions privées.

## Catalogue et actualisation

- [Kitsu](https://kitsu.app/) fournit recherche, couvertures, titres, totaux et relations manga/animé. [Documentation API](https://kitsu.docs.apiary.io/).
- [MangaUpdates](https://www.mangaupdates.com/) fournit le dernier numéro de chapitre recensé. Une correspondance de titre unique et exacte est associée automatiquement aux mangas en cours sans total définitif. Sinon, choisir la fiche depuis **Suivre les nouveaux chapitres avec MangaUpdates**.
- La fonction `manga-catalog` exige un JWT vérifié et un utilisateur valide pour les appels applicatifs. Les visiteurs peuvent consulter Kitsu directement en lecture seule, mais le suivi MangaUpdates et le cache serveur nécessitent une connexion.
- Le catalogue public est conservé dans `tsugi_catalog`. Une tâche Supabase Cron démarre une fois par jour à 04 h UTC et traite les fiches arrivées à échéance par lots de six, avec un intervalle minimum de 24 heures par fiche. Elle fonctionne site fermé. Le bouton de vérification est également limité à une fois par jour (Europe/Paris).
- Le job utilise un secret distinct dans `tsugi_job_config`, inaccessible aux utilisateurs, et un JWT anon public pour la vérification de passerelle. La clé service reste exclusivement dans l’environnement de la fonction. Les utilisateurs ordinaires ne peuvent pas déclencher ce job ni écrire directement au catalogue.
- Une source indisponible conserve sa dernière valeur connue. Une valeur inconnue reste `?`. Les compteurs ne garantissent pas la disponibilité d’une traduction française ni une mise à jour immédiate lors de la publication officielle.
- Les épisodes d’une série en diffusion sont comptés comme disponibles uniquement lorsque Kitsu fournit une date passée. Sinon le total disponible reste inconnu ; le total annoncé figure dans la fiche. Kitsu peut ne pas renseigner tous les épisodes ou toutes les adaptations.
- Des sources peuvent compter différemment les chapitres bonus (par exemple Dragon Ball). L’app affiche le total de sa source, avec possibilité de correction personnelle, sans inventer de total universel.

Les fiches et résumés peuvent être en anglais. Aucun scan ni épisode vidéo n’est hébergé.

## Développement

```powershell
python -m http.server 3366 --bind 127.0.0.1 --directory site
node --test tests/*.test.cjs tests/*.test.mjs
```

`scripts/test_ui.py` utilise Playwright avec Edge et des données simulées. `scripts/test_live.py` teste la vraie base avec deux comptes jetables (supprimés après le test), l’isolation, la protection contre les révisions obsolètes et les sources réelles. Il récupère les clés nécessaires en mémoire via la CLI Supabase ; ne jamais les ajouter au code.

`site/` est le seul dossier publié. GitHub Actions exécute les tests de domaine et publie GitHub Pages. Le SDK Supabase est livré localement avec sa licence et son fichier de provenance.

## Backend

Les migrations dans `supabase/migrations/` ont été appliquées au projet existant. La première exige la présence du schéma partagé Curio/Mes Apps et doit être appliquée une seule fois. Elle étend uniquement l’espace d’apps autorisées, sans modifier les documents existants. Ne pas rejouer aveuglément les migrations.

Déploiement de la fonction :

```powershell
supabase functions deploy manga-catalog --project-ref kzdvpbbjvjbxnsamdnao --use-api
```

Conserver `verify_jwt = true`. La redirection `https://feuille2cedric.github.io/manga-tracker/` est ajoutée à la liste Supabase sans retirer celles des autres apps. Les limitations du service e-mail/SMTP existant restent celles du projet partagé.

## Fonctions de bibliothèque

- Sélection multiple de mangas et animés pour changer leur catégorie sans modifier leur progression. Compteurs par catégorie et tri par nombre de chapitres/épisodes ; les totaux inconnus restent à la fin.
- Onglet Liens : favoris de lecture privés, synchronisés et inclus dans les exports.
- Tomes : import du découpage Kitsu uniquement si les chapitres et volumes forment une correspondance cohérente. Si les données sont absentes ou incomplètes, seul le suivi par chapitre est proposé. Un clic sur « Tome terminé » avance au dernier chapitre connu du tome, sans saisie de correspondance.
- Animés : charger les saisons/suites TV et ONA liées, vérifier la liste et marquer les premières comme terminées. Chaque fiche conserve ses épisodes ; films et spéciaux exclus. Un découpage manuel est aussi possible.
- Les classifications explicites adultes/pornographiques des sources sont exclues des recherches, relations et fiches. Ce filtrage dépend de la qualité des classifications des catalogues.
- La synchronisation ne retire plus le focus des champs de recherche.
