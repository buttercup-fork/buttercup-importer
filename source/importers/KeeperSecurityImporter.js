const fs = require("fs/promises");
const {
    Vault,
    Entry,
    createEntryFacade,
    consumeEntryFacade,
} = require("buttercup");

const DEFAULT_GROUP = "General";

/**
 * Importer for Keeper Security vaults
 * @memberof module:ButtercupImporter
 */
class KeeperSecurityImporter {
    /**
     * Create a new Keeper Security importer
     * @param {String} data Raw JSON data of a Keeper Security vault export
     */
    constructor(data) {
        this._data = data;
    }

    /**
     * Export to a Buttercup vault
     * @returns {Promise.<Vault>}
     * @memberof KeeperSecurityImporter
     */
    export() {
        const groups = {};
        return Promise.resolve().then(() => {
            const vault = new Vault();
            const ksJson = JSON.parse(this._data); // Parse the new JSON data

            // Create the root group
            const rootGroup = vault.createGroup(DEFAULT_GROUP);
            groups[null] = rootGroup;

            ksJson.records.forEach((record) => {
                // Folders are paths like "Foo\Bar"; records without one go
                // in the root group. Groups are keyed by their full path, so
                // folders with the same name under different parents stay
                // apart.
                let currentGroup = rootGroup;
                const folderPath =
                    record.folders && record.folders.length > 0
                        ? record.folders[0].folder
                        : "";
                let path = "";
                folderPath
                    .split("\\")
                    .map((folderName) => folderName.trim())
                    .filter((folderName) => folderName.length > 0)
                    .forEach((folderName) => {
                        path = `${path}\\${folderName}`;
                        if (!groups[path]) {
                            groups[path] = currentGroup.createGroup(folderName);
                        }
                        currentGroup = groups[path];
                    });

                const entry = currentGroup.createEntry(record.title);
                entry.setProperty(
                    "username",
                    record.login == null ? "" : record.login,
                );
                entry.setProperty(
                    "password",
                    record.password == null ? "" : record.password,
                );
                entry.setProperty(
                    "URL",
                    record.login_url == null ? "" : record.login_url,
                );
            });

            return vault;
        });
    }
}

/**
 * Load an importer from a file
 * @param {String} filename The file to load from
 * @returns {Promise.<KeeperSecurityImporter>}
 * @static
 * @memberof KeeperSecurityImporter
 */
KeeperSecurityImporter.loadFromFile = function (filename) {
    return fs
        .readFile(filename, "utf8")
        .then((data) => new KeeperSecurityImporter(data));
};

module.exports = KeeperSecurityImporter;
