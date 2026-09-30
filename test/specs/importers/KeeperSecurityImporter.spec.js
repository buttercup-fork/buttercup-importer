const path = require("path");
const KeeperSecurityImporter = require("../../../source/importers/KeeperSecurityImporter.js");
const { Entry, Group, Vault } = require("buttercup");

const EXAMPLE_VAULT = path.resolve(__dirname, "../../resources/keeper.json");

describe("KeeperSecurityImporter", function () {
    beforeEach(function () {
        return KeeperSecurityImporter.loadFromFile(EXAMPLE_VAULT)
            .then((importer) => importer.export())
            .then((vault) => {
                this.vault = vault;
            });
    });

    it("creates a vault instance", function () {
        expect(this.vault).to.be.an.instanceOf(Vault);
    });

    it("contains expected groups", function () {
        // I'd prefer to use the function 'getGroups' however, this seems to be missing groups in the _groups structure?
        const groups = this.vault._groups.map((g) => g.getTitle());
        expect(groups).to.have.lengthOf(3);
        expect(groups).to.contain("Foo");
        expect(groups).to.contain("Bar");
    });

    it("imports login properties", function () {
        const [entry] = this.vault.findEntriesByProperty(
            "title",
            "Folder Test",
        );
        expect(entry).to.be.an.instanceOf(Entry);
        expect(entry.getProperty("username")).to.equal("username1");
        expect(entry.getProperty("password")).to.equal("password1");
    });

    it("imports URLs", function () {
        const [entry] = this.vault.findEntriesByProperty(
            "title",
            "Username Test",
        );
        expect(entry).to.be.an.instanceOf(Entry);
        expect(entry.getProperty("URL")).to.equal("https://example.org/");
        // @todo should be a website
    });

    it("imports each record once, into its folder", function () {
        expect(this.vault.getAllEntries()).to.have.lengthOf(3);
        const [general] = this.vault.findGroupsByTitle("General");
        const [bar] = this.vault.findGroupsByTitle("Bar");
        const titles = (group) =>
            group.getEntries().map((e) => e.getProperty("title"));
        expect(titles(general)).to.deep.equal(["Username Test"]);
        expect(titles(bar)).to.have.members([
            "Folder Test",
            "Sub Folder Entry Test",
        ]);
        expect(bar.getParentGroup().getTitle()).to.equal("Foo");
    });
});
