# Buttercup importer changelog

## Unreleased (codekunde fork)

 * **Feature**:
   * [#64](https://github.com/buttercup/buttercup-importer/issues/64) / [#60](https://github.com/buttercup/buttercup-importer/issues/60) Buttercup CSV round trip: entries keep their type (website, note, credit card, SSH key) and their attributes (field value types such as multi-line notes and OTP, field order, tags), read from the `!entry_type` and `!attributes` columns that the exporter fork now writes. Before, every re-imported entry became a login, and a website's URL showed up as a custom `url` field. CSVs without these columns still import, as logins. An unknown entry type or attributes that aren't a JSON object fail the import with a message naming the entry; attachment references, the entry type and `__proto__`/`constructor`/`prototype` keys in `!attributes` are ignored
 * Specs: the Buttercup CSV round trip uses the `@buttercup/exporter` fork from git (was 1.1.0 from npm)
 * **Security**:
   * `csv-parse` 4 → 7: prototype pollution through the `columns` option (GHSA-8cw4-87c7-c6xx), which all three CSV importers use on the chosen file. `csv-parse/lib/sync` no longer exists, so the importers load `csv-parse/sync`. New spec: a Buttercup CSV with a `__proto__` column leaves `Object.prototype` untouched
   * `xml2js` 0.4 → 0.6: prototype pollution (GHSA-776f-qx25-q3cc), used by the KeePass XML importer
 * Babel removed: the source is plain CommonJS, so `main` now points at `source/index.js` and there's no build step. This also makes the library installable straight from git
 * Removed dead code left from the KDBX import dropped in 3.0.0: `source/crypto/argon2.js` (it required `argon2`, which isn't a dependency) and the unused `.kdbx`/`.key` test files
 * CI runs on NodeJS 22 and 24 (was 14, 16 and 18), with `actions/checkout` and `setup-node` v5
 * **Bugfix**:
   * Keeper importer (added upstream after 3.1.0, never released): records in a folder were created once per folder level, records without a folder were skipped, and folders with the same name under different parents were merged. Its specs looked for titles the test file doesn't have; they now match it, and a new spec checks each record lands once, in its folder
   * [#51](https://github.com/buttercup/buttercup-importer/issues/51) Bitwarden: organisation exports (which have `collections` instead of `folders`), items in a folder or collection that isn't in the export, and logins with `"uris": null` all crashed the import. Encrypted exports now fail with a clear message. Secure notes, cards and SSH keys become note, credit card and SSH key entries, and identity details are imported as properties (they were dropped)
   * [#40](https://github.com/buttercup/buttercup-importer/issues/40) 1Password for Windows 4 `.1pif` exports imported nothing: their items have a `category` code instead of a `typeName`, and keep the title, URL and fields under `overview`/`details`. They're now read like Mac exports. Router items were never recognised either (the type check tested the item object instead of its type name)
   * [#66](https://github.com/buttercup/buttercup-importer/issues/66) CSV and LastPass imports failed with "Invalid Closing Quote" on exports that escape quotes with a backslash (as 1Password does), or have stray quotes in unquoted fields. Standard CSV is still parsed strictly; only files that fail get a second, more lenient parse
   * LastPass: multi-line notes from Windows exports kept their `\r\n` line breaks
   * [#31](https://github.com/buttercup/buttercup-importer/issues/31) KeePass XML URLs are imported (the report was about the KDBX import removed in 3.0.0); a new spec covers it

## v3.1.0
_2020-10-26_

 * Native Node FS promises over `pify` library
 * **Bugfix**
   * Undefined entry metadata in Bitwarden and 1Password imports
   * [#69](https://github.com/buttercup/buttercup-importer/issues/69) Empty custom fields are imported in Buttercup CSV

## v3.0.1
_2020-07-12_

 * Prevent hard failure when importing Buttercup vaults when parent/child relationships are broken

## v3.0.0
_2020-07-12_

 * Remove support for KDBX imports

## v2.0.3
_2020-07-07_

 * **Bugfix**:
   * `ButtercupCSVImporter` not importing correctly
     * CSV item type (group/entry) not detected
     * Group ID not set
     * Group parent not set

## v2.0.2
_2020-07-06_

 * **Bugfix**
   * `ButtercupCSVImporter` not exported correctly

## v2.0.1
_2020-07-06_

 * **Bugfix**
   * `package.json` `main` points to incorrect location

## v2.0.0
_2020-05-30_

 * **Major rebuild**
 * Buttercup vault importer (.bcup)
 * All importers use classes
 * Buttercup core version 4

## v1.3.0
_2020-03-31_

 * Update all dependencies
 * **Bugfix**:
   * [#54](https://github.com/buttercup/buttercup-importer/pull/54) Fix argon2 Windows builds

## v1.2.0
_2020-02-11_

 * Generic CSV importer

## v1.1.0
_2019-11-14_

 * KDBX key file support

## v1.0.0
_2019-10-02_

 * Removed Node 6 support
 * Upgrade kdbxweb to latest version (1.5.3)
 * Support argon2 for kdbxweb and KDBX version 4

## v0.15.0
_2019-07-11_

 * Bitwarden import support

## v0.14.1
_2018-07-28_

 * Add Buttercup import support (CSV)

## v0.13.0
_2018-03-15_

 * Move `buttercup` to peerDependency

## v0.12.0
_2018-03-03_

 * Upgrade kdbxweb to latest version (1.2.2)

## v0.11.0
_2018-02-27_

 * Adds support for more 1password entry types and categories

## v0.10.0
_2018-02-26_

 * Update all dependencies

## v0.9.3
_2018-02-26_

 * Fix 1Password import of empty items (unset fields)

## v0.9.2
_2017-06-18_

 * Fix Lastpass multiline values (CSV importing)

## v0.9.1
_2017-05-27_

 * Fix Lastpass empty/non-existent notes creating blank meta values

## v0.9.0
_2017-05-27_

 * Added support for exported Lastpass archives (csv)

## v0.8.0
_2017-05-05_

 * Added support for exported 1password archives (1pif)

## v0.7.0
_2017-03-13_

 * Core update to 0.35.0
   * Fix importing for special characters
   * Archives created using encoded entry values feature

## v0.6.1
_2017-01-07_

 * Bugfix: No error thrown if Keepass export password is wrong

## v0.6.0
_2017-01-07_

 * Core @ 0.33.0
   * Archive getHistory command

## v0.5.0
_2017-01-07_

 * Update Buttercup-core to 0.32.0
 * Remove file-output for importing KDBX archives
