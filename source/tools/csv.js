const { parse: csvparse } = require("csv-parse/sync");

/**
 * Parse CSV with a header row into an array of records. A UTF-8 BOM, as
 * Excel and Buttercup's own export write it, is skipped. Standard CSV is
 * parsed strictly; exports that break the quoting rules get a second try:
 *  - quotes escaped with a backslash (`\"`), as 1Password writes them
 *  - stray quotes inside unquoted fields
 * @param {String} data The CSV data
 * @returns {Array.<Object>} The records, keyed by column name
 * @private
 */
function parseCSV(data) {
    try {
        return csvparse(data, { bom: true, columns: true });
    } catch (err) {
        if (err.code === "CSV_INVALID_CLOSING_QUOTE") {
            return csvparse(data, { bom: true, columns: true, escape: "\\" });
        }
        if (err.code === "INVALID_OPENING_QUOTE") {
            return csvparse(data, {
                bom: true,
                columns: true,
                relax_quotes: true,
            });
        }
        throw err;
    }
}

module.exports = {
    parseCSV,
};
