const BitwardenImporter = require("../../../source/importers/BitwardenImporter.js");
const KeePass2XMLImporter = require("../../../source/importers/KeePass2XMLImporter.js");
const LastPassImporter = require("../../../source/importers/LastPassImporter.js");
const OnePasswordImporter = require("../../../source/importers/OnePasswordImporter.js");

// Names that are Object.prototype members must not abort an import (B-676)
describe("Names like Object.prototype members (B-676)", function () {
    afterEach(function () {
        expect(Object.keys(Object.prototype)).to.have.lengthOf(0);
    });

    it("LastPass: imports groups named constructor, toString and __proto__", function () {
        const csv = [
            "url,username,password,extra,name,grouping,fav",
            "https://a.example,ua,pa,,A,constructor,0",
            "https://b.example,ub,pb,,B,toString,0",
            "https://c.example,uc,pc,,C,__proto__,0",
            "https://d.example,ud,pd,,D,constructor,0",
        ].join("\n");
        return new LastPassImporter(csv).export().then((vault) => {
            const groups = vault.getGroups().map((group) => group.getTitle());
            expect(groups).to.have.members([
                "constructor",
                "toString",
                "__proto__",
            ]);
            const [constructorGroup] = vault.findGroupsByTitle("constructor");
            expect(
                constructorGroup
                    .getEntries()
                    .map((entry) => entry.getProperty("title")),
            ).to.deep.equal(["A", "D"]);
            expect(vault.getAllEntries()).to.have.lengthOf(4);
        });
    });

    it("Bitwarden: keeps a custom field named __proto__ as __proto__ 2", function () {
        const data = {
            folders: [],
            items: [
                {
                    id: "1",
                    name: "Login",
                    type: 1,
                    login: { username: "u", password: "p", uris: null },
                    fields: [
                        { name: "__proto__", value: "proto value", type: 0 },
                        { name: "constructor", value: "c", type: 0 },
                    ],
                },
            ],
        };
        return new BitwardenImporter(JSON.stringify(data))
            .export()
            .then((vault) => {
                const [entry] = vault.getAllEntries();
                expect(entry.getProperty("password")).to.equal("p");
                expect(entry.getProperty("__proto__ 2")).to.equal(
                    "proto value",
                );
                expect(entry.getProperty("constructor")).to.equal("c");
            });
    });

    it("KeePass XML: keeps a key named __proto__ as __proto__ 2", function () {
        const xml = `<?xml version="1.0" encoding="utf-8"?>
<KeePassFile><Root><Group><Name>Root</Name>
<Group><Name>Sub</Name><Entry>
<String><Key>Title</Key><Value>Entry</Value></String>
<String><Key>Password</Key><Value>pw</Value></String>
<String><Key>__proto__</Key><Value>proto value</Value></String>
</Entry></Group></Group></Root></KeePassFile>`;
        return new KeePass2XMLImporter(xml).export().then((vault) => {
            const [entry] = vault.getAllEntries();
            expect(entry.getProperty("title")).to.equal("Entry");
            expect(entry.getProperty("password")).to.equal("pw");
            expect(entry.getProperty("__proto__ 2")).to.equal("proto value");
        });
    });

    it("1Password .1pif: keeps a field named __proto__ and a folder with the UUID __proto__", function () {
        const items = [
            {
                uuid: "__proto__",
                typeName: "system.folder.Regular",
                title: "Proto folder",
            },
            {
                uuid: "item-1",
                typeName: "webforms.WebForm",
                title: "Login",
                folderUuid: "__proto__",
                secureContents: {
                    fields: [
                        { designation: "username", value: "u" },
                        { designation: "password", value: "p" },
                    ],
                    sections: [
                        {
                            fields: [
                                {
                                    k: "string",
                                    n: "x",
                                    t: "__proto__",
                                    v: "proto value",
                                },
                            ],
                        },
                    ],
                },
            },
        ];
        const data = items
            .map((item) => JSON.stringify(item))
            .join("\n***5642bee8-a5ff-11dc-8314-0800200c9a66***\n");
        return new OnePasswordImporter(data).export().then((vault) => {
            const [entry] = vault.getAllEntries();
            expect(entry.getProperty("password")).to.equal("p");
            expect(entry.getProperty("__proto__ 2")).to.equal("proto value");
            expect(entry.getGroup().getTitle()).to.equal("Proto folder");
        });
    });
});
