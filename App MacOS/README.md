# Open RIG — App macOS (Electron)

## Développement

1. Lancer le projet web normalement (depuis la racine) :
   ```bash
   npm run dev      # Vite sur :5173
   npm run server   # Express sur :3001
   ```

2. Dans ce dossier, installer les dépendances Electron :
   ```bash
   npm install
   ```

3. Lancer l'app desktop :
   ```bash
   npm start
   ```

L'app Electron se connecte automatiquement à Vite (:5173).
Si Vite n'est pas lancé, elle tente Express (:3001).

---

## Build — Générer un .dmg

1. Construire le frontend d'abord (depuis la racine) :
   ```bash
   npm run build
   ```

2. Générer le .dmg (depuis ce dossier) :
   ```bash
   npm run build
   ```

Le fichier `.dmg` sera dans `release/`.

---

## Notes

- Aucune signature Apple requise (usage interne / GitHub)
- Si macOS bloque l'ouverture : clic droit → Ouvrir, ou `xattr -cr /Applications/Open\ RIG.app`
- Icône : placer `resources/icon.icns` (macOS) et `resources/icon.ico` (Windows)
