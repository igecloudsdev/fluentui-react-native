// @ts-check
import * as path from 'node:path';
import * as fs from 'node:fs';
import { URL, fileURLToPath } from 'node:url';
import semverCoerce from 'semver/functions/coerce.js';
import { getAllPackageJsonFiles } from 'workspace-tools';

const OUTPUT_FILE = fileURLToPath(new URL("src/index.js", import.meta.url));

const CAPABILITY_MAP = {
  // empty for now
};

/**
 * Returns the contents of the file at specified path.
 * @param {string} path
 * @returns {string}
 */
function readFile(path) {
  return fs.readFileSync(path, { encoding: 'utf-8' });
}

const { name: thisPackageName, devDependencies } = JSON.parse(readFile('./package.json'));

const packages = {};

// Look for react-native capabilities
for (const [name, capability] of Object.entries(CAPABILITY_MAP)) {
  if (name in devDependencies) {
    packages[capability] = { name, version: devDependencies[name] };
  }
}

const workspacePackages = getAllPackageJsonFiles(OUTPUT_FILE)?.sort() ?? [];
for (const manifestPath of workspacePackages) {
  const { name, version, private: isPrivate, devOnly } = JSON.parse(readFile(manifestPath));
  if (isPrivate || name === thisPackageName || name === '@fluentui-react-native/codemods') {
    continue;
  }

  if (!name) {
    throw new Error(`${manifestPath} is missing 'name'`);
  }
  if (!version) {
    throw new Error(`${manifestPath} is missing 'version'`);
  }

  packages[name] = { name, version, devOnly };
}

const { major, minor } = semverCoerce(devDependencies['react-native']) ?? {};

// When updating FURN to a new react-native version, save the profile for
// the current react-native version in index.js to a new file under src named
// "furn-profile-X.Y.js" and add that profile here. For example:
const profiles = { [`${major}.${minor}`]: packages };
for (const filename of fs.readdirSync("./src").sort().reverse()) {
  if (!filename.startsWith("furn-profile-")) {
    continue;
  }

  const { default: profile } = await import(`./src/${filename}`);
  for (const [key, value] of Object.entries(profile)) {
    profiles[key] = value;
  }
}

const source = [
  `// This file was generated by '${path.basename(import.meta.url)}'`,
  '/* eslint-disable */',
  `module.exports = ${JSON.stringify(profiles, undefined, 2)};`,
  '',
].join('\n');

if (readFile(OUTPUT_FILE) !== source) {
  fs.writeFileSync(OUTPUT_FILE, source);
} else {
  console.log('✨  Already up to date');
}
