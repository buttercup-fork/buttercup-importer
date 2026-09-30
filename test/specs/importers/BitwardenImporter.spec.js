const path = require("path");
const BitwardenImporter = require("../../../source/importers/BitwardenImporter.js");
const { Entry, Group, Vault } = require("buttercup");

const EXAMPLE_VAULT = path.resolve(__dirname, "../../resources/bitwarden.json");

describe("BitwardenImporter", function () {
    beforeEach(function () {
        return BitwardenImporter.loadFromFile(EXAMPLE_VAULT)
            .then((importer) => importer.export())
            .then((vault) => {
                this.vault = vault;
            });
    });

    it("creates a vault instance", function () {
        expect(this.vault).to.be.an.instanceOf(Vault);
    });

    it("cantains expected groups", function () {
        const groups = this.vault.getGroups().map((g) => g.getTitle());
        expect(groups).to.have.lengthOf(2);
        expect(groups).to.contain("General");
        expect(groups).to.contain("FooBar");
    });

    it("contains expected entries", function () {
        const [entry] = this.vault.findEntriesByProperty(
            "title",
            "Item without any info",
        );
        expect(entry).to.be.an.instanceOf(Entry);
        expect(entry.getProperty("username")).to.be.undefined;
        expect(entry.getProperty("password")).to.be.undefined;
    });

    it("imports login properties", function () {
        const [entry] = this.vault.findEntriesByProperty(
            "title",
            "Item with login",
        );
        expect(entry).to.be.an.instanceOf(Entry);
        expect(entry.getProperty("username")).to.equal("username1");
        expect(entry.getProperty("password")).to.equal("password1");
        // @todo should be a login
    });

    it("imports URLs", function () {
        const [entry] = this.vault.findEntriesByProperty(
            "title",
            "Item with login uri",
        );
        expect(entry).to.be.an.instanceOf(Entry);
        expect(entry.getProperty("URL")).to.equal("https://example.org");
        // @todo should be a website
    });

    it("imports notes", function () {
        const [entry] = this.vault.findEntriesByProperty(
            "title",
            "Item with notes",
        );
        expect(entry).to.be.an.instanceOf(Entry);
        expect(entry.getProperty("Notes")).to.equal("This is a note");
        // @todo should be a note
    });

    it("imports fields as properties", function () {
        const [entry] = this.vault.findEntriesByProperty(
            "title",
            "Item with fields",
        );
        expect(entry).to.be.an.instanceOf(Entry);
        expect(entry.getProperty("field1")).to.equal("example.com");
        expect(entry.getProperty("field2")).to.equal("value2");
    });
});

describe("BitwardenImporter (current export format, #51)", function () {
    const item = (props) => ({
        id: props.name,
        organizationId: null,
        folderId: null,
        collectionIds: null,
        notes: null,
        fields: [],
        ...props,
    });

    function importJSON(data) {
        return new BitwardenImporter(JSON.stringify(data)).export();
    }

    function getEntry(vault, title) {
        return vault.findEntriesByProperty("title", title)[0];
    }

    it("imports organisation exports, which have collections instead of folders", function () {
        return importJSON({
            encrypted: false,
            collections: [{ id: "c1", name: "Shared" }],
            items: [
                item({
                    name: "Org login",
                    type: 1,
                    collectionIds: ["c1"],
                    login: { username: "u", password: "p", uris: null },
                }),
            ],
        }).then((vault) => {
            const entry = getEntry(vault, "Org login");
            expect(entry.getGroup().getTitle()).to.equal("Shared");
            expect(entry.getProperty("password")).to.equal("p");
        });
    });

    it("puts items with an unknown folder in the default group", function () {
        return importJSON({
            folders: [],
            items: [
                item({
                    name: "Lost",
                    type: 2,
                    folderId: "missing",
                    notes: "x",
                }),
            ],
        }).then((vault) => {
            expect(getEntry(vault, "Lost").getGroup().getTitle()).to.equal(
                "General",
            );
        });
    });

    it("imports secure notes as note entries", function () {
        return importJSON({
            folders: [],
            items: [item({ name: "Note", type: 2, notes: "secret text" })],
        }).then((vault) => {
            const entry = getEntry(vault, "Note");
            expect(entry.getType()).to.equal("note");
            expect(entry.getProperty("note")).to.equal("secret text");
        });
    });

    it("imports cards as credit card entries", function () {
        return importJSON({
            folders: [],
            items: [
                item({
                    name: "Card",
                    type: 3,
                    card: {
                        cardholderName: "Jane Doe",
                        brand: "Visa",
                        number: "4111111111111111",
                        expMonth: "3",
                        expYear: "2030",
                        code: "123",
                    },
                }),
            ],
        }).then((vault) => {
            const entry = getEntry(vault, "Card");
            expect(entry.getType()).to.equal("credit_card");
            expect(entry.getProperty("username")).to.equal("Jane Doe");
            expect(entry.getProperty("password")).to.equal("4111111111111111");
            expect(entry.getProperty("type")).to.equal("visa");
            expect(entry.getProperty("cvv")).to.equal("123");
            expect(entry.getProperty("expiry")).to.equal("03/2030");
        });
    });

    it("imports identity details as properties", function () {
        return importJSON({
            folders: [],
            items: [
                item({
                    name: "Me",
                    type: 4,
                    identity: {
                        firstName: "Jane",
                        lastName: null,
                        email: "j@x.io",
                    },
                }),
            ],
        }).then((vault) => {
            const entry = getEntry(vault, "Me");
            expect(entry.getProperty("firstName")).to.equal("Jane");
            expect(entry.getProperty("email")).to.equal("j@x.io");
            expect(entry.getProperty("lastName")).to.be.undefined;
        });
    });

    it("imports SSH keys as SSH key entries", function () {
        return importJSON({
            folders: [],
            items: [
                item({
                    name: "Key",
                    type: 5,
                    sshKey: {
                        privateKey: "PRIV",
                        publicKey: "PUB",
                        keyFingerprint: "FP",
                    },
                }),
            ],
        }).then((vault) => {
            const entry = getEntry(vault, "Key");
            expect(entry.getType()).to.equal("ssh_key");
            expect(entry.getProperty("privateKey")).to.equal("PRIV");
            expect(entry.getProperty("publicKey")).to.equal("PUB");
        });
    });

    it("rejects encrypted exports with a clear message", function () {
        return importJSON({ encrypted: true, data: "..." }).then(
            () => {
                throw new Error("Should have failed");
            },
            (err) => {
                expect(err.message).to.match(/unencrypted JSON/);
            },
        );
    });
});
