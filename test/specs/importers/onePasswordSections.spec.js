const path = require("path");
const OnePasswordImporter = require("../../../source/importers/OnePasswordImporter.js");
const { EntryPropertyValueType } = require("buttercup");

function onePif(items) {
    return items.map((item) => JSON.stringify(item)).join("\n");
}

function onePasswordLogin(title, sections, extra = {}) {
    return {
        uuid: title,
        typeName: "webforms.WebForm",
        title,
        secureContents: {
            fields: [
                { designation: "username", value: "me" },
                { designation: "password", value: "pass" },
            ],
            sections,
            ...extra,
        },
    };
}

async function importEntry(items, title) {
    const vault = await new OnePasswordImporter(onePif(items)).export();
    const [entry] = vault.findEntriesByProperty("title", title);
    expect(entry, `entry "${title}"`).to.be.ok;
    return entry;
}

describe("OnePasswordImporter: sections and custom fields (#43)", function () {
    it("imports custom section fields by their label", async function () {
        const entry = await importEntry(
            [
                onePasswordLogin("Custom", [
                    {
                        title: "Security",
                        fields: [
                            {
                                k: "string",
                                n: "A1B2",
                                t: "memorable word",
                                v: "tulip",
                            },
                            {
                                k: "URL",
                                n: "C3D4",
                                t: "recovery page",
                                v: "https://x.test",
                            },
                        ],
                    },
                ]),
            ],
            "Custom",
        );
        expect(entry.getProperty("memorable word")).to.equal("tulip");
        expect(entry.getProperty("recovery page")).to.equal("https://x.test");
        expect(entry.getProperty("username")).to.equal("me");
    });

    it("marks concealed fields as passwords", async function () {
        const entry = await importEntry(
            [
                onePasswordLogin("Concealed", [
                    {
                        fields: [
                            { k: "concealed", n: "pin", t: "PIN", v: "1234" },
                        ],
                    },
                ]),
            ],
            "Concealed",
        );
        expect(entry.getProperty("PIN")).to.equal("1234");
        expect(entry.getPropertyValueType("PIN")).to.equal(
            EntryPropertyValueType.Password,
        );
    });

    it("formats dates, month/year values and addresses", async function () {
        const entry = await importEntry(
            [
                onePasswordLogin("Formats", [
                    {
                        fields: [
                            {
                                k: "date",
                                n: "birth",
                                t: "birth date",
                                v: 946684800,
                            },
                            {
                                k: "monthYear",
                                n: "since",
                                t: "member since",
                                v: 201911,
                            },
                            {
                                k: "address",
                                n: "address",
                                t: "address",
                                v: {
                                    street: "1 Main St",
                                    city: "Wellington",
                                    zip: "6011",
                                },
                            },
                        ],
                    },
                ]),
            ],
            "Formats",
        );
        expect(entry.getProperty("birth date")).to.equal("2000-01-01");
        expect(entry.getProperty("member since")).to.equal("11/2019");
        expect(entry.getProperty("address")).to.equal(
            "1 Main St\nWellington\n6011",
        );
        expect(entry.getPropertyValueType("address")).to.equal(
            EntryPropertyValueType.Note,
        );
    });

    it("skips empty fields and fields without a name", async function () {
        const entry = await importEntry(
            [
                onePasswordLogin("Empty", [
                    {
                        fields: [
                            { k: "string", n: "a", t: "empty", v: "" },
                            { k: "string", n: "b", t: "missing" },
                            { k: "string", v: "orphan" },
                        ],
                    },
                ]),
            ],
            "Empty",
        );
        const names = Object.keys(entry.getProperty());
        expect(names).to.not.include("empty");
        expect(names).to.not.include("missing");
        expect(Object.values(entry.getProperty())).to.not.include("orphan");
    });

    it("keeps both of two fields with the same label", async function () {
        const entry = await importEntry(
            [
                onePasswordLogin("Twice", [
                    {
                        title: "Home",
                        fields: [{ k: "string", n: "x", t: "code", v: "1" }],
                    },
                    {
                        title: "Work",
                        fields: [{ k: "string", n: "y", t: "code", v: "2" }],
                    },
                ]),
            ],
            "Twice",
        );
        expect(entry.getProperty("code")).to.equal("1");
        expect(entry.getProperty("code 2")).to.equal("2");
    });

    it("imports notes", async function () {
        const entry = await importEntry(
            [
                onePasswordLogin("Notes", [], {
                    notesPlain: "line one\nline two",
                }),
            ],
            "Notes",
        );
        expect(entry.getProperty("Notes")).to.equal("line one\nline two");
        expect(entry.getPropertyValueType("Notes")).to.equal(
            EntryPropertyValueType.Note,
        );
    });

    it("doesn't repeat card fields that are already imported", async function () {
        const vault = await (
            await OnePasswordImporter.loadFromFile(
                path.resolve(__dirname, "../../resources/test-1password.1pif"),
            )
        ).export();
        const [card] = vault.findEntriesByProperty("title", "Custom card");
        const values = Object.values(card.getProperty());
        expect(
            values.filter((value) => value === "4532-3453-2356-1234"),
        ).to.have.lengthOf(1);
        expect(values.filter((value) => value === "032")).to.have.lengthOf(1);
        expect(card.getProperty("cardholder")).to.equal("Bob User");
        expect(Object.keys(card.getProperty())).to.not.include(
            "cardholder name",
        );
    });

    it("imports a 1Password for Windows custom section", async function () {
        const vault = await (
            await OnePasswordImporter.loadFromFile(
                path.resolve(
                    __dirname,
                    "../../resources/test-1password-windows.1pif",
                ),
            )
        ).export();
        const [entry] = vault.findEntriesByProperty("title", "buttercup.pw");
        expect(entry.getProperty("name")).to.equal("Buttercup");
        const [card] = vault.findEntriesByProperty("title", "Test card");
        expect(Object.keys(card.getProperty())).to.not.include("number");
    });
});
