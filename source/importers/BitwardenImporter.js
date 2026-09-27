const fs = require("fs/promises");
const { Entry, EntryType, Vault } = require("buttercup");

const DEFAULT_GROUP = "General";

// Bitwarden item types
const ITEM_NOTE = 2;
const ITEM_CARD = 3;
const ITEM_IDENTITY = 4;
const ITEM_SSH_KEY = 5;

const CARD_BRANDS = {
    visa: "visa",
    mastercard: "mastercard",
    amex: "amex",
    discover: "discover",
};

function setIfPresent(entry, property, value) {
    if (value !== null && value !== undefined && value !== "") {
        entry.setProperty(property, `${value}`);
    }
}

function importLogin(entry, login) {
    entry.setProperty("username", login.username == null ? "" : login.username);
    entry.setProperty("password", login.password == null ? "" : login.password);
    if (Array.isArray(login.uris) && login.uris.length > 0) {
        setIfPresent(entry, "URL", login.uris[0].uri);
    }
}

function importCard(entry, card) {
    entry.setAttribute(Entry.Attributes.FacadeType, EntryType.CreditCard);
    setIfPresent(entry, "username", card.cardholderName);
    setIfPresent(entry, "password", card.number);
    setIfPresent(entry, "cvv", card.code);
    const brand = `${card.brand || ""}`.toLowerCase();
    entry.setProperty("type", CARD_BRANDS[brand] || "generic");
    if (card.expMonth && card.expYear) {
        entry.setProperty(
            "expiry",
            `${`${card.expMonth}`.padStart(2, "0")}/${card.expYear}`
        );
    }
}

function importIdentity(entry, identity) {
    Object.keys(identity).forEach((key) => {
        setIfPresent(entry, key, identity[key]);
    });
}

function importSSHKey(entry, sshKey) {
    entry.setAttribute(Entry.Attributes.FacadeType, EntryType.SSHKey);
    setIfPresent(entry, "privateKey", sshKey.privateKey);
    setIfPresent(entry, "publicKey", sshKey.publicKey);
    setIfPresent(entry, "fingerprint", sshKey.keyFingerprint);
}

/**
 * Importer for Bitwarden vaults
 * @memberof module:ButtercupImporter
 */
class BitwardenImporter {
    /**
     * Create a new Bitwarden importer
     * @param {String} data Raw JSON data of a Bitwarden vault export
     */
    constructor(data) {
        this._data = data;
    }

    /**
     * Export to a Buttercup vault
     * @returns {Promise.<Vault>}
     * @memberof BitwardenImporter
     */
    export() {
        return Promise.resolve().then(() => {
            const vault = new Vault();
            const bwJson = JSON.parse(this._data);
            if (bwJson.encrypted) {
                throw new Error(
                    "Encrypted Bitwarden exports can't be imported: export the vault as unencrypted JSON instead"
                );
            }

            // Personal exports group items in folders, organisation exports
            // in collections. Items in neither go in the default group.
            const defaultGroup = vault.createGroup(DEFAULT_GROUP);
            const groups = new Map();
            [...(bwJson.folders || []), ...(bwJson.collections || [])].forEach(
                (container) => {
                    groups.set(
                        container.id,
                        container.name === DEFAULT_GROUP
                            ? defaultGroup
                            : vault.createGroup(container.name)
                    );
                }
            );
            const getGroup = (item) =>
                groups.get(item.folderId) ||
                (item.collectionIds || [])
                    .map((id) => groups.get(id))
                    .find(Boolean) ||
                defaultGroup;

            (bwJson.items || []).forEach((bitwardenItem) => {
                const entry = getGroup(bitwardenItem).createEntry(
                    bitwardenItem.name
                );

                if (bitwardenItem.login) {
                    importLogin(entry, bitwardenItem.login);
                }
                if (bitwardenItem.type === ITEM_CARD && bitwardenItem.card) {
                    importCard(entry, bitwardenItem.card);
                }
                if (
                    bitwardenItem.type === ITEM_IDENTITY &&
                    bitwardenItem.identity
                ) {
                    importIdentity(entry, bitwardenItem.identity);
                }
                if (
                    bitwardenItem.type === ITEM_SSH_KEY &&
                    bitwardenItem.sshKey
                ) {
                    importSSHKey(entry, bitwardenItem.sshKey);
                }

                if (bitwardenItem.notes != null) {
                    if (bitwardenItem.type === ITEM_NOTE) {
                        entry.setAttribute(
                            Entry.Attributes.FacadeType,
                            EntryType.Note
                        );
                        entry.setProperty("note", bitwardenItem.notes);
                    } else {
                        entry.setProperty("Notes", bitwardenItem.notes);
                    }
                }

                (bitwardenItem.fields || []).forEach((itemField) => {
                    if (itemField.name && itemField.value != null) {
                        entry.setProperty(itemField.name, `${itemField.value}`);
                    }
                });
            });

            return vault;
        });
    }
}

/**
 * Load an importer from a file
 * @param {String} filename The file to load from
 * @returns {Promise.<BitwardenImporter>}
 * @static
 * @memberof BitwardenImporter
 */
BitwardenImporter.loadFromFile = function (filename) {
    return fs
        .readFile(filename, "utf8")
        .then((data) => new BitwardenImporter(data));
};

module.exports = BitwardenImporter;
