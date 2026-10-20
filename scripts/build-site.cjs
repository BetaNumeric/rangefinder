const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function buildSite({ apiKey, outputDirectory = path.join(__dirname, '..', 'dist') }) {
  if (!apiKey?.trim()) throw new Error('Set GOOGLE_MAPS_JS_API_KEY before building the site.');
  const root = path.resolve(__dirname, '..');
  const output = path.resolve(outputDirectory);
  if (output === root || root.startsWith(output + path.sep)) throw new Error('Build output must not contain the source directory.');
  fs.mkdirSync(output, { recursive: true });
  const scripts = fs.readdirSync(root).filter(name => name.endsWith('.js') && name !== 'config.js' && name !== 'sw.js');
  const files = ['index.html', 'manifest.json', ...scripts];
  for (const file of files) fs.copyFileSync(path.join(root, file), path.join(output, file));
  for (const folder of ['assets', 'libraries']) fs.cpSync(path.join(root, folder), path.join(output, folder), { recursive: true });
  fs.writeFileSync(path.join(output, 'config.js'), 'window.RANGEFINDER_CONFIG = ' + JSON.stringify({ googleMapsApiKey: apiKey.trim() }) + ';\n');
  const hash = crypto.createHash('sha256');
  const assetFiles = fs.readdirSync(path.join(root, 'assets', 'images')).map(name => 'assets/images/' + name);
  const shell = [...files, 'config.js', 'libraries/p5.min.js', ...assetFiles];
  for (const file of shell) hash.update(fs.readFileSync(path.join(output, file)));
  const worker = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  hash.update(worker);
  fs.writeFileSync(path.join(output, 'sw.js'), worker.replace('__BUILD_ID__', hash.digest('hex').slice(0, 16)));
  return output;
}

if (require.main === module) {
  try { console.log('Built site: ' + buildSite({ apiKey: process.env.GOOGLE_MAPS_JS_API_KEY })); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { buildSite };
