const fs = require("fs");
const path = require("path");
const { strToU8, zipSync } = require("fflate");
const OnePassword1PUXImporter = require("../../../source/importers/OnePassword1PUXImporter.js");
const {
    Entry,
    EntryPropertyValueType,
    EntryType,
    Vault,
} = require("buttercup");

// Written from 1Password's published .1pux format; zipped at run time
const EXPORT_DATA = fs.readFileSync(
    path.resolve(__dirname, "../../resources/1password-1pux-export.data.json"),
    "utf8",
);

function make1pux(files = { "export.data": EXPORT_DATA }) {
    const zip = {
        "export.attributes": strToU8(
            '{"version":3,"description":"1Password Unencrypted Export"}',
        ),
    };
    Object.keys(files).forEach((name) => {
        zip[name] = strToU8(files[name]);
    });
    return Buffer.from(zipSync(zip));
}

describe("OnePassword1PUXImporter (#58)", function () {
    before(async function () {
        this.vault = await new OnePassword1PUXImporter(make1pux()).export();
        this.entry = (title) => {
            const [entry] = this.vault.findEntriesByProperty("title", title);
            expect(entry, `entry "${title}"`).to.be.ok;
            return entry;
        };
    });

    it("creates a vault instance", function () {
        expect(this.vault).to.be.an.instanceOf(Vault);
    });

    it("creates a group per 1Password vault, with archived items in a subgroup", function () {
        const titles = this.vault.getGroups().map((group) => group.getTitle());
        expect(titles).to.have.members(["Personal", "Shared"]);
        expect(this.entry("Old password").getGroup().getTitle()).to.equal(
            "Archived",
        );
        expect(
            this.entry("Old password").getGroup().getParentGroup().getTitle(),
        ).to.equal("Personal");
        expect(this.entry("Team login").getGroup().getTitle()).to.equal(
            "Shared",
        );
    });

    it("imports login fields and every URL", function () {
        const entry = this.entry("Mail");
        expect(entry.getProperty("username")).to.equal("me@mail.test");
        expect(entry.getProperty("password")).to.equal("m@ilPass");
        expect(entry.getProperty("URL")).to.equal("https://mail.test");
        expect(entry.getProperty("URL 2")).to.equal(
            "https://webmail.mail.test",
        );
        expect(Object.keys(entry.getProperty())).to.not.include("remember");
    });

    it("imports TOTP as an OTP field", function () {
        const entry = this.entry("Mail");
        expect(entry.getProperty("one-time password")).to.match(
            /^otpauth:\/\/totp\/Mail:me\?/,
        );
        expect(entry.getPropertyValueType("one-time password")).to.equal(
            EntryPropertyValueType.OTP,
        );
    });

    it("imports section fields with their types", function () {
        const entry = this.entry("Mail");
        expect(entry.getProperty("PIN")).to.equal("1234");
        expect(entry.getPropertyValueType("PIN")).to.equal(
            EntryPropertyValueType.Password,
        );
        expect(entry.getProperty("recovery email")).to.equal(
            "backup@mail.test",
        );
        expect(entry.getProperty("since")).to.equal("2000-01-01");
    });

    it("imports notes and tags", function () {
        const entry = this.entry("Mail");
        expect(entry.getProperty("Notes")).to.equal("Login note\nsecond line");
        expect(entry.getPropertyValueType("Notes")).to.equal(
            EntryPropertyValueType.Note,
        );
        expect(entry.getTags()).to.have.members(["work_email", "important"]);
    });

    it("imports a credit card into Buttercup's card fields", function () {
        const entry = this.entry("Credit card");
        expect(entry.getAttribute(Entry.Attributes.FacadeType)).to.equal(
            EntryType.CreditCard,
        );
        expect(entry.getProperty("username")).to.equal("Jane Doe");
        expect(entry.getProperty("password")).to.equal("5555-5555-5555-4444");
        expect(entry.getProperty("cvv")).to.equal("321");
        expect(entry.getProperty("type")).to.equal("mastercard");
        expect(entry.getProperty("expiry")).to.equal("12/2030");
        expect(entry.getProperty("valid from")).to.equal("01/2025");
        expect(entry.getProperty("issuing bank")).to.equal("Test Bank");
        expect(entry.getProperty("address")).to.equal(
            "1 Main St\nWellington\n6011\nnz",
        );
    });

    it("imports a secure note as a note entry", function () {
        const entry = this.entry("Note");
        expect(entry.getAttribute(Entry.Attributes.FacadeType)).to.equal(
            EntryType.Note,
        );
        expect(entry.getProperty("note")).to.equal("Secret note");
    });

    it("imports an SSH key into Buttercup's SSH key fields", function () {
        const entry = this.entry("Server key");
        expect(entry.getAttribute(Entry.Attributes.FacadeType)).to.equal(
            EntryType.SSHKey,
        );
        expect(entry.getProperty("privateKey")).to.match(
            /^-----BEGIN OPENSSH PRIVATE KEY-----/,
        );
        expect(entry.getProperty("publicKey")).to.equal(
            "ssh-ed25519 AAAA test",
        );
        expect(entry.getProperty("fingerprint")).to.equal("SHA256:abc");
    });

    it("imports a password item", function () {
        expect(this.entry("Old password").getProperty("password")).to.equal(
            "0ldPass",
        );
    });
});

describe("OnePassword1PUXImporter: other inputs", function () {
    async function exportError(data) {
        try {
            await new OnePassword1PUXImporter(data).export();
        } catch (err) {
            return err;
        }
        return null;
    }

    it("rejects a file that isn't a zip", async function () {
        const error = await exportError(Buffer.from("not a zip"));
        expect(error).to.be.an.instanceOf(Error);
        expect(error.message).to.match(/^Not a 1Password export \(\.1pux\)/);
    });

    it("rejects a zip without export.data", async function () {
        const error = await exportError(make1pux({}));
        expect(error.message).to.match(/export\.data is missing/);
    });

    it("loads from a file", async function () {
        const file = path.resolve(
            __dirname,
            "../../resources/1password-1pux-export.data.json",
        );
        const importer = await OnePassword1PUXImporter.loadFromFile(file);
        expect(importer).to.be.an.instanceOf(OnePassword1PUXImporter);
        // A JSON file isn't a .1pux zip
        expect((await exportError(importer._data)).message).to.match(
            /Not a 1Password export/,
        );
    });
});
