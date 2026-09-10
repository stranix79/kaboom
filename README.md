# 💣 Kaboom

Un remake multijoueur de **Bomberman**, pensé pour se jouer en 2 clics pendant la pause de midi.
Tu crées une room, tu partages le lien, tout le monde arrive dans l'arène. **Dernier vivant gagne.**

> Projet de l'atelier [code79.com](https://code79.com) · destiné à `kaboom.stranix.net`.

## La variante : Fantômes vengeurs 👻

Quand tu meurs, tu ne quittes pas la partie : tu deviens un **fantôme** qui flotte au-dessus de
l'arène et peut, toutes les quelques secondes, lâcher une **bombe-piège** sur les survivants.
Personne ne s'ennuie en attendant la fin de la manche, et un mort peut renverser le classement.

Autres ingrédients :

- **Mort subite** : après ~55 s, l'arène s'effondre en spirale (murs qui montent de l'extérieur
  vers le centre). Les manches restent courtes et nerveuses.
- **Power-ups** : 💣 bombe en plus, ✳ portée du souffle, » vitesse.
- **Rooms publiques ou privées**, lien partageable, aucun compte requis.
- **Trois thèmes visuels** au choix : Néon terminal, Pixel rétro, Minimal flat.

## Architecture

Serveur **autoritatif** (il simule la partie, le client ne fait qu'afficher et envoyer les touches) :

```
server/
  server.js   HTTP statique (sert public/) + WebSocket + gestion des rooms + boucle 20 Hz
  game.js     toute la logique d'une partie (grille, bombes, explosions, power-ups, fantômes, mort subite)
public/
  index.html  les 3 écrans : accueil / lobby / jeu
  client.js   connexion WebSocket, écrans, entrées clavier + tactiles, boucle de rendu
  render.js   dessin de l'arène sur <canvas>
  themes.js   les 3 palettes/styles
```

- **Pas de base de données** : les rooms vivent en mémoire, elles disparaissent quand elles se vident.
- **Protocole** : JSON sur WebSocket. Le serveur diffuse l'état complet ~20×/seconde (grille petite,
  quelques joueurs → largement suffisant). Le client interpole les positions pour un rendu fluide.
- Serveur autoritatif = **pas de triche** possible côté client, et synchro propre entre joueurs.

## Lancer en local

```
npm install
npm start          # http://localhost:3000  (npm run dev pour le rechargement auto)
```

Ouvre deux onglets pour tester le multijoueur, ou passe le lien `?room=CODE` à un collègue.

**Contrôles** : flèches ou WASD pour bouger, espace pour poser une bombe. Sur mobile, un pad
tactile et un bouton bombe apparaissent automatiquement.

## Déploiement sur hawking

L'app écoute en interne sur `3000`. C'est `ghost_nginx` qui publie `kaboom.stranix.net` en HTTPS
et proxifie vers le conteneur. Points d'attention :

1. Créer le vhost nginx pour `kaboom.stranix.net` avec le **support WebSocket** (sinon la partie ne
   se connecte pas) :

   ```nginx
   location / {
       proxy_pass http://kaboom:3000;
       proxy_http_version 1.1;
       proxy_set_header Upgrade $http_upgrade;
       proxy_set_header Connection "upgrade";
       proxy_set_header Host $host;
       proxy_read_timeout 3600s;
   }
   ```

2. Ajouter le record DNS Cloudflare `kaboom.stranix.net` → hawking, puis émettre le certificat
   Let's Encrypt (même procédure que les autres sous-domaines publics).
3. Adapter le nom du réseau Docker dans `deploy/hawking/compose.yml` (`nginx_net`) à celui réellement
   utilisé par `ghost_nginx`, puis `docker compose -f deploy/hawking/compose.yml up -d --build`.

## Sons personnalisés (optionnel)

Le rire et l'explosion sont synthétisés (WebAudio, aucun fichier requis). Pour un
vrai rire de voix humaine facon Halloween, ou un bruit d'explosion a toi, depose
un fichier :

- `public/laugh.mp3` : rire joue a la place du cackle synthetise (touche L / bouton 😈)
- `public/boom.mp3` : bruit d'explosion

Ils sont detectes automatiquement (via `/assets.json`) et joues a travers la reverb.
Utilise ta propre voix, ou un son libre de droits (CC0 / Pixabay).

## Idées pour la suite

- Classement / séries de victoires persistants (Redis).
- Bombes lançables (power-up « kick » / « throw »).
- Mode équipes, emotes, spectateur.
- Sons et petites vibrations sur explosion.
