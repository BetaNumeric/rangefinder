const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function buildSite({ apiKey, outputDirectory = path.join(__dirname, '..', 'dist') } = {}) {
  if (!apiKey?.trim()) throw new Error('Set GOOGLE_MAPS_JS_API_KEY before building the site.');
  const root = path.resolve(__dirname, '..');
  const output = path.resolve(outputDirectory);
  if (output === root || root.startsWith(output + path.sep) ||
      ['assets', 'libraries', 'scripts', 'tests', '.git', '.github'].some(folder =>
        output === path.join(root, folder) || output.startsWith(path.join(root, folder) + path.sep))) {
    throw new Error('Build output must not overwrite the source files.');
  }

  fs.mkdirSync(output, { recursive: true });
  const scripts = fs.readdirSync(root).filter(name => name.endsWith('.js') && name !== 'sw.js');
  for (const file of ['index.html', 'manifest.json', ...scripts]) {
    fs.copyFileSync(path.join(root, file), path.join(output, file));
  }
  for (const folder of ['assets', 'libraries']) {
    fs.cpSync(path.join(root, folder), path.join(output, folder), { recursive: true });
  }
  fs.writeFileSync(path.join(output, 'config.js'),
    'window.RANGEFINDER_CONFIG = ' + JSON.stringify({ googleMapsApiKey: apiKey.trim() }) + ';\n');
  fs.writeFileSync(path.join(output, '.nojekyll'), '');

  const hash = crypto.createHash('sha256');
  function hashFiles(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const filename = path.join(directory, entry.name);
      if (entry.isDirectory()) hashFiles(filename);
      else if (filename !== path.join(output, 'sw.js')) {
        hash.update(path.relative(output, filename).split(path.sep).join('/'));
        hash.update(fs.readFileSync(filename));
      }
    }
  }
  hashFiles(output);
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
