const path = require("path");
const OnePasswordImporter = require("../../../source/importers/OnePasswordImporter.js");
const { Entry, Group, Vault } = require("buttercup");

const EXAMPLE_VAULT = path.resolve(
    __dirname,
    "../../resources/test-1password.1pif",
);

describe("OnePasswordImporter", function () {
    beforeEach(function () {
        return OnePasswordImporter.loadFromFile(EXAMPLE_VAULT)
            .then((importer) => importer.export())
            .then((vault) => {
                this.vault = vault;
            });
    });

    it("creates a vault instance", function () {
        expect(this.vault).to.be.an.instanceOf(Vault);
    });

    it("cantains expected groups", function () {
        const generalGroup = this.vault.findGroupsByTitle("General")[0];
        expect(generalGroup).to.be.an.instanceOf(Group);
        const subGroup = generalGroup.findGroupsByTitle("Sub")[0];
        expect(subGroup).to.be.an.instanceOf(Group);
    });

    it("contains expected entries", function () {
        const testEntry = this.vault.findEntriesByProperty("title", "Test")[0];
        const customCard = this.vault.findEntriesByProperty(
            "title",
            "Custom card",
        )[0];
        expect(testEntry).to.be.an.instanceOf(Entry);
        expect(customCard).to.be.an.instanceOf(Entry);
    });
});

describe("OnePasswordImporter (missing path)", function () {
    it("rejects a path that doesn't exist", async function () {
        const missing = path.resolve(__dirname, "../../resources/missing.1pif");
        let error = null;
        try {
            await OnePasswordImporter.loadFromFile(missing);
        } catch (err) {
            error = err;
        }
        expect(error).to.have.property("code", "ENOENT");
    });
});

describe("OnePasswordImporter (1Password for Windows 4, #40)", function () {
    beforeEach(function () {
        return OnePasswordImporter.loadFromFile(
            path.resolve(
                __dirname,
                "../../resources/test-1password-windows.1pif",
            ),
        )
            .then((importer) => importer.export())
            .then((vault) => {
                this.vault = vault;
            });
    });

    it("imports logins from items with a category instead of a type name", function () {
        const [entry] = this.vault.findEntriesByProperty(
            "title",
            "buttercup.pw",
        );
        expect(entry).to.be.an.instanceOf(Entry);
        expect(entry.getProperty("username")).to.equal("importer@buttercup.pw");
        expect(entry.getProperty("password")).to.equal("if0bUeNqStN5Uqhp");
        expect(entry.getProperty("url")).to.equal("https://buttercup.pw");
    });

    it("imports credit cards from section fields", function () {
        const [entry] = this.vault.findEntriesByProperty("title", "Test card");
        expect(entry).to.be.an.instanceOf(Entry);
        expect(entry.getProperty("username")).to.equal("4111111111111111");
        expect(entry.getProperty("password")).to.equal("123");
        expect(entry.getProperty("cardholder")).to.equal("Jane Doe");
    });
});

describe("OnePasswordImporter (folders missing from the export, B-674)", function () {
    const folder = (uuid, title, folderUuid) => ({
        uuid,
        typeName: "system.folder.Regular",
        title,
        ...(folderUuid ? { folderUuid } : {}),
    });
    const login = (uuid, title, folderUuid) => ({
        uuid,
        typeName: "webforms.WebForm",
        title,
        ...(folderUuid ? { folderUuid } : {}),
        secureContents: {
            fields: [{ designation: "password", value: `${title} password` }],
        },
    });

    function importItems(items) {
        const data = items
            .map((item) => JSON.stringify(item))
            .join("\n***5642bee8-a5ff-11dc-8314-0800200c9a66***\n");
        return new OnePasswordImporter(data).export();
    }

    it("imports every item, also those whose folder is not in the export", function () {
        return importItems([
            folder("f1", "Kept"),
            folder("f2", "Parent gone", "gone-folder"),
            folder("f3", "Loop A", "f4"),
            folder("f4", "Loop B", "f3"),
            login("i1", "In kept folder", "f1"),
            login("i2", "Folder gone", "gone-folder"),
            login("i3", "In folder with gone parent", "f2"),
            login("i4", "In folder loop", "f3"),
            login("i5", "No folder"),
        ]).then((vault) => {
            const entries = vault.getAllEntries();
            expect(
                entries.map((entry) => entry.getProperty("title")),
            ).to.have.members([
                "In kept folder",
                "Folder gone",
                "In folder with gone parent",
                "In folder loop",
                "No folder",
            ]);
            const groupOf = (title) =>
                vault
                    .findEntriesByProperty("title", title)[0]
                    .getGroup()
                    .getTitle();
            expect(groupOf("In kept folder")).to.equal("Kept");
            expect(groupOf("Folder gone")).to.equal("Imported 1password vault");
            expect(groupOf("In folder with gone parent")).to.equal(
                "Parent gone",
            );
            expect(groupOf("In folder loop")).to.equal("Loop A");
            expect(groupOf("No folder")).to.equal("webforms.WebForm");
        });
    });
});
