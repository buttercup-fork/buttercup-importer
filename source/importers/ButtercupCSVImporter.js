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
// Attributes that link to another entry by its ID (B-681)
const LINK_ATTRIBUTE = new RegExp(
    `^(${Entry.Attributes.PropertyLinkPrefix}|${Entry.Attributes.LoginEntry}$)`,
);
// The exporter puts one extra ' before a cell a spreadsheet would run as a
// formula (= + - @, tab or CR, after any number of quotes); one is removed
// here so the value comes back as it was (B-678)
const ESCAPED_FORMULA_CELL = /^'+[=+\-@\t\r]/;

function unescapeFormulaCell(cell) {
    return typeof cell === "string" && ESCAPED_FORMULA_CELL.test(cell)
        ? cell.slice(1)
        : cell;
}

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
            // Entries get new IDs, so links are set once every entry exists
            const entriesByFileID = new Map();
            const duplicateFileIDs = new Set();
            const links = [];
            // Skip the BOM the export starts with (for Excel), or the first
            // column would be "\uFEFF!type" and no row would have a type
            const rows = csvparse(this._csvData, {
                bom: true,
                columns: (header) => header.map(unescapeFormulaCell),
                on_record: (record) =>
                    Object.fromEntries(
                        Object.entries(record).map(([key, value]) => [
                            key,
                            unescapeFormulaCell(value),
                        ]),
                    ),
            });
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
                    links.push(
                        ...setEntryAttributes(entry, bcupItem["!attributes"]),
                    );
                    const fileID = bcupItem.id;
                    if (fileID) {
                        if (entriesByFileID.has(fileID)) {
                            duplicateFileIDs.add(fileID);
                        }
                        entriesByFileID.set(fileID, entry);
                    }
                } else {
                    throw new Error(
                        `Unrecognised item type in import: ${itemType}`,
                    );
                }
            });
            duplicateFileIDs.forEach((fileID) =>
                entriesByFileID.delete(fileID),
            );
            links.forEach((link) => setEntryLink(link, entriesByFileID));
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
 * Links to other entries (linked fields, login entry) are returned instead
 * of set: they name entry IDs from the file, see {@link setEntryLink}
 * @param {Entry} entry The new entry
 * @param {String=} attributesJSON The column value
 * @returns {Array.<{entry: Entry, name: String, value: String}>} The links
 * @private
 */
function setEntryAttributes(entry, attributesJSON) {
    const links = [];
    if (!attributesJSON) return links;
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
            if (LINK_ATTRIBUTE.test(name)) {
                links.push({ entry, name, value: attributes[name] });
            } else {
                entry.setAttribute(name, attributes[name]);
            }
        });
    return links;
}

/**
 * Set a link attribute (`BC_ENTRY_PROPERTY_LINK:<field>`, value
 * `<entry ID>:<field>`, or `BC_ENTRY_LOGIN_ENTRY`, value
 * `<entry ID>[:<title>]`) with the linked entry's new ID
 * A link is kept only when its entry is in the same file, under an ID no
 * other row has. A link to any other ID would point at an entry in the
 * vault the file is imported into, and show that entry's values (eg. its
 * password) on the imported entry (B-681). The entry keeps the field's own
 * value from the file, which the export writes as the linked value.
 * @param {{entry: Entry, name: String, value: String}} link The link
 * @param {Map.<String, Entry>} entriesByFileID The imported entries by the
 *  IDs they have in the file
 * @private
 */
function setEntryLink({ entry, name, value }, entriesByFileID) {
    // Entry IDs contain no colons, field names and titles may
    const separator = value.indexOf(":");
    const fileID = separator >= 0 ? value.slice(0, separator) : value;
    const rest = separator >= 0 ? value.slice(separator) : "";
    const target = fileID ? entriesByFileID.get(fileID) : undefined;
    if (!target) return;
    if (name === Entry.Attributes.LoginEntry && target === entry) return;
    entry.setAttribute(name, `${target.id}${rest}`);
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
