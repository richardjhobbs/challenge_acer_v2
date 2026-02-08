# Acer Challenge

Acer Challenge is a numbers game where you reveal six tiles, roll a target, and build arithmetic steps to reach the target.

## Local development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Production build

```bash
npm run build
npm run start
```

## Deploying to Vercel

1. Push the repository to GitHub.
2. Import the repo in Vercel.
3. Use the default Next.js build settings (`npm run build`).
4. Deploy.

No extra configuration is required.

## Speech synthesis support

The solo game uses the browser's `speechSynthesis` voices when available. If no English voice is available, gameplay still works,
but speech lines are silent. Voice playback only begins after the user clicks "Reveal round" or after the timer starts.

## Next steps for multiplayer

- Introduce server-issued seeds to drive RNG for tile and target generation.
- Sync round payloads (tiles, target, seed) over WebSockets.
- Add server-side validation for submitted steps and scoring.

## Manual QA checklist

- Reveal flow works (tiles flip, target rolls, target locks).
- Voices only speak after clicking the reveal button.
- Timer starts only when "Start timer" is pressed.
- Tile operations enforce rules and errors.
- Lock-in works and scores are recorded.
- History persists across reloads.
- Best answer displays after lock-in or time end.
