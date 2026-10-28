const { strToU8, zipSync } = require("fflate");
const BitwardenImporter = require("../../../source/importers/BitwardenImporter.js");
const KeeperSecurityImporter = require("../../../source/importers/KeeperSecurityImporter.js");
const OnePassword1PUXImporter = require("../../../source/importers/OnePassword1PUXImporter.js");
const OnePasswordImporter = require("../../../source/importers/OnePasswordImporter.js");

// An unquoted password: V8's message for this quotes the text around it
const BROKEN_JSON =
    '{"items":[{"name":"x","login":{"password":S3cret-Password-123}}]}';

function expectFailure(promise) {
    return promise.then(
        () => {
            throw new Error("Should have failed");
        },
        (err) => err,
    );
}

// Parse errors must not quote the file: desktop logs and shows them (B-675)
describe("JSON parse errors (B-675)", function () {
    it("Bitwarden: the message names the file type, not its text", function () {
        return expectFailure(new BitwardenImporter(BROKEN_JSON).export()).then(
            (err) => {
                expect(err.message).to.equal(
                    "Bitwarden export is not valid JSON",
                );
            },
        );
    });

    it("Keeper: the message names the file type, not its text", function () {
        return expectFailure(
            new KeeperSecurityImporter(BROKEN_JSON).export(),
        ).then((err) => {
            expect(err.message).to.equal("Keeper export is not valid JSON");
        });
    });

    it("1Password .1pux: the message names the file type, not its text", function () {
        const data = Buffer.from(
            zipSync({ "export.data": strToU8(BROKEN_JSON) }),
        );
        return expectFailure(new OnePassword1PUXImporter(data).export()).then(
            (err) => {
                expect(err.message).to.equal(
                    "1Password export (.1pux) export.data is not valid JSON",
                );
            },
        );
    });

    it("1Password .1pif: the message gives the line, not its text", function () {
        const data = [
            '{"uuid":"a","typeName":"webforms.WebForm","title":"ok"}',
            "***5642bee8***",
            BROKEN_JSON,
        ].join("\n");
        return expectFailure(new OnePasswordImporter(data).export()).then(
            (err) => {
                expect(err.message).to.equal(
                    "1Password export (.1pif) line 3 is not valid JSON",
                );
            },
        );
    });

    it("keeps the line and column when the parser gives them", function () {
        return expectFailure(
            new BitwardenImporter('{\n"items" []\n}').export(),
        ).then((err) => {
            expect(err.message).to.equal(
                "Bitwarden export is not valid JSON (line 2, column 9)",
            );
        });
    });
});
