// @vitest-environment jsdom
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {newGrantTabName, submitGrant} from "./submitGrant";

let submit: ReturnType<typeof vi.spyOn>;
beforeEach(() => { submit = vi.spyOn(HTMLFormElement.prototype, "submit").mockImplementation(() => {}); });
afterEach(() => vi.restoreAllMocks());

describe("submitGrant", () => {
    it("posts grant and next to the endpoint into the named tab and removes the form", () => {
        submitGrant("cib-lab-1", {url: "https://web-1.labs.test/_auth", grant: "g.r.t"}, "/panel?x=1");
        expect(submit).toHaveBeenCalledTimes(1);
        expect(document.querySelector("form")).toBeNull();
    });

    it.each([
        "http://web-1.labs.test/_auth", "http://localhost/_auth", "https://web-1.labs.test/", "https://web-1.labs.test/_auth/x",
        "https://web-1.labs.test/other", "https://web-1.labs.test/_auth?", "https://web-1.labs.test/_auth?a=b", "https://web-1.labs.test/_auth#",
        "https://web-1.labs.test/_auth#x", "https://user:pw@web-1.labs.test/_auth", "javascript:alert(1)", "data:text/html,x", "/_auth", "",
    ])("refuses the endpoint %s", url => {
        expect(() => submitGrant("cib-lab-1", {url, grant: "g"}, "/")).toThrow();
        expect(submit).not.toHaveBeenCalled();
        expect(document.querySelector("form")).toBeNull();
    });

    it("refuses an empty grant", () => {
        expect(() => submitGrant("cib-lab-1", {url: "https://web-1.labs.test/_auth", grant: ""}, "/")).toThrow();
        expect(submit).not.toHaveBeenCalled();
    });

    it("names every tab differently", () => {
        expect(newGrantTabName()).not.toBe(newGrantTabName());
        expect(newGrantTabName()).toMatch(/^cib-lab-./);
    });
});
