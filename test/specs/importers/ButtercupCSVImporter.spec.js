const path = require("path");
const fs = require("fs");
const { exportVaultToCSV } = require("@buttercup/exporter");
const { Entry, EntryType, Group, Vault } = require("buttercup");
const ButtercupCSVImporter = require("../../../source/importers/ButtercupCSVImporter.js");

const EXAMPLE_VAULT = path.resolve(__dirname, "../../resources/bcup.tmp.csv");

describe("ButtercupCSVImporter", function () {
    beforeEach(function () {
        const vault = new Vault();
        const group = vault.createGroup("Test Group");
        group
            .createEntry("Test")
            .setProperty("username", "user")
            .setProperty("password", "pass")
            .setProperty("URL", "http://test.com")
            .setProperty("secret", "value")
            .setProperty("empty", "");
        group.createGroup("Test Child Group");
        return exportVaultToCSV(vault)
            .then((csv) => {
                fs.writeFileSync(EXAMPLE_VAULT, csv);
            })
            .then(() => ButtercupCSVImporter.loadFromFile(EXAMPLE_VAULT))
            .then((importer) => importer.export())
            .then((vault) => {
                this.vault = vault;
            });
    });

    afterEach(function () {
        fs.unlinkSync(EXAMPLE_VAULT);
    });

    it("creates a vault instance", function () {
        expect(this.vault).to.be.an.instanceOf(Vault);
    });

    it("exports expected groups", function () {
        const groups = this.vault.getGroups();
        expect(groups).to.have.lengthOf(1, "Should be only 1 root group");
        const [parent] = groups;
        expect(parent.getTitle()).to.equal("Test Group");
        expect(parent.getGroups()).to.have.lengthOf(
            1,
            "Should be only 1 child group",
        );
        const [child] = parent.getGroups();
        expect(child.getTitle()).to.equal("Test Child Group");
    });

    it("exports expected entries", function () {
        const entries = this.vault.findEntriesByProperty(/.+/, /.+/);
        expect(entries).to.have.lengthOf(1);
        const [entry] = entries;
        expect(entry).to.be.an.instanceOf(Entry);
        expect(entry.getProperty("username")).to.equal("user");
        expect(entry.getProperty("password")).to.equal("pass");
        expect(entry.getProperty("empty")).to.be.undefined;
    });

    it("doesn't let a __proto__ column pollute Object.prototype", function () {
        const groupID = "f9666f86-cb94-483f-bb89-99afa12656e2";
        const csv = [
            "!type,!group_id,!group_name,!group_parent,title,__proto__,id",
            `group,${groupID},General,0,,,`,
            `entry,${groupID},,,Test,polluted,e17515ac-e87a-41e5-889c-88c279408cc8`,
        ].join("\n");
        return new ButtercupCSVImporter(csv).export().then((vault) => {
            const [entry] = vault.getAllEntries();
            expect(entry.getProperty("title")).to.equal("Test");
            expect(Object.keys(Object.prototype)).to.have.lengthOf(0);
            expect({}.polluted).to.be.undefined;
        });
    });

    it("keeps fields named like built-in object properties (B-461)", function () {
        const groupID = "f9666f86-cb94-483f-bb89-99afa12656e2";
        const csv = [
            "!type,!group_id,!group_name,!group_parent,title,constructor,prototype,toString,hasOwnProperty,id",
            `group,${groupID},General,0,,,,,,`,
            `entry,${groupID},,,Test,c,p,t,h,e17515ac-e87a-41e5-889c-88c279408cc8`,
        ].join("\n");
        return new ButtercupCSVImporter(csv).export().then((vault) => {
            const [entry] = vault.getAllEntries();
            expect(entry.getProperty("constructor")).to.equal("c");
            expect(entry.getProperty("prototype")).to.equal("p");
            expect(entry.getProperty("toString")).to.equal("t");
            expect(entry.getProperty("hasOwnProperty")).to.equal("h");
        });
    });

    it("imports an export that starts with a UTF-8 BOM (desktop #749)", function () {
        const vault = new Vault();
        vault
            .createGroup("Accès Client")
            .createEntry("Café")
            .setProperty("username", "user")
            .setProperty("password", "pass");
        return exportVaultToCSV(vault)
            .then((csv) => new ButtercupCSVImporter(`\uFEFF${csv}`).export())
            .then((imported) => {
                const [group] = imported.getGroups();
                expect(group.getTitle()).to.equal("Accès Client");
                const [entry] = imported.getAllEntries();
                expect(entry.getProperty("title")).to.equal("Café");
                expect(entry.getProperty("password")).to.equal("pass");
            });
    });

    describe("entry types and attributes (#64, #60)", function () {
        const GROUP_ID = "f9666f86-cb94-483f-bb89-99afa12656e2";
        const ENTRY_ID = "e17515ac-e87a-41e5-889c-88c279408cc8";
        // Entry.Attributes.Tags in the core fork (core 6 has no tags)
        const ATTRIBUTE_TAGS = "BC_ENTRY_TAGS";

        function roundTrip(vault) {
            return exportVaultToCSV(vault)
                .then((csv) => new ButtercupCSVImporter(csv).export())
                .then((imported) => imported.getAllEntries());
        }

        function importRow(extraHeadings, extraValues) {
            const csv = [
                `!type,!group_id,!group_name,!group_parent,title,${extraHeadings},id`,
                `group,${GROUP_ID},General,0,,${extraHeadings.replace(
                    /[^,]/g,
                    "",
                )},`,
                `entry,${GROUP_ID},,,Test,${extraValues},${ENTRY_ID}`,
            ].join("\n");
            return new ButtercupCSVImporter(csv).export();
        }

        it("keeps website entries and their URL field", function () {
            const vault = new Vault();
            const entry = vault.createGroup("General").createEntry("Site");
            entry.setAttribute(Entry.Attributes.FacadeType, EntryType.Website);
            entry.setProperty("username", "user");
            entry.setProperty("password", "pass");
            entry.setProperty("url", "https://example.com");
            return roundTrip(vault).then(([imported]) => {
                expect(imported.getType()).to.equal(EntryType.Website);
                expect(imported.getProperty("url")).to.equal(
                    "https://example.com",
                );
                expect(imported.getURLs("general")).to.deep.equal([
                    "https://example.com",
                ]);
            });
        });

        it("keeps note entries, multi-line text and field value types", function () {
            const vault = new Vault();
            const group = vault.createGroup("General");
            const note = group.createEntry("Note");
            note.setAttribute(Entry.Attributes.FacadeType, EntryType.Note);
            note.setProperty("note", "Line 1\nLine 2");
            const login = group.createEntry("Login");
            login.setProperty("password", "pass");
            login.setProperty("Details", "a\nb");
            login.setAttribute(
                `${Entry.Attributes.FieldTypePrefix}Details`,
                "note",
            );
            login.setAttribute(ATTRIBUTE_TAGS, "work");
            return roundTrip(vault).then((entries) => {
                const byTitle = (title) =>
                    entries.find(
                        (entry) => entry.getProperty("title") === title,
                    );
                expect(byTitle("Note").getType()).to.equal(EntryType.Note);
                expect(byTitle("Note").getProperty("note")).to.equal(
                    "Line 1\nLine 2",
                );
                expect(byTitle("Login").getType()).to.equal(EntryType.Login);
                expect(
                    byTitle("Login").getAttribute(
                        `${Entry.Attributes.FieldTypePrefix}Details`,
                    ),
                ).to.equal("note");
                expect(byTitle("Login").getAttribute(ATTRIBUTE_TAGS)).to.equal(
                    "work",
                );
            });
        });

        it("keeps credit card and SSH key entries", function () {
            const vault = new Vault();
            const group = vault.createGroup("General");
            group
                .createEntry("Card")
                .setAttribute(Entry.Attributes.FacadeType, EntryType.CreditCard)
                .setProperty("password", "4111111111111111");
            group
                .createEntry("Key")
                .setAttribute(Entry.Attributes.FacadeType, EntryType.SSHKey)
                .setProperty("publicKey", "ssh-ed25519 AAAA");
            return roundTrip(vault).then((entries) => {
                const types = entries.map((entry) => entry.getType()).sort();
                expect(types).to.deep.equal([
                    EntryType.CreditCard,
                    EntryType.SSHKey,
                ]);
            });
        });

        it("imports older exports without the new columns as logins", function () {
            // The CSV from #64
            const csv = [
                "!type,!group_id,!group_name,!group_parent,title,note,id",
                `group,${GROUP_ID},General,0,,,`,
                "group,3af33a28-fb91-4a18-9ef5-9b9730ed5078,Trash,0,,,",
                `entry,${GROUP_ID},,,Note-Title,1234,${ENTRY_ID}`,
            ].join("\n");
            return new ButtercupCSVImporter(csv).export().then((vault) => {
                const [entry] = vault.getAllEntries();
                expect(entry.getType()).to.equal(EntryType.Login);
                expect(entry.getProperty("note")).to.equal("1234");
            });
        });

        it("fails on an unknown entry type", function () {
            return importRow("!entry_type", "spaceship").then(
                () => {
                    throw new Error("Should have failed");
                },
                (err) => {
                    expect(err.message).to.match(
                        /Unrecognised entry type in import: spaceship/,
                    );
                },
            );
        });

        it("fails on attributes that aren't a JSON object", function () {
            return importRow("!attributes", "not json").then(
                () => {
                    throw new Error("Should have failed");
                },
                (err) => {
                    expect(err.message).to.match(
                        /Invalid attributes in import/,
                    );
                },
            );
        });

        it("skips the type, attachment and unsafe keys in attributes", function () {
            const attributes = JSON.stringify({
                [Entry.Attributes.FacadeType]: EntryType.Note,
                [`${Entry.Attributes.AttachmentPrefix}abc`]: "{}",
                ["__proto__"]: "polluted",
                [ATTRIBUTE_TAGS]: "kept",
                number: 5,
            }).replace(/"/g, '""');
            return importRow(
                "!entry_type,!attributes",
                `website,"${attributes}"`,
            ).then((vault) => {
                const [entry] = vault.getAllEntries();
                expect(entry.getType()).to.equal(EntryType.Website);
                expect(entry.getAttribute()).to.deep.equal({
                    [Entry.Attributes.FacadeType]: EntryType.Website,
                    [ATTRIBUTE_TAGS]: "kept",
                });
                expect({}.polluted).to.be.undefined;
            });
        });

        it("keeps attributes named like built-in object properties (B-461)", function () {
            const attributes = JSON.stringify({
                constructor: "c",
                prototype: "p",
            }).replace(/"/g, '""');
            return importRow(
                "!entry_type,!attributes",
                `login,"${attributes}"`,
            ).then((vault) => {
                const [entry] = vault.getAllEntries();
                expect(entry.getAttribute("constructor")).to.equal("c");
                expect(entry.getAttribute("prototype")).to.equal("p");
            });
        });

        it("round-trips fields named like built-in object properties (B-461)", function () {
            const vault = new Vault();
            vault
                .createGroup("General")
                .createEntry("Test")
                .setProperty("constructor", "c")
                .setProperty("prototype", "p")
                .setProperty("toString", "t");
            return roundTrip(vault).then(([entry]) => {
                expect(entry.getProperty("constructor")).to.equal("c");
                expect(entry.getProperty("prototype")).to.equal("p");
                expect(entry.getProperty("toString")).to.equal("t");
            });
        });
    });
});
