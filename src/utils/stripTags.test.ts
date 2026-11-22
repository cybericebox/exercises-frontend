import {describe, expect, it} from "vitest";
import {stripTags} from "./stripTags";

describe("stripTags", () => {
    it("removes tags and keeps text", () => expect(stripTags("a <b>b</b><br/>c")).toBe("a bc"));
    it("never leaves a tag behind a nested one", () => {
        for (const value of ["<<b>script>alert(1)<</b>/script>", "<scr<b></b>ipt>x", "<<<b>b>b>script>", "<img src=x onerror=alert(1)", "a <b"]) {
            expect(stripTags(value), value).not.toMatch(/</);
        }
        expect(stripTags("<<b>script>alert(1)")).toBe("script>alert(1)");
    });
    it("keeps encoded angle brackets as text", () => expect(stripTags("1 &lt; 2 &amp;&amp; 3 &gt; 2")).toBe("1 &lt; 2 &amp;&amp; 3 &gt; 2"));
});
