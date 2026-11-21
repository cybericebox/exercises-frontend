// Removes markup from an HTML string, repeating until nothing changes, so "<<b>script>" cannot turn into
// "<script>" after one pass. A "<" that is left (an unclosed tag) is dropped too. Entities are not decoded here.
export function stripTags(html: string): string {
    let text = html;
    for (let previous = ""; previous !== text;) {
        previous = text;
        text = text.replace(/<[^>]*>/g, "");
    }
    return text.replace(/</g, "");
}
