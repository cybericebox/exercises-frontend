/**
 * The editor kit: the shared patterns every package builds its views from. Import from here, not from the files, so a
 * pattern can move without touching the views.
 */
export { FieldLabel } from "@/components/ui/field-label"
export { FieldHelp } from "@/components/ui/field-help"
export { HelpBody, helpPlain, sentence, type HelpContent } from "@/components/ui/help-content"
export { SwitchBlock, SwitchList } from "@/components/ui/switch-block"
export { SelectMenu, type SelectMenuOption } from "@/components/ui/select-menu"
export { CheckMenu, type CheckMenuOption } from "@/components/ui/check-menu"
export { ExpandableRow } from "@/components/ui/expandable-row"
export { MaskedInput, MaskedText } from "@/components/ui/masked-value"
export { RowActions, type RowAction } from "@/components/exercises/RowActions"
export { RemoveAction, REVEAL_ON_HOVER } from "@/components/exercises/RemoveAction"
export { ConfirmRemoveAction } from "@/components/exercises/ConfirmRemoveAction"
export { SectionAddButton as AddButton } from "@/components/exercises/SectionAddButton"
export { ConfirmDialog } from "@/components/ui/confirm-dialog"
export { Button as BusyButton } from "@/components/ui/button"
export { SidePanel, SummaryList, type SummaryRow } from "./SidePanel"
export { ViewToolbar } from "./ViewToolbar"
export { FieldError, fieldId, fieldProps, useFieldError, firstErrorPath } from "../fieldErrors"
export { useEditor, type EditorApi, type EditorTarget } from "../context"
export { taskRefOptions, type TaskRefOption } from "./taskRefs"
