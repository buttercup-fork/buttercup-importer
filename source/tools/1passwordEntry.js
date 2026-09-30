const { EntryPropertyValueType } = require("buttercup");

const ATTR_1PASS_TYPE = "ONEPASS_IMPORT_TYPE";
const ENTRY_NORMAL = /^webforms\.WebForm/i;
const ENTRY_CREDITCARD = /^wallet\.financial\.CreditCard/i;
const ENTRY_PASSWORD = /^passwords\.Password/i;
const ENTRY_LICENSE = /^wallet\.computer\.License/i;
const ENTRY_EMAIL_V2 = /^wallet\.onlineservices\.Email\.v2/i;
const ENTRY_SSN = /^wallet\.government\.SsnUS/i;
const ENTRY_ROUTER = /^wallet\.computer\.Router/i;
const OTP_FIELD_NAME = /^TOTP_/i;

// Section fields that the type-specific mapping below already imports
const MAPPED_FIELDS = [
    [
        ENTRY_CREDITCARD,
        ["cardholder", "type", "ccnum", "cvv", "expiry", "validFrom"],
    ],
    [ENTRY_PASSWORD, ["password"]],
    [ENTRY_LICENSE, ["reg_code", "reg_email", "reg_name"]],
    [ENTRY_EMAIL_V2, ["pop_username", "pop_password", "pop_server"]],
    [ENTRY_SSN, ["number", "name"]],
    [ENTRY_ROUTER, ["network_name", "password", "wireless_security", "server"]],
];

/**
 * Convert a 1password raw item to an entry object
 * @param {Object} rawItem Extracted 1password item
 * @returns {Object|null} The converted entry object or null if invalid
 */
function onePasswordItemToEntry(rawItem) {
    const entry = {
        groupID: rawItem.folderUuid || rawItem.typeName || null,
        title: rawItem.title || "Untitled entry",
        username: "",
        password: "",
        meta: {},
        attributes: {
            [ATTR_1PASS_TYPE]: rawItem.typeName,
        },
    };
    if (rawItem.location) {
        entry.meta.url = rawItem.location;
    }
    if (testNormalEntryAndFieldsExist(rawItem)) {
        rawItem.secureContents.fields.forEach(function (field) {
            if (field.designation === "username") {
                entry.username = field.value;
            }
            if (field.designation === "password") {
                entry.password = field.value;
            }
        });
    } else if (ENTRY_CREDITCARD.test(rawItem.typeName)) {
        if (rawItem.secureContents.ccnum) {
            entry.username = rawItem.secureContents.ccnum;
        }
        if (rawItem.secureContents.cvv) {
            entry.password = rawItem.secureContents.cvv;
        }
        if (rawItem.secureContents.type) {
            entry.meta.type = rawItem.secureContents.type;
        }
        if (rawItem.secureContents.cardholder) {
            entry.meta.cardholder = rawItem.secureContents.cardholder;
        }
        if (rawItem.secureContents.expiry_yy) {
            entry.meta["expiry-year"] = rawItem.secureContents.expiry_yy;
        }
        if (rawItem.secureContents.expiry_mm) {
            entry.meta["expiry-month"] = rawItem.secureContents.expiry_mm;
        }
        if (rawItem.secureContents.validFrom_yy) {
            entry.meta["validfrom-year"] = rawItem.secureContents.validFrom_yy;
        }
        if (rawItem.secureContents.validFrom_mm) {
            entry.meta["validfrom-month"] = rawItem.secureContents.validFrom_mm;
        }
    } else if (ENTRY_PASSWORD.test(rawItem.typeName)) {
        entry.password = rawItem.secureContents.password;
    } else if (ENTRY_LICENSE.test(rawItem.typeName)) {
        if (!rawItem.secureContents.reg_code) {
            return null;
        }
        entry.password = rawItem.secureContents.reg_code;
        if (rawItem.secureContents.reg_email) {
            entry.username = rawItem.secureContents.reg_email;
        }
        if (rawItem.secureContents.reg_name) {
            entry.meta.Name = rawItem.secureContents.reg_name;
        }
    } else if (ENTRY_EMAIL_V2.test(rawItem.typeName)) {
        entry.username = rawItem.secureContents.pop_username;
        entry.password = rawItem.secureContents.pop_password;
        if (rawItem.secureContents.pop_server) {
            entry.meta["POP Server"] = rawItem.secureContents.pop_server;
        }
    } else if (ENTRY_SSN.test(rawItem.typeName)) {
        entry.password = rawItem.secureContents.number;
        if (rawItem.secureContents.name) {
            entry.meta.Name = rawItem.secureContents.name;
        }
    } else if (ENTRY_ROUTER.test(rawItem.typeName)) {
        entry.username = rawItem.secureContents.network_name;
        entry.password = rawItem.secureContents.password;
        if (rawItem.secureContents.network_name) {
            entry.meta.Network = rawItem.secureContents.network_name;
        }
        if (rawItem.secureContents.wireless_security) {
            entry.meta.Security = rawItem.secureContents.wireless_security;
        }
        if (rawItem.secureContents.server) {
            entry.meta.Server = rawItem.secureContents.server;
        }
    } else {
        return null;
    }
    entry.fields = getExtraFields(rawItem);
    return entry;
}

