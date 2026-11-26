import { parseApps, visibleApps } from "./apps";

const raw = (v: unknown) => JSON.stringify(v);

describe("parseApps widget", () => {
  it("keeps a known widget and ignores an unknown one", () => {
    const apps = parseApps(raw([{ name: "A", url: "https://a.example.com", widget: "dict-review" }, { name: "B", url: "https://b.example.com", widget: "nope" }, { name: "C", url: "https://c.example.com", widget: 5 }]), false);
    expect(apps.map((a) => a.widget)).toEqual(["dict-review", undefined, undefined]);
  });
});

describe("parseApps", () => {
  it("reads the entries", () => {
    expect(parseApps(raw([{ name: "Dict", url: "https://dict.example.com", icon: "book-open", perm: "dictionary:word:read" }]), false)).toEqual([
      { name: "Dict", url: "https://dict.example.com/", icon: "book-open", perm: "dictionary:word:read" },
    ]);
  });

  it("is empty, without throwing, for a missing or broken value", () => {
    for (const v of [undefined, "", "not json", "{}", "null", "42", '"x"']) expect(parseApps(v, false)).toEqual([]);
  });

  it("drops entries without a name or with an address that is not allowed", () => {
    const apps = parseApps(
      raw([
        { name: "ok", url: "https://ok.example.com" },
        { url: "https://noname.example.com" },
        { name: "  ", url: "https://blank.example.com" },
        { name: "js", url: "javascript:alert(1)" },
        { name: "data", url: "data:text/html,x" },
        { name: "relative", url: "/x" },
        { name: "http", url: "http://plain.example.com" },
        { name: 5, url: "https://n.example.com" },
        "text",
        null,
      ]),
      false,
    );
    expect(apps.map((a) => a.name)).toEqual(["ok"]);
  });

  it("allows http only for a development run", () => {
    const v = raw([{ name: "Local", url: "http://localhost:3000" }]);
    expect(parseApps(v, false)).toEqual([]);
    expect(parseApps(v, true).map((a) => a.name)).toEqual(["Local"]);
  });

  it("ignores a permission or an icon that is not a string", () => {
    expect(parseApps(raw([{ name: "A", url: "https://a.example.com", icon: 3, perm: 7 }]), false)).toEqual([
      { name: "A", url: "https://a.example.com/", icon: undefined, perm: undefined },
    ]);
  });
});

describe("visibleApps", () => {
  const apps = [
    { name: "Open", url: "https://o.example.com/" },
    { name: "Dict", url: "https://d.example.com/", perm: "dictionary:word:read" },
    { name: "Bill", url: "https://b.example.com/", perm: "bill:invoice:read" },
  ];
  it("keeps the apps without a permission and those the user holds", () => {
    expect(visibleApps(apps, (p) => p === "dictionary:word:read").map((a) => a.name)).toEqual(["Open", "Dict"]);
    expect(visibleApps(apps, () => false).map((a) => a.name)).toEqual(["Open"]);
  });
});
