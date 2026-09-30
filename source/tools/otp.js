const { EntryPropertyValueType } = require("buttercup");
const { addProperty } = require("./properties.js");

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
    const uri = toTOTPURI(value, entry.getProperty("title"));
    return uri
        ? addProperty(entry, name, uri, EntryPropertyValueType.OTP)
        : addProperty(entry, name, `${value}`);
}

module.exports = {
    addOTPProperty,
    toTOTPURI,
};