/**
 * Collect the fields that the type mapping doesn't cover: section fields
 * (custom fields, a card's PIN or bank, one-time passwords...) and notes
 * @param {Object} rawItem Extracted 1password item
 * @returns {Array.<{ name: String, value: String, valueType: String|null }>}
 * @private
 */
function getExtraFields(rawItem) {
    const secureContents = rawItem.secureContents || {};
    const mapped = new Set(
        (MAPPED_FIELDS.find(([type]) => type.test(rawItem.typeName)) || [
            null,
            [],
        ])[1],
    );
    const fields = (secureContents.sections || [])
        .flatMap((section) => section.fields || [])
        .filter((field) => !mapped.has(field.n))
        .map(sectionFieldToProperty)
        .filter(Boolean);
    if (
        typeof secureContents.notesPlain === "string" &&
        secureContents.notesPlain
    ) {
        fields.push({
            name: "Notes",
            value: secureContents.notesPlain,
            valueType: EntryPropertyValueType.Note,
        });
    }
    return fields;
}

/**
 * Convert a 1Password section field to a property
 * @param {Object} field The field: k (kind), n (name), t (title), v (value)
 * @returns {{ name: String, value: String, valueType: String|null }|null}
 *  The property, or null for an empty or unsupported field
 * @private
 */
function sectionFieldToProperty(field) {
    const { k: kind, n: id = "", t: title, v: value } = field;
    if (value === undefined || value === null || value === "") {
        return null;
    }
    const name = title || id;
    if (
        kind === "totp" ||
        OTP_FIELD_NAME.test(id) ||
        /^otpauth:\/\//i.test(`${value}`)
    ) {
        return {
            name: title || "OTP",
            value: `${value}`,
            valueType: EntryPropertyValueType.OTP,
        };
    }
    if (!name) {
        return null;
    }
    if (kind === "address" && typeof value === "object") {
        const lines = ["street", "city", "state", "zip", "country"]
            .map((part) => value[part])
            .filter(Boolean);
        return lines.length > 0
            ? {
                  name,
                  value: lines.join("\n"),
                  valueType: EntryPropertyValueType.Note,
              }
            : null;
    }
    // .1pux wraps some values in objects
    if (kind === "email" && typeof value === "object") {
        return value.email_address
            ? { name, value: `${value.email_address}`, valueType: null }
            : null;
    }
    if (kind === "sshKey" && typeof value === "object") {
        return value.privateKey
            ? {
                  name,
                  value: `${value.privateKey}`,
                  valueType: EntryPropertyValueType.Note,
              }
            : null;
    }
    if (typeof value === "object") {
        return null;
    }
    if (kind === "date" && typeof value === "number") {
        // Seconds since the epoch
        const date = new Date(value * 1000).toISOString().slice(0, 10);
        return { name, value: date, valueType: null };
    }
    if (kind === "monthYear" && /^\d{6}$/.test(`${value}`)) {
        const text = `${value}`;
        return {
            name,
            value: `${text.slice(4)}/${text.slice(0, 4)}`,
            valueType: null,
        };
    }
    const text = `${value}`;
    if (kind === "concealed") {
        return {
            name,
            value: text,
            valueType: EntryPropertyValueType.Password,
        };
    }
    return {
        name,
        value: text,
        valueType: /\n/.test(text) ? EntryPropertyValueType.Note : null,
    };
}

function testNormalEntryAndFieldsExist(rawItem) {
    return (
        ENTRY_NORMAL.test(rawItem.typeName) &&
        Array.isArray(rawItem.secureContents.fields)
    );
}

module.exports = {
    onePasswordItemToEntry,
    sectionFieldToProperty,
};
