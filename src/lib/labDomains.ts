import { labDomainList } from "./consoleFrame"

/**
 * The extra lab base domains of the installation (NEXT_PUBLIC_LAB_DOMAINS, README), carried to the browser the way the installation
 * settings are (src/lib/settings.ts): the root layout writes the value into an attribute of <html>. In an image the attribute holds the
 * placeholder __NEXT_PUBLIC_LAB_DOMAINS__ that the container entrypoint replaces with the value or with an empty string. The variable is
 * read by its literal name and only assigned: nothing a minifier could fold at build time.
 *
 * It is not one of the optional settings of settings.ts: it hides nothing and is not a URL, so the shared rule of deploy/cfg-check.sh
 * does not apply; the entrypoint checks its characters and labDomainList drops every entry that is not a plain domain name.
 */
export const labDomainsAttrs = () => ({
  "data-lab-domains": process.env.NEXT_PUBLIC_LAB_DOMAINS,
})

/** The extra lab domains, read from <html>. Only in event handlers and effects, never while rendering. */
export const labDomainsOfPage = (): string[] => labDomainList(document.documentElement.getAttribute("data-lab-domains"))
