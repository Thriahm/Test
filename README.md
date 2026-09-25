# Vidéothèque

Site web statique qui répertorie et lit des vidéos hébergées avec le site.
Aucune dépendance, aucun build, aucune clé d'API : trois fichiers (HTML, CSS,
JS) et un catalogue généré automatiquement à partir de vos fichiers.

> Le dépôt contient aussi **[Undercover](undercover/)**, un jeu d'ambiance à
> jouer à plusieurs sur un seul téléphone (voir `undercover/README.md`).

## Fonctionnalités

- Grille de vignettes avec miniature extraite de la vidéo (aperçu animé au survol)
- Recherche instantanée (titre, description, catégorie, tags) — raccourci `/`
- Filtres par catégorie et tris (récentes, anciennes, titre, durée)
- Lecteur plein cadre : navigation vidéo suivante / précédente, enchaînement
  automatique en fin de lecture, téléchargement
- Reprise de lecture là où vous vous êtes arrêté, et barre de progression sur
  les vignettes (stockage local du navigateur, rien n'est envoyé ailleurs)
- Lien direct partageable vers une vidéo (`index.html#v=identifiant`)
- Responsive, thème clair/sombre suivant les réglages du système

## Mise en route

```bash
# 1. Déposez vos vidéos (sous-dossier = catégorie)
cp ~/mes-videos/*.mp4 videos/

# 2. Générez le catalogue
node scripts/generate-catalog.mjs

# 3. Ouvrez le site en local
python3 -m http.server 8000
#   puis http://localhost:8000
```

> Ouvrir `index.html` par double-clic fonctionne aussi, mais certains
> navigateurs limitent la lecture des fichiers en `file://` : préférez le
> petit serveur local ci-dessus.

## Organisation des fichiers

```
index.html                  page unique
assets/css/style.css        styles
assets/js/app.js            recherche, filtres, lecteur
data/videos.js              catalogue généré (éditable à la main)
videos/                     vos fichiers vidéo
posters/                    miniatures optionnelles
scripts/generate-catalog.mjs  scan du dossier videos/
```

## Le catalogue

`data/videos.js` contient un tableau d'objets. Le générateur remplit `src`,
`size`, `duration`, et devine un titre, une catégorie et une date ; vous pouvez
tout affiner à la main — **vos modifications sont conservées** lors des
régénérations suivantes.

```js
window.VIDEO_CATALOG = [
  {
    "id": "videos-tutoriels-premiers-pas",
    "title": "Premiers pas",
    "description": "Présentation de l'interface en 5 minutes.",
    "category": "Tutoriels",
    "tags": ["débutant", "interface"],
    "src": "videos/Tutoriels/premiers-pas.mp4",
    "poster": "posters/premiers-pas.jpg",
    "duration": 312,
    "size": 48210432,
    "date": "2026-02-14",
    "source": ""
  }
];
```

| Champ | Rôle |
| --- | --- |
| `id` | identifiant du lien direct `#v=…` |
| `title`, `description` | affichés sur la vignette et dans le lecteur |
| `category` | alimente les filtres |
| `tags` | pris en compte par la recherche |
| `src` | chemin du fichier (relatif au site) ou URL |
| `poster` | miniature ; vide = image extraite de la vidéo |
| `duration` | secondes ; `null` = mesurée par le navigateur |
| `date` | date affichée et utilisée pour le tri |
| `source` | lien « Ouvrir la source » optionnel (page d'origine) |

Vous pouvez aussi ajouter une entrée entièrement à la main, sans passer par le
générateur : c'est du simple JavaScript.

## Formats vidéo

`.mp4` (H.264 + AAC) est lu par tous les navigateurs. `.webm` et `.ogv`
également. Un `.mov`, ou un `.mp4` encodé en HEVC, peut rester noir selon le
navigateur — reconvertissez-le :

```bash
ffmpeg -i entree.mov -c:v libx264 -crf 23 -preset medium -c:a aac sortie.mp4
```

Si `ffprobe` est installé, le générateur relève les durées exactes ; sinon le
navigateur les mesure au premier affichage.

## Mise en ligne

Le site est entièrement statique : n'importe quel hébergeur de fichiers
convient (GitHub Pages, Netlify, Cloudflare Pages, un simple dossier Apache ou
nginx). Publiez la racine du dépôt.

**Attention au poids des vidéos.** GitHub refuse les fichiers de plus de 100 Mo
et GitHub Pages plafonne à 1 Go par site. Pour des vidéos volumineuses :

- suivez-les avec [Git LFS](https://git-lfs.com) —
  `git lfs install && git lfs track "videos/**"` ;
- ou laissez les fichiers hors du dépôt, téléversez-les directement chez
  l'hébergeur, et pointez `src` vers leur URL.

## Confidentialité

Tout se passe dans le navigateur du visiteur : pas de compte, pas de traceur,
pas d'appel réseau vers un service tiers. La position de lecture est le seul
élément mémorisé, dans le stockage local du navigateur.
