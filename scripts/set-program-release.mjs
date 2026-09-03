#!/usr/bin/env node
// Point manifest.json at one program's freshly published assets — both platforms at once.
//
// Publishing is two steps that must happen in this order: upload the assets to the GitHub
// release, THEN name them here. Done backwards, the launcher fetches a URL the release does
// not serve yet, the checksum comparison fails, and it deletes the partial download. A release
// workflow calls this only after both uploads have succeeded, so the manifest can never
// describe an asset that does not exist.
//
// Windows and macOS are written TOGETHER, deliberately. The launcher compares ONE `version`
// per program for both platforms (src/updater.mjs, planUpdates) — platformPayload swaps only
// `zip` and `bundle`, never the version. So publishing one platform on its own would leave the
// other platform's users offered a new version number attached to the previous build, and the
// launcher would record that number as installed — permanently masking the real update. This
// script requires both, which makes that mistake impossible to make quietly.
//
// Usage:
//   node scripts/set-program-release.mjs \
//     --id plotter-code-studio --version 0.2.2 \
//     --win-url URL --win-sha SHA256 --win-size BYTES \
//     --mac-bundle "Creative Coding Studio.app" --mac-url URL --mac-sha SHA256 --mac-size BYTES

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REQUIRED = [
	'id', 'version',
	'win-url', 'win-sha', 'win-size',
	'mac-bundle', 'mac-url', 'mac-sha', 'mac-size',
]

function parseArguments(argv) {
	const options = {}
	for (let i = 0; i < argv.length; i += 1) {
		if (!argv[i].startsWith('--')) continue
		const key = argv[i].slice(2)
		options[key] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[(i += 1)] : 'true'
	}
	return options
}

function fail(message) {
	console.error(`set-program-release: ${message}`)
	process.exit(2)
}

const options = parseArguments(process.argv.slice(2))
for (const key of REQUIRED) {
	if (!options[key]) fail(`missing --${key}`)
}

// Shape checks on every value that a download depends on. A 63-character sha or an http:// URL
// is the kind of thing that only shows up as a failed update on someone else's machine.
if (!/^\d+(\.\d+)*$/.test(options.version)) fail(`--version "${options.version}" is not a version number`)
for (const key of ['win-sha', 'mac-sha']) {
	if (!/^[0-9a-f]{64}$/i.test(options[key])) fail(`--${key} is not a 64-character sha256`)
}
for (const key of ['win-size', 'mac-size']) {
	if (!/^\d+$/.test(options[key]) || Number(options[key]) <= 0) fail(`--${key} must be a positive byte count`)
}
for (const key of ['win-url', 'mac-url']) {
	if (!options[key].startsWith('https://')) fail(`--${key} must be an https URL`)
}

const manifestFile = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'manifest.json')
const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'))

// The id must already exist. A typo should fail the release, not silently invent a program
// entry that no launcher has ever heard of and that nobody will notice until it is stale.
const entry = manifest.programs?.[options.id]
if (!entry) {
	fail(`unknown program id "${options.id}" — known ids: ${Object.keys(manifest.programs ?? {}).join(', ')}`)
}

entry.version = options.version
entry.zip = {
	url: options['win-url'],
	sha256: options['win-sha'].toLowerCase(),
	size: Number(options['win-size']),
}
entry.mac = {
	bundle: options['mac-bundle'],
	zip: {
		url: options['mac-url'],
		sha256: options['mac-sha'].toLowerCase(),
		size: Number(options['mac-size']),
	},
}

// Tabs and a trailing newline: match the file byte-for-byte in every respect except the values
// that changed, so a release diff shows the release and nothing else.
fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, '\t') + '\n')

console.log(`manifest: ${options.id} -> ${options.version}`)
console.log(`  win: ${path.basename(options['win-url'])}  ${options['win-size']} bytes`)
console.log(`  mac: ${path.basename(options['mac-url'])}  ${options['mac-size']} bytes`)
