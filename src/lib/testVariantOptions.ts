import { t } from "@/i18n/t"
import type { TestVariantOption } from "@/components/exercises/ExerciseHeader"

type VariantShape = { Topology: { Devices: readonly unknown[] } }

/**
 * Test-menu entries. A static variant (no devices) needs no laboratory, so the platform state never disables it;
 * a lab variant needs connected laboratories and allowed infrastructure.
 */
export function testVariantOptions(
  variants: readonly VariantShape[],
  platform: { laboratories: boolean | null; infraAllowed: boolean },
  labelOf: (n: number) => string,
): TestVariantOption[] {
  const reason = !platform.infraAllowed ? t("exercises.infra.blocked")
    : platform.laboratories === false ? t("admin.exPage.action.testNoPlatform") : undefined
  // Still loading (null): a lab variant waits disabled, but claims nothing about the platform.
  const waiting = platform.laboratories === null
  return variants.map((variant, index) => {
    const lab = variant.Topology.Devices.length > 0
    return { index, label: labelOf(index + 1), disabled: lab && (reason !== undefined || waiting), ...(lab && reason ? { reason } : {}) }
  })
}
