const { Entry, EntryPropertyValueType } = require("buttercup");

const BASE32_SECRET = /^[A-Z2-7]+=*$/;

/**
 * Convert an exported one-time password value to a TOTP URI
 * @param {String} value The exported value: an otpauth:// URI or a
 *  base32 secret
 * @param {String} label The label to use for a bare secret (entry title)
 * @returns {String|null} The TOTP URI, or null if the value isn't TOTP
 *  (e.g. HOTP or Steam codes, which Buttercup can't show)
 * @private
 */
function toTOTPURI(value, label) {
    const trimmed = `${value || ""}`.trim();
    if (/^otpauth:\/\/totp\//i.test(trimmed)) {
        return trimmed;
    }
    const secret = trimmed.replace(/[\s-]/g, "").toUpperCase();
    if (!secret || !BASE32_SECRET.test(secret)) {
        return null;
    }
    const name = encodeURIComponent(label || "Imported");
    return `otpauth://totp/${name}?secret=${secret.replace(/=+$/, "")}`;
}

/**
 * Find a property name that the entry doesn't use yet
 * @param {Entry} entry The entry
 * @param {String} name The preferred name
 * @returns {String}
 * @private
 */
function unusedPropertyName(entry, name) {
    let candidate = name;
    for (let i = 2; entry.getProperty(candidate) !== undefined; i += 1) {
        candidate = `${name} ${i}`;
    }
    return candidate;
}

/**
 * Add an exported one-time password to an entry. TOTP values become an
 * OTP field (shown as a live code); anything else is kept as plain text so
 * it isn't lost.
 * @param {Entry} entry The entry to add to
 * @param {String} name The preferred property name
 * @param {String} value The exported value
 * @returns {String} The property name used
 * @private
 */
function addOTPProperty(entry, name, value) {
    const property = unusedPropertyName(entry, name);
    const uri = toTOTPURI(value, entry.getProperty("title"));
    if (uri) {
        entry.setProperty(property, uri);
        entry.setAttribute(
            `${Entry.Attributes.FieldTypePrefix}${property}`,
            EntryPropertyValueType.OTP,
        );
    } else {
        entry.setProperty(property, `${value}`);
    }
    return property;
}

module.exports = {
    addOTPProperty,
    toTOTPURI,
};
