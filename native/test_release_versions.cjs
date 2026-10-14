const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
const version = read('macos/Info.plist').match(/CFBundleShortVersionString<\/key><string>([^<]+)/)[1];
for (const [file, pattern] of [
  ['world_clock_widget.py', /APP_VERSION = "v([^"]+)"/],
  ['native/webview_host.cpp', /kVersion\[\] = L"v([^"]+)"/],
  ['WorldClockWidget.iss', /MyAppVersion "([^"]+)"/],
]) assert.equal(read(file).match(pattern)[1], version, file);
const numbers = version.split('.').map(Number).concat(0);
for (const key of ['FILEVERSION', 'PRODUCTVERSION'])
  assert.deepEqual(read('native/version.rc').match(new RegExp(key+' ([0-9,]+)'))[1].split(',').map(Number), numbers);
for (const key of ['filevers', 'prodvers'])
  assert.deepEqual(read('version_info.txt').match(new RegExp(key+'=\\(([^)]+)'))[1].split(',').map(Number), numbers);
for (const file of ['native/version.rc', 'version_info.txt'])
  for (const key of ['FileVersion', 'ProductVersion']) assert.ok(read(file).includes(`${key}', '${version}.0'`) || read(file).includes(`"${key}", "${version}.0\\0"`));
assert.ok(read('WorldClockWidget.iss').includes(`VersionInfoVersion=${version}.0`));
assert.ok(read('RELEASE_NOTES.md').startsWith(`## v${version}`));
assert.ok(fs.existsSync(path.join(__dirname, '..', 'release', `WorldClockWidget-Setup-v${version}.exe`)));
console.log(`All release versions and Windows asset agree: v${version}.`);
