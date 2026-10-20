# Rangefinder

A phone compass and distance guessing game. The site is static and can be hosted at a GitHub Pages project URL or at the root of a domain.

## Publish on GitHub Pages

1. In your Google Cloud project, enable **Maps JavaScript API** and **Places API (New)** and configure billing. Enable **Maps Static API** too if you use static answer maps.
2. Create a browser API key with website referrer restrictions for your Pages URL, such as `https://OWNER.github.io/REPOSITORY/*`. Limit its API access to the enabled APIs. Browser keys are visible in the published site; restrictions protect their use.
3. In the GitHub repository's **Settings → Secrets and variables → Actions**, add the secret `GOOGLE_MAPS_JS_API_KEY`.
4. Under **Settings → Pages**, choose **GitHub Actions** as the source. Push to `main` or run the **Deploy to GitHub Pages** workflow manually.

The workflow runs the regression tests, builds `dist`, and uploads only the public site files. Include the local CSV datasets and images in your commit. No backend or dependency installation is needed.

## Check and preview locally

Node.js 24 or newer is required. From PowerShell:

```powershell
npm test
$env:GOOGLE_MAPS_JS_API_KEY = 'YOUR_BROWSER_API_KEY'
npm run build
python -m http.server 8080 --directory dist
```

Visit `http://localhost:8080`. Add your local origin to your key's website restrictions when testing live maps. Never commit a configured build directory. The checked-in `config.js` contains no key; the build writes the configured copy into `dist`.

The same build works under `/rangefinder/` without rewriting URLs. Its service worker caches app files and the smaller datasets, then caches the worldwide CSV on first use. Cache versions change with published content. An update activates after all existing app tabs or installed app windows close, keeping each open session on one version.

## Phone verification

Use HTTPS on the deployed site. Test Safari on an iPhone and Chrome on an Android phone: grant location and compass access from the permission buttons, check north and tilt input, lock each guess, submit, change datasets, and reopen offline. Permission alone does not count as a working compass: the app waits for a valid absolute heading. Devices without usable compass data show a message and remain on the permissions screen.

Also verify a real place search with your configured Google Cloud project. Search requests only the selected place's name, coordinates, and address components. Maps and search failures leave navigation and dataset gameplay available.
