const { Entry } = require("buttercup");

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
 * Add a property without overwriting one the entry already has
 * @param {Entry} entry The entry to add to
 * @param {String} name The preferred property name
 * @param {String} value The value
 * @param {String=} valueType An EntryPropertyValueType (text if omitted)
 * @returns {String} The property name used
 * @private
 */
function addProperty(entry, name, value, valueType) {
    const property = unusedPropertyName(entry, name);
    entry.setProperty(property, value);
    if (valueType) {
        entry.setAttribute(
            `${Entry.Attributes.FieldTypePrefix}${property}`,
            valueType,
        );
    }
    return property;
}

module.exports = {
    addProperty,
    unusedPropertyName,
};
