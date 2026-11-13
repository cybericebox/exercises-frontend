/**
 * Optional installation settings (README, Installation settings).
 *
 * Every setting is optional and "no value = not shown". The value of each one is written into an attribute of <html>
 * (settingsAttrs, spread in the root layout); src/styles/cfg.css hides the optional blocks by those attributes, so no JavaScript
 * decides what is shown and nothing moves after load. In an image the attribute holds a placeholder (__NEXT_PUBLIC_X__) that the container
 * entrypoint replaces with the value or with an empty string; in a build with real values it holds the value itself.
 *
 * Each variable is read by its literal name (Next inlines it) and only assigned to an attribute: no comparison, no `||`, no `??`, nothing a
 * minifier could fold into a constant at build time. A variable that does not exist at all (local `next dev`) leaves the attribute out; an
 * empty one gives data-cfg-x="". Both mean "empty".
 */
export const settingsAttrs = () => ({
  "data-cfg-main-site-url": process.env.NEXT_PUBLIC_MAIN_SITE_URL,
  "data-cfg-cookies-url": process.env.NEXT_PUBLIC_COOKIES_URL,
})

export type SettingName = "main-site-url" | "cookies-url"

/**
 * The value of a setting, read from <html>. Only in event handlers, effects and validation, never while rendering (a render-time read
 * would differ between the server and the client). "" when the setting is empty or absent.
 */
export const cfg = (name: SettingName): string => document.documentElement.getAttribute(`data-cfg-${name}`) ?? ""
