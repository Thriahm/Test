# Undercover

Jeu d'ambiance à jouer **sur un seul téléphone** qu'on se passe de main en
main. Règle fixe : **1 Undercover, 0 Mr White**. Pensé pour 4 joueurs
(de 3 à 8 possibles).

Aucune dépendance, aucun build : HTML, CSS et JS. Le jeu s'installe sur
l'écran d'accueil et fonctionne ensuite hors-ligne.

## Comment jouer

1. **Préparation** : entrez les prénoms dans l'ordre où vous êtes assis,
   choisissez un ou plusieurs thèmes, puis « Lancer la partie ».
2. **Distribution** : le téléphone passe de joueur en joueur. Chacun découvre
   son mot en secret puis le cache. Tout le monde a le même mot, sauf
   l'Undercover qui a un mot proche, et **personne ne connaît son rôle**.
3. **Indices** : l'appli tire au sort qui commence. Chacun donne un indice
   sur son mot sans le prononcer. Un joueur peut « Revoir son mot » à tout
   moment.
4. **Vote** : « 3, 2, 1 » et tout le monde pointe le plus suspect. On
   sélectionne l'éliminé et l'appli révèle son rôle.
5. On enchaîne les tours jusqu'à la victoire :
   - **Civils** : l'Undercover est éliminé → **+2 points** chacun ;
   - **Undercover** : il ne reste plus que 2 joueurs → **+10 points**.

Le classement est conservé d'une partie à l'autre (bouton « Rejouer »), et
les paires de mots déjà jouées ne ressortent pas avant d'avoir épuisé le
thème.

## Thèmes

| Thème | Exemple de paire |
| --- | --- |
| ⚔️ League of Legends | Garen / Darius |
| 🎯 Valorant | Vandal / Phantom |
| ⚡ Pokémon | Groudon / Kyogre |
| 🪄 Harry Potter | Détraqueur / Mangemort |
| 🦸 Marvel & DC | Thanos / Darkseid |
| 🌌 Star Wars | Jedi / Sith |
| 🍥 Mangas & animés | Naruto / Sasuke |
| 🎮 Jeux vidéo | Minecraft / Roblox |
| 🎬 Films & séries | Friends / How I Met Your Mother |
| 🏰 Disney & Pixar | Jafar / Scar |
| 🍕 Nourriture | Raclette / Fondue |
| 🐾 Animaux | Pingouin / Manchot |
| ⚽ Sport | Messi / Ronaldo |
| 🏠 Vie quotidienne | Instagram / TikTok |

Plus de 400 paires au total. Pour en ajouter, éditez `words.js` : chaque
thème est un objet `{ id, name, emoji, color, pairs: [["Mot A", "Mot B"], …] }`.
Le mot donné à l'Undercover est tiré au hasard dans la paire.

## Lancer le jeu

```bash
# depuis la racine du dépôt
python3 -m http.server 8000
#   puis http://localhost:8000/undercover/
```

Pour jouer sur un téléphone, publiez le dépôt sur un hébergeur statique
(GitHub Pages, Netlify…) et ouvrez `…/undercover/`. Ensuite, menu du
navigateur → « Ajouter à l'écran d'accueil » : le jeu s'ouvre alors en plein
écran, comme une appli, même sans connexion.

> Après une modification des fichiers, incrémentez `VERSION` dans `sw.js`
> pour que les téléphones récupèrent la nouvelle version.

## Fichiers

```
index.html            écrans du jeu
style.css             styles (mobile d'abord)
app.js                déroulement de la partie, votes, scores
words.js              thèmes et paires de mots
manifest.webmanifest  installation sur l'écran d'accueil
sw.js                 cache hors-ligne
icons/                icônes de l'appli
```

## Confidentialité

Tout reste dans le navigateur : prénoms, scores et partie en cours sont
enregistrés dans le stockage local du téléphone (une partie interrompue
reprend là où elle s'était arrêtée, sans jamais réafficher un mot secret).
