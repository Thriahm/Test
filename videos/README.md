# Dossier des vidéos

Déposez ici vos fichiers vidéo, puis régénérez le catalogue :

```bash
node scripts/generate-catalog.mjs
```

## Organisation

Un sous-dossier devient une **catégorie** affichée en filtre sur le site :

```
videos/
├── Tutoriels/
│   ├── installation-du-poste.mp4
│   └── premiers-pas.mp4
├── Réunions/
│   └── 2026-01-12-comite.mp4
└── vlog-vacances.mp4        ← sans sous-dossier : « Non classé »
```

## Formats lus par les navigateurs

`.mp4` (H.264 + AAC) est le format le plus sûr, lu partout. `.webm` et `.ogv`
fonctionnent aussi. Un `.mov` ou un `.mp4` en HEVC peut ne pas s'afficher selon
le navigateur : convertissez-le avec

```bash
ffmpeg -i entree.mov -c:v libx264 -crf 23 -preset medium -c:a aac sortie.mp4
```

## Miniatures

Sans miniature, le site affiche une image extraite de la vidéo elle-même.
Pour fournir la vôtre, placez `posters/<nom-du-fichier>.jpg` (même nom que la
vidéo, sans l'extension vidéo), ou générez-les toutes :

```bash
ffmpeg -i videos/ma-video.mp4 -ss 3 -vframes 1 -vf scale=640:-1 posters/ma-video.jpg
```
