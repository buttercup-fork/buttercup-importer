// The only part of a JSON.parse message that is passed on: V8 adds it to
// some errors. Other messages quote the text around the error, which can be
// the start of a password (B-675)
const POSITION = /\(line (\d+) column (\d+)\)/;

/**
 * Parse JSON from an imported file. A parse error becomes a fixed message
 * that never contains the file's text: the error is logged and shown by the
 * app (B-675)
 * @param {String} text The JSON text
 * @param {String} description What the text is, for the message (e.g.
 *  "Bitwarden export")
 * @returns {*} The parsed value
 * @throws {Error} When the text is not valid JSON
 * @private
 */
function parseImportJSON(text, description) {
    try {
        return JSON.parse(text);
    } catch (err) {
        const position = POSITION.exec(err.message);
        const where = position
            ? ` (line ${position[1]}, column ${position[2]})`
            : "";
        throw new Error(`${description} is not valid JSON${where}`);
    }
}

module.exports = {
    parseImportJSON,
};
