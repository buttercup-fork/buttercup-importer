const { onePasswordItemToEntry } = require("./1passwordEntry.js");
const { parseImportJSON } = require("./json.js");

const ONEPASS_FOLDER = /^system\.folder/i;
const ONEPASS_SPACER = /^\*\*\*.+/;

// 1Password for Windows 4 writes a category code instead of a type name
const CATEGORY_TYPE_NAMES = {
    "001": "webforms.WebForm",
    "002": "wallet.financial.CreditCard",
    "003": "securenotes.SecureNote",
    "004": "identities.Identity",
    "005": "passwords.Password",
    100: "wallet.computer.License",
    108: "wallet.government.SsnUS",
    109: "wallet.computer.Router",
    111: "wallet.onlineservices.Email.v2",
};

/**
 * Bring a 1Password for Windows 4 item (category code, with the title and
 * URL in `overview` and the fields in `details`) into the layout the Mac
 * exports use (`typeName`, `title`, `location`, `secureContents`)
 * @param {Object} item A parsed 1pif item
 * @returns {Object} The item in the Mac layout
 * @private
 */
function normalizeItem(item) {
    if (item.typeName || !item.category) {
        return item;
    }
    const overview = item.overview || {};
    const details = item.details || {};
    const secureContents = { ...details };
    // Card, licence etc. values live in named section fields
    (details.sections || []).forEach((section) => {
        (section.fields || []).forEach((field) => {
            if (field.n && secureContents[field.n] === undefined) {
                secureContents[field.n] = field.v;
            }
        });
    });
    return {
        ...item,
        typeName:
            CATEGORY_TYPE_NAMES[item.category] || `category.${item.category}`,
        title: item.title || overview.title,
        location: item.location || overview.url,
        secureContents,
    };
}

/**
 * Convert raw 1pif text to a JSON tree
 * @param {String} onePifRaw Exported 1PIF content
 * @returns {Object} Raw archive structure
 */
function convert1pifToJSON(onePifRaw) {
    const items = onePifRaw
        .split(/\r\n|\n/)
        .map((line, index) => ({ text: line.trim(), number: index + 1 }))
        .filter(
            ({ text }) => text.length > 0 && ONEPASS_SPACER.test(text) !== true,
        )
        .map(({ text, number }) =>
            normalizeItem(
                parseImportJSON(
                    text,
                    `1Password export (.1pif) line ${number}`,
                ),
            ),
        );
    // No prototype: an item UUID or type name like __proto__ or constructor
    // is a key like any other (B-676)
    const groups = Object.create(null);
    const entries = Object.create(null);
    // let defaultGroup = null;

    const groupNames = items
        .map((item) => item.typeName)
        .filter((typeName) => !ONEPASS_FOLDER.test(typeName));
    [...new Set(groupNames)].forEach((groupName) => {
        groups[groupName] = createGroupSkeleton(groupName, groupName);
    });

    items.forEach(function (item) {
        if (ONEPASS_FOLDER.test(item.typeName)) {
            const group = createGroupSkeleton(item.uuid);
            if (item.folderUuid) {
                group.parentID = item.folderUuid;
            }
            if (item.title) {
                group.title = item.title;
            }
            groups[item.uuid] = group;
        } else {
            const entry = onePasswordItemToEntry(item);
            if (entry) {
                entries[item.uuid] = entry;
            }
        }
    });
    attachOrphans(groups, entries);
    return mergeItemsToTree(groups, entries);
}

/**
 * Put items and folders whose folder is not in the export (or whose folders
 * are each other's parents) under the root. The tree is built from the root
 * down, so they were never reached and were dropped without an error (B-674)
 * @param {Object} groups Groups key=>value list
 * @param {Object} entries Entries key=>value list
 * @private
 */
function attachOrphans(groups, entries) {
    Object.values(groups).forEach((group) => {
        const seen = new Set([group.id]);
        let current = group;
        while (current.parentID !== null) {
            const parent = groups[current.parentID];
            if (!parent || seen.has(parent.id)) {
                current.parentID = null;
                break;
            }
            seen.add(parent.id);
            current = parent;
        }
    });
    Object.values(entries).forEach((entry) => {
        if (entry.groupID && !groups[entry.groupID]) {
            entry.groupID = null;
        }
    });
}

/**
 * Create a new group skeleton
 * @param {String|null} id The 1password group UUID
 * @returns {Object} A group object
 */
function createGroupSkeleton(id, title = "Untitled Group") {
    return {
        id,
        title,
        parentID: null,
        entries: [],
        groups: [],
    };
}

/**
 * Merge extracted groups and entries to form a tree
 * @param {Object} groups Groups key=>value list
 * @param {Object} entries Entries key=>value list
 * @param {Object=} currentGroup The current object being worked on
 */
function mergeItemsToTree(groups, entries, currentGroup) {
    const thisGroup = currentGroup || createGroupSkeleton(null);
    if (!currentGroup) {
        thisGroup.title = "Imported 1password vault";
    }
    Object.values(entries).forEach(function (entry) {
        if (
            (!entry.groupID && thisGroup.id === null) ||
            (entry.groupID && entry.groupID === thisGroup.id)
        ) {
            thisGroup.entries.push(entry);
        }
    });
    Object.values(groups).forEach(function (group) {
        if (group.id && group.parentID === thisGroup.id) {
            thisGroup.groups.push(mergeItemsToTree(groups, entries, group));
        }
    });
    return thisGroup;
}

module.exports = {
    convert1pifToJSON,
};
