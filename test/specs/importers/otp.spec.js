const BitwardenImporter = require("../../../source/importers/BitwardenImporter.js");
const OnePasswordImporter = require("../../../source/importers/OnePasswordImporter.js");
const { toTOTPURI } = require("../../../source/tools/otp.js");
const { EntryPropertyValueType } = require("buttercup");

const SECRET = "JBSWY3DPEHPK3PXP";
const URI = `otpauth://totp/Example:me?secret=${SECRET}&issuer=Example`;

function bitwardenExport(items) {
    return JSON.stringify({ encrypted: false, folders: [], items });
}

function bitwardenLogin(name, totp) {
    return {
        id: name,
        type: 1,
        name,
        login: { username: "me", password: "pass", uris: null, totp },
    };
}

// One 1PIF line per item, as 1Password writes them
function onePif(items) {
    return items
        .map((item) => JSON.stringify(item))
        .join("\n***5642bee8-a5ff-11dc-8314-0800200c9a66***\n");
}

function onePasswordLogin(title, sectionFields) {
    return {
        uuid: title,
        typeName: "webforms.WebForm",
        title,
        secureContents: {
            fields: [
                { designation: "username", value: "me" },
                { designation: "password", value: "pass" },
            ],
            sections: [{ name: "", title: "", fields: sectionFields }],
        },
    };
}

async function exportEntry(importer, title) {
    const vault = await importer.export();
    const [entry] = vault.findEntriesByProperty("title", title);
    expect(entry, `entry "${title}"`).to.be.ok;
    return entry;
}

describe("toTOTPURI", function () {
    it("keeps a TOTP URI", function () {
        expect(toTOTPURI(URI, "Example")).to.equal(URI);
    });

    it("turns a base32 secret into a TOTP URI", function () {
        expect(toTOTPURI("jbsw y3dp ehpk 3pxp", "My site")).to.equal(
            `otpauth://totp/My%20site?secret=${SECRET}`,
        );
    });

    it("drops base32 padding", function () {
        expect(toTOTPURI(`${SECRET}====`, "x")).to.equal(
            `otpauth://totp/x?secret=${SECRET}`,
        );
    });

    it("rejects values that aren't TOTP", function () {
        expect(toTOTPURI("otpauth://hotp/x?secret=ABC&counter=1", "x")).to.be
            .null;
        expect(toTOTPURI("steam://ABC123", "x")).to.be.null;
        expect(toTOTPURI("not a secret!", "x")).to.be.null;
        expect(toTOTPURI("", "x")).to.be.null;
    });
});

describe("BitwardenImporter: TOTP", function () {
    it("imports an otpauth URI as an OTP field", async function () {
        const importer = new BitwardenImporter(
            bitwardenExport([bitwardenLogin("With URI", URI)]),
        );
        const entry = await exportEntry(importer, "With URI");
        expect(entry.getProperty("OTP")).to.equal(URI);
        expect(entry.getPropertyValueType("OTP")).to.equal(
            EntryPropertyValueType.OTP,
        );
    });

    it("imports a bare secret as an OTP field", async function () {
        const importer = new BitwardenImporter(
            bitwardenExport([bitwardenLogin("With secret", SECRET)]),
        );
        const entry = await exportEntry(importer, "With secret");
        expect(entry.getProperty("OTP")).to.equal(
            `otpauth://totp/With%20secret?secret=${SECRET}`,
        );
        expect(entry.getPropertyValueType("OTP")).to.equal(
            EntryPropertyValueType.OTP,
        );
    });

    it("keeps a Steam code as plain text", async function () {
        const importer = new BitwardenImporter(
            bitwardenExport([bitwardenLogin("Steam", "steam://ABC123")]),
        );
        const entry = await exportEntry(importer, "Steam");
        expect(entry.getProperty("OTP")).to.equal("steam://ABC123");
        expect(entry.getPropertyValueType("OTP")).to.not.equal(
            EntryPropertyValueType.OTP,
        );
    });

    it("adds no OTP field when there is none", async function () {
        const importer = new BitwardenImporter(
            bitwardenExport([bitwardenLogin("Plain", null)]),
        );
        const entry = await exportEntry(importer, "Plain");
        expect(entry.getProperty("OTP")).to.be.undefined;
    });

    it("doesn't overwrite a custom field called OTP", async function () {
        const item = bitwardenLogin("Clash", URI);
        item.fields = [{ name: "OTP", value: "backup codes", type: 0 }];
        const entry = await exportEntry(
            new BitwardenImporter(bitwardenExport([item])),
            "Clash",
        );
        expect(entry.getProperty("OTP")).to.equal("backup codes");
        expect(entry.getProperty("OTP 2")).to.equal(URI);
    });
});

describe("OnePasswordImporter: TOTP (#71)", function () {
    it("imports a TOTP section field as an OTP field", async function () {
        const importer = new OnePasswordImporter(
            onePif([
                onePasswordLogin("With URI", [
                    {
                        k: "concealed",
                        n: "TOTP_4A0B6C1D",
                        t: "one-time password",
                        v: URI,
                    },
                ]),
            ]),
        );
        const entry = await exportEntry(importer, "With URI");
        expect(entry.getProperty("username")).to.equal("me");
        expect(entry.getProperty("one-time password")).to.equal(URI);
        expect(entry.getPropertyValueType("one-time password")).to.equal(
            EntryPropertyValueType.OTP,
        );
    });

    it("imports a bare secret, naming an untitled field OTP", async function () {
        const importer = new OnePasswordImporter(
            onePif([
                onePasswordLogin("With secret", [
                    { k: "concealed", n: "TOTP_1", t: "", v: SECRET },
                ]),
            ]),
        );
        const entry = await exportEntry(importer, "With secret");
        expect(entry.getProperty("OTP")).to.equal(
            `otpauth://totp/With%20secret?secret=${SECRET}`,
        );
        expect(entry.getPropertyValueType("OTP")).to.equal(
            EntryPropertyValueType.OTP,
        );
    });

    it("ignores other section fields", async function () {
        const importer = new OnePasswordImporter(
            onePif([
                onePasswordLogin("Other", [
                    { k: "string", n: "pin", t: "PIN", v: "1234" },
                ]),
            ]),
        );
        const entry = await exportEntry(importer, "Other");
        expect(Object.keys(entry.getProperty())).to.not.include("PIN");
    });
});
