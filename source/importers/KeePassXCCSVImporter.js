const fs = require("fs/promises");
const { EntryPropertyValueType, Vault } = require("buttercup");
const { parseCSV } = require("../tools/csv.js");
const { addOTPProperty } = require("../tools/otp.js");
const { addProperty } = require("../tools/properties.js");

const DEFAULT_GROUP = "General";
const REQUIRED_COLUMNS = ["Group", "Title", "Username", "Password"];

/**
 * Importer for KeePassXC CSV exports (Database → Export → CSV File)
 * @memberof module:ButtercupImporter
 */
class KeePassXCCSVImporter {
    /**
     * Create a new KeePassXC CSV importer
     * @param {String} data Raw CSV data of a KeePassXC export
     */
    constructor(data) {
        this._data = data;
    }

    /**
     * Export to a Buttercup vault
     * @returns {Promise.<Vault>}
     * @memberof KeePassXCCSVImporter
     */
    export() {
        return Promise.resolve().then(() => {
            const records = parseCSV(this._data.replace(/^﻿/, ""));
            const columns = records.length > 0 ? Object.keys(records[0]) : [];
            const missing = REQUIRED_COLUMNS.filter(
                (column) => !columns.includes(column),
            );
            if (records.length > 0 && missing.length > 0) {
                throw new Error(
                    `Not a KeePassXC CSV export (missing columns: ${missing.join(", ")})`,
                );
            }
            const vault = new Vault();
            const groups = new Map();
            const getGroup = (groupPath) => {
                // The first part of the path is the database's root group
                const parts = `${groupPath || ""}`
                    .split("/")
                    .slice(1)
                    .filter(Boolean);
                if (parts.length === 0) {
                    parts.push(DEFAULT_GROUP);
                }
                let parent = vault;
                let key = "";
                parts.forEach((part) => {
                    key = `${key}/${part}`;
                    if (!groups.has(key)) {
                        groups.set(key, parent.createGroup(part));
                    }
                    parent = groups.get(key);
                });
                return parent;
            };
            records.forEach((record) => {
                const entry = getGroup(record.Group).createEntry(
                    record.Title || "Untitled entry",
                );
                entry.setProperty("username", record.Username || "");
                entry.setProperty("password", record.Password || "");
                if (record.URL) {
                    entry.setProperty("URL", record.URL);
                }
                if (record.Notes) {
                    addProperty(
                        entry,
                        "Notes",
                        record.Notes.replace(/\r\n?/g, "\n"),
                        EntryPropertyValueType.Note,
                    );
                }
                if (record.TOTP) {
                    addOTPProperty(entry, "OTP", record.TOTP);
                }
            });
            return vault;
        });
    }
}

/**
 * Load the importer from a file
 * @param {String} filename The source filename
 * @returns {Promise.<KeePassXCCSVImporter>}
 * @static
 * @memberof KeePassXCCSVImporter
 */
KeePassXCCSVImporter.loadFromFile = function (filename) {
    return fs
        .readFile(filename, "utf8")
        .then((contents) => new KeePassXCCSVImporter(contents));
};

module.exports = KeePassXCCSVImporter;
