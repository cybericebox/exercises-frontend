// Opens a lab device without putting any credential in a URL. The platform gives a short-lived grant; the page
// posts it with an auto-submitted form into a tab it opened (named) inside the click, and the lab host turns it
// into its own cookie. The grant lives only in the request body: never in a link, history entry or referrer.

export type GrantLink = {url: string; grant: string};

// One unique name per click, so a form can only ever address the tab opened for it.
export function newGrantTabName(): string {
    const random = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return `cib-lab-${random}`;
}

// The form action is the grant endpoint itself: an absolute http(s) URL with nothing after the path.
function grantEndpoint(raw: string): string {
    const url = new URL(raw);
    if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username || url.password || url.search || url.hash) throw new Error("Invalid grant endpoint");
    return url.href;
}

export function submitGrant(target: string, link: GrantLink, next: string): void {
    if (!link.grant) throw new Error("Missing grant");
    const form = document.createElement("form");
    form.method = "post";
    form.action = grantEndpoint(link.url);
    form.target = target;
    form.hidden = true;
    for (const [name, value] of [["grant", link.grant], ["next", next]] as const) {
        const field = document.createElement("input");
        field.type = "hidden";
        field.name = name;
        field.value = value;
        form.appendChild(field);
    }
    document.body.appendChild(form);
    try {
        form.submit();
    } finally {
        form.remove();
    }
}
