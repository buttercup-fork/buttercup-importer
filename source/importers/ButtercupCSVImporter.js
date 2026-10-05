const fs = require("fs/promises");
const { Entry, EntryType, Group, Vault } = require("buttercup");
const { parse: csvparse } = require("csv-parse/sync");

const NON_COPY_KEYS = ["id", "title"];
const ENTRY_TYPES = Object.values(EntryType);
// Attributes that can't be restored from a CSV: the type has its own column
// and attachment data isn't exported
const SKIPPED_ATTRIBUTE = new RegExp(
    `^(${Entry.Attributes.FacadeType}|${Entry.Attributes.AttachmentPrefix})`,
);
// Core refuses only this name: fields like "constructor" or "toString" are
// ordinary fields, and exports keep them
const UNSAFE_KEY = "__proto__";

/**
 * Importer for Buttercup CSV exports
 * @memberof module:ButtercupImporter
 */
class ButtercupCSVImporter {
    /**
     * Create a new Buttercup CSV importer
     * @param {String} csvData Raw CSV data of a Buttercup vault export
     */
    constructor(csvData) {
        this._csvData = csvData;
    }

    /**
     * Export to a Buttercup vault
     * @returns {Promise.<Vault>}
     * @memberof ButtercupCSVImporter
     */
    export() {
        return Promise.resolve().then(() => {
            const vault = new Vault();
            // Skip the BOM the export starts with (for Excel), or the first
            // column would be "\uFEFF!type" and no row would have a type
            const rows = csvparse(this._csvData, { bom: true, columns: true });
            rows.forEach((bcupItem) => {
                const {
                    ["!type"]: itemType,
                    ["!group_id"]: groupID,
                    ["!group_name"]: groupName,
                    ["!group_parent"]: groupParentID,
                } = bcupItem;
                let group = vault.findGroupByID(groupID);
                if (itemType === "group") {
                    if (!group) {
                        group = Group.createNew(vault, groupParentID, groupID);
                    }
                    group.setTitle(groupName);
                } else if (itemType === "entry") {
                    if (!group) {
                        throw new Error(
                            `No group found for entry import: ${groupID}`,
                        );
                    }
                    const entry = group.createEntry(bcupItem.title);
                    Object.keys(bcupItem)
                        .filter((key) => /^\!.+/.test(key) === false)
                        .filter((key) => NON_COPY_KEYS.indexOf(key) === -1)
                        .filter((key) => key !== UNSAFE_KEY)
                        .filter((key) => bcupItem[key])
                        .forEach((key) => {
                            entry.setProperty(key, bcupItem[key]);
                        });
                    setEntryType(entry, bcupItem["!entry_type"]);
                    setEntryAttributes(entry, bcupItem["!attributes"]);
                } else {
                    throw new Error(
                        `Unrecognised item type in import: ${itemType}`,
                    );
                }
            });
            return vault;
        });
    }
}

/**
 * Set an entry's type from the `!entry_type` column (older exports don't
 * have it, so their entries stay logins)
 * @param {Entry} entry The new entry
 * @param {String=} entryType The column value
 * @private
 */
function setEntryType(entry, entryType) {
    if (!entryType) return;
    if (!ENTRY_TYPES.includes(entryType)) {
        throw new Error(
            `Unrecognised entry type in import: ${entryType} (entry: ${entry.getProperty(
                "title",
            )})`,
        );
    }
    entry.setAttribute(Entry.Attributes.FacadeType, entryType);
}

/**
 * Set an entry's attributes (field value types, field order, tags etc.) from
 * the JSON in the `!attributes` column
 * @param {Entry} entry The new entry
 * @param {String=} attributesJSON The column value
 * @private
 */
function setEntryAttributes(entry, attributesJSON) {
    if (!attributesJSON) return;
    let attributes;
    try {
        attributes = JSON.parse(attributesJSON);
    } catch (err) {
        attributes = null;
    }
    if (
        !attributes ||
        typeof attributes !== "object" ||
        Array.isArray(attributes)
    ) {
        throw new Error(
            `Invalid attributes in import (not a JSON object) for entry: ${entry.getProperty(
                "title",
            )}`,
        );
    }
    Object.keys(attributes)
        .filter((name) => !SKIPPED_ATTRIBUTE.test(name) && name !== UNSAFE_KEY)
        .filter((name) => typeof attributes[name] === "string")
        .forEach((name) => {
            entry.setAttribute(name, attributes[name]);
        });
}

/**
 * Load CSV data from a file
 * @param {String} filename The file to read (CSV)
 * @returns {Promise.<ButtercupCSVImporter>}
 * @memberof ButtercupCSVImporter
 * @static
 */
ButtercupCSVImporter.loadFromFile = function (filename) {
    return fs
        .readFile(filename, "utf8")
        .then((data) => new ButtercupCSVImporter(data));
};

module.exports = ButtercupCSVImporter;
