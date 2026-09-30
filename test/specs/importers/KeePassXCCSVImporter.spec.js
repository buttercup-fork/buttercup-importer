const path = require("path");
const KeePassXCCSVImporter = require("../../../source/importers/KeePassXCCSVImporter.js");
const { EntryPropertyValueType, Vault } = require("buttercup");

const EXAMPLE_VAULT = path.resolve(__dirname, "../../resources/keepassxc.csv");

describe("KeePassXCCSVImporter (#61)", function () {
    beforeEach(async function () {
        const importer = await KeePassXCCSVImporter.loadFromFile(EXAMPLE_VAULT);
        this.vault = await importer.export();
        this.entry = (title) => {
            const [entry] = this.vault.findEntriesByProperty("title", title);
            expect(entry, `entry "${title}"`).to.be.ok;
            return entry;
        };
    });

    it("creates a vault instance", function () {
        expect(this.vault).to.be.an.instanceOf(Vault);
    });

    it("rebuilds the group tree without the root group", function () {
        const titles = this.vault.getGroups().map((group) => group.getTitle());
        expect(titles).to.have.members(["General", "Email", "Banking"]);
        const [email] = this.vault.findGroupsByTitle("Email");
        expect(
            email.getGroups().map((group) => group.getTitle()),
        ).to.deep.equal(["Work"]);
    });

    it("puts each entry in its group once", function () {
        expect(
            this.vault.findEntriesByProperty("title", /.*/),
        ).to.have.lengthOf(4);
        expect(this.entry("Top level").getGroup().getTitle()).to.equal(
            "General",
        );
        expect(this.entry("Work mail").getGroup().getTitle()).to.equal("Work");
    });

    it("imports login details", function () {
        const entry = this.entry("Mail");
        expect(entry.getProperty("username")).to.equal("me@mail.test");
        expect(entry.getProperty("password")).to.equal("m@ilPass");
        expect(entry.getProperty("URL")).to.equal("https://mail.test");
    });

    it("imports multi-line notes as a note field", function () {
        const entry = this.entry("Mail");
        expect(entry.getProperty("Notes")).to.equal(
            'First line\nSecond line, with "quotes"',
        );
        expect(entry.getPropertyValueType("Notes")).to.equal(
            EntryPropertyValueType.Note,
        );
    });

    it("imports TOTP as an OTP field", function () {
        const entry = this.entry("Mail");
        expect(entry.getProperty("OTP")).to.match(
            /^otpauth:\/\/totp\/Mail:me\?secret=JBSWY3DPEHPK3PXP/,
        );
        expect(entry.getPropertyValueType("OTP")).to.equal(
            EntryPropertyValueType.OTP,
        );
    });

    it("leaves out empty URL, notes and TOTP", function () {
        const properties = Object.keys(this.entry("Work mail").getProperty());
        expect(properties).to.not.include("URL");
        expect(properties).to.not.include("Notes");
        expect(properties).to.not.include("OTP");
    });
});

describe("KeePassXCCSVImporter: other inputs", function () {
    it("imports exports from before KeePassXC 2.7 (no TOTP column), with a BOM and CRLF", async function () {
        const csv =
            '﻿"Group","Title","Username","Password","URL","Notes"\r\n' +
            '"Passwords","Old","u","p","","a\r\nb"\r\n';
        const vault = await new KeePassXCCSVImporter(csv).export();
        const [entry] = vault.findEntriesByProperty("title", "Old");
        expect(entry.getGroup().getTitle()).to.equal("General");
        expect(entry.getProperty("Notes")).to.equal("a\nb");
    });

    it("rejects a CSV that isn't a KeePassXC export", async function () {
        const csv = "name,username,password\nx,y,z\n";
        let error = null;
        try {
            await new KeePassXCCSVImporter(csv).export();
        } catch (err) {
            error = err;
        }
        expect(error).to.be.an.instanceOf(Error);
        expect(error.message).to.match(
            /Not a KeePassXC CSV export.*Group, Title/,
        );
    });

    it("imports an empty export as an empty vault", async function () {
        const csv = '"Group","Title","Username","Password","URL","Notes"\n';
        const vault = await new KeePassXCCSVImporter(csv).export();
        expect(vault.getGroups()).to.have.lengthOf(0);
    });
});
