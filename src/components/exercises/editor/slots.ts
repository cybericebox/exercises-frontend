/**
 * slots.ts — where the packages plug their views into the shell. Each line is owned by one package: it imports the
 * package's component from its own directory (`./general`, `./tasks`, `./infra`, `./test`), which re-exports whatever the
 * package builds. The shell never imports anything else from a package.
 *
 *   A  general/   GeneralView, AllVariantsView, AddVariantWizard, DocumentDialog
 *   B  tasks/     TasksView
 *   C  infra/     InfraView
 *   D  test/      TestStartDialog
 *
 * Views take no props: they read the editor from `useEditor()` (form, variant, disabled, navigation, dialogs).
 */
export { GeneralView, AllVariantsView, AddVariantWizard, DocumentDialog } from "./general"
export { TasksView } from "./tasks"
export { InfraView } from "./infra"
export { TestStartDialog, type TestStartDialogProps } from "./test"
