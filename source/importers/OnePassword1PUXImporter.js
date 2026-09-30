const fs = require("fs/promises");
const { strFromU8, unzipSync } = require("fflate");
const {
    Entry,
    EntryPropertyValueType,
    EntryType,
    Vault,
} = require("buttercup");
const { sectionFieldToProperty } = require("../tools/1passwordEntry.js");
const { addOTPProperty } = require("../tools/otp.js");
const { addProperty } = require("../tools/properties.js");

const EXPORT_DATA = "export.data";
const ARCHIVED_GROUP = "Archived";

// 1Password item categories
const CATEGORY_LOGIN = "001";
const CATEGORY_CREDIT_CARD = "002";
const CATEGORY_SECURE_NOTE = "003";
const CATEGORY_PASSWORD = "005";
const CATEGORY_SSH_KEY = "114";

// Credit card section fields that have a place in Buttercup's card entry
const CARD_FIELDS = {
    cardholder: "username",
    ccnum: "password",
    cvv: "cvv",
    type: "type",
    expiry: "expiry",
};
const CARD_TYPES = {
    visa: "visa",
    mc: "mastercard",
    mastercard: "mastercard",
    amex: "amex",
    discover: "discover",
};

/**
 * Turn a .1pux section field ({ title, id, value: { <kind>: <value> } })
 * into a property, in the same way as .1pif section fields
 * @private
 */
function fieldToProperty(field) {
    const [kind, value] = Object.entries(field.value || {})[0] || [];
    return sectionFieldToProperty({
        k: kind,
        n: field.id,
        t: field.title,
        v: value,
    });
}

function addFieldProperty(entry, property) {
    if (property.valueType === EntryPropertyValueType.OTP) {
        addOTPProperty(entry, property.name, property.value);
    } else {
        addProperty(entry, property.name, property.value, property.valueType);
    }
}

function importCardField(entry, field) {
    const property = fieldToProperty(field);
    if (!property) {
        return;
    }
    const name = CARD_FIELDS[field.id];
    if (name === "type") {
        const brand = property.value.toLowerCase();
        entry.setProperty("type", CARD_TYPES[brand] || "generic");
    } else {
        entry.setProperty(name, property.value);
    }
}

function importSSHKey(entry, value) {
    entry.setProperty("privateKey", `${value.privateKey || ""}`);
    const metadata = value.metadata || {};
    if (metadata.publicKey) {
        entry.setProperty("publicKey", `${metadata.publicKey}`);
    }
    if (metadata.fingerprint) {
        entry.setProperty("fingerprint", `${metadata.fingerprint}`);
    }
}

function importItem(group, item) {
    const details = item.details || {};
    const overview = item.overview || {};
    const category = item.categoryUuid;
    const entry = group.createEntry(overview.title || "Untitled entry");

    if (category === CATEGORY_CREDIT_CARD) {
        entry.setAttribute(Entry.Attributes.FacadeType, EntryType.CreditCard);
    } else if (category === CATEGORY_SECURE_NOTE) {
        entry.setAttribute(Entry.Attributes.FacadeType, EntryType.Note);
    } else if (category === CATEGORY_SSH_KEY) {
        entry.setAttribute(Entry.Attributes.FacadeType, EntryType.SSHKey);
    }

    if (category === CATEGORY_LOGIN || category === CATEGORY_PASSWORD) {
        entry.setProperty("username", "");
        entry.setProperty("password", "");
    }
    (details.loginFields || []).forEach((field) => {
        if (
            field.designation === "username" ||
            field.designation === "password"
        ) {
            entry.setProperty(field.designation, `${field.value || ""}`);
        }
    });
    if (category === CATEGORY_PASSWORD && details.password) {
        entry.setProperty("password", `${details.password}`);
    }

    const urls = (overview.urls || []).map((url) => url.url);
    [...new Set([overview.url, ...urls].filter(Boolean))].forEach((url) => {
        addProperty(entry, "URL", `${url}`);
    });

    (details.sections || [])
        .flatMap((section) => section.fields || [])
        .forEach((field) => {
            const value = field.value || {};
            if (category === CATEGORY_CREDIT_CARD && CARD_FIELDS[field.id]) {
                importCardField(entry, field);
                return;
            }
            if (category === CATEGORY_SSH_KEY && value.sshKey) {
                importSSHKey(entry, value.sshKey);
                return;
            }
            const property = fieldToProperty(field);
            if (property) {
                addFieldProperty(entry, property);
            }
        });

    if (details.notesPlain) {
        if (category === CATEGORY_SECURE_NOTE) {
            entry.setProperty("note", `${details.notesPlain}`);
        } else {
            addProperty(
                entry,
                "Notes",
                `${details.notesPlain}`,
                EntryPropertyValueType.Note,
            );
        }
    }

    // Buttercup tags are letters, digits and underscores only
    const tags = (overview.tags || [])
        .map((tag) =>
            `${tag}`.replace(/[^a-zA-Z0-9_]+/g, "_").replace(/^_+|_+$/g, ""),
        )
        .filter(Boolean);
    if (tags.length > 0 && typeof entry.addTags === "function") {
        entry.addTags(...tags);
    }
}

/**
 * Importer for 1Password .1pux exports (1Password 8, and 1Password 7 on
 * Windows and Mac): a zip whose export.data holds the accounts, vaults and
 * items as JSON. Attachments (the zip's files/ folder) aren't imported.
 * @memberof module:ButtercupImporter
 */
class OnePassword1PUXImporter {
    /**
     * Create a new 1Password .1pux importer
     * @param {Buffer|Uint8Array} data The contents of the .1pux file
     */
    constructor(data) {
        this._data = data;
    }

    /**
     * Export to a Buttercup vault
     * @returns {Promise.<Vault>}
     * @memberof OnePassword1PUXImporter
     */
    export() {
        return Promise.resolve().then(() => {
            let files;
            try {
                files = unzipSync(new Uint8Array(this._data), {
                    filter: (file) => file.name === EXPORT_DATA,
                });
            } catch (err) {
                throw new Error(
                    `Not a 1Password export (.1pux): ${err.message}`,
                );
            }
            if (!files[EXPORT_DATA]) {
                throw new Error(
                    `Not a 1Password export (.1pux): ${EXPORT_DATA} is missing`,
                );
            }
            const exportData = JSON.parse(strFromU8(files[EXPORT_DATA]));
            const vault = new Vault();
            (exportData.accounts || []).forEach((account) => {
                (account.vaults || []).forEach((onePassVault) => {
                    const attrs = onePassVault.attrs || {};
                    const group = vault.createGroup(attrs.name || "1Password");
                    let archive = null;
                    (onePassVault.items || []).forEach((rawItem) => {
                        const item = rawItem.item || rawItem;
                        if (item.state === "archived") {
                            archive =
                                archive || group.createGroup(ARCHIVED_GROUP);
                            importItem(archive, item);
                        } else {
                            importItem(group, item);
                        }
                    });
                });
            });
            return vault;
        });
    }
}

/**
 * Load the importer from a file
 * @param {String} filename The .1pux file
 * @returns {Promise.<OnePassword1PUXImporter>}
 * @static
 * @memberof OnePassword1PUXImporter
 */
OnePassword1PUXImporter.loadFromFile = function (filename) {
    return fs
        .readFile(filename)
        .then((contents) => new OnePassword1PUXImporter(contents));
};

module.exports = OnePassword1PUXImporter;
