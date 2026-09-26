const path = require("path");
const fs = require("fs");
const { exportVaultToCSV } = require("@buttercup/exporter");
const { Entry, Group, Vault } = require("buttercup");
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
            "Should be only 1 child group"
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
});
