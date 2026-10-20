# Testing Rangefinder

Run the regression suite with Node.js 24 or newer:

```powershell
npm test
```

For a local build, set `GOOGLE_MAPS_JS_API_KEY`, run `npm run build`, and serve `dist` over localhost. Test the deployed GitHub Pages URL over HTTPS for real phone sensors and live Google Maps/Places.

## Gameplay and saved progress

- Guess a known nearby place. Distance and direction percentages on the answer screen should match its discovery details. A 90° direction error earns 0% direction accuracy; a correct distance can still earn 100% distance accuracy. The overall score measures how close the guessed point is to the target.
- Check a short distance such as 100 metres versus 149 metres. Local distances display in metres, and scoring uses the original coordinates and distances.
- Lock distance and direction independently, then submit. Practice mode should update feedback without adding attempts or changing the saved result.
- Play locations that share a name. Their discovery markers, best scores, and attempt histories should remain separate.
- Export a backup, delete progress, then import the backup. Scores, discoveries, and custom places should return. Importing malformed JSON or invalid coordinates should show a message and keep current progress.
- Delete the final custom place, close the app, and reopen it. The app should select World Capitals and remain playable. Past results remain in the backup.

Older name-keyed progress migrates to coordinate IDs. Separate histories can be recovered when the original score history still contains them. Ambiguous aggregates and malformed records are retained in the backup's `recovery` section rather than attributed to the wrong place. Historical overall scores are preserved; distance and direction subratings are recalculated from recorded coordinates and guesses.

Progress is saved in one snapshot so imports cannot leave partially replaced history and discoveries. If storage is full, a new result remains available in the current session and in an exported backup. Export before closing the app when a save warning appears.

## Small screens and startup

- At 320×568, reach every main-menu action. Open Settings and swipe to Export, Import, and Delete All Data. The header and Back button should remain reachable. Check keyboard focus and dark mode too.
- A fresh install starts with World Capitals. A saved dataset selection should be restored. Other datasets load when selected, and maximum range is remembered separately for each dataset.
- After one complete online visit, reopen offline. Cached data should load; an unavailable selected dataset should fall back to the bundled capitals. If no data is available, Try Again and Settings should remain accessible.
- Location access should be requested through the permission button. GPS watches should stop outside gameplay and the main menu, and while the page is hidden. Each result should use the position captured at the start of that round.

Verify Safari on an iPhone and Chrome on an Android phone. Automated compass checks simulate readings and do not replace physical device testing.
