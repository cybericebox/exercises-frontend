"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type JSX,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $insertNodes,
  $isRangeSelection,
  $isTextNode,
  $setSelection,
  COMMAND_PRIORITY_CRITICAL,
  COMMAND_PRIORITY_LOW,
  PASTE_COMMAND,
  ParagraphNode,
  type ElementNode,
  DecoratorNode,
  FORMAT_ELEMENT_COMMAND,
  FORMAT_TEXT_COMMAND,
  SELECTION_CHANGE_COMMAND,
  TextNode,
  type DOMConversionMap,
  type DOMConversionOutput,
  type DOMExportOutput,
  type LexicalEditor,
  type NodeKey,
  type SerializedLexicalNode,
  type Spread,
  type BaseSelection,
  type TextFormatType,
} from "lexical";
import { $createCodeNode, $isCodeNode, CodeNode } from "@lexical/code";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { mergeRegister } from "@lexical/utils";
import {
  $createHeadingNode,
  $createQuoteNode,
  $isHeadingNode,
  $isQuoteNode,
  HeadingNode,
  QuoteNode,
  type HeadingTagType,
} from "@lexical/rich-text";
import { $setBlocksType } from "@lexical/selection";
import {
  $isListNode,
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
  ListItemNode,
  ListNode,
  REMOVE_LIST_COMMAND,
} from "@lexical/list";
import { LinkNode, TOGGLE_LINK_COMMAND } from "@lexical/link";
import {
  $generateNodesFromMarkdownString,
  BOLD_ITALIC_STAR,
  BOLD_ITALIC_UNDERSCORE,
  BOLD_STAR,
  BOLD_UNDERSCORE,
  CODE,
  HEADING,
  INLINE_CODE,
  ITALIC_STAR,
  ITALIC_UNDERSCORE,
  LINK,
  ORDERED_LIST,
  QUOTE,
  STRIKETHROUGH,
  UNORDERED_LIST,
  type TextMatchTransformer,
  type Transformer,
} from "@lexical/markdown";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { ListPlugin } from "@lexical/react/LexicalListPlugin";
import { LinkPlugin } from "@lexical/react/LexicalLinkPlugin";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  LexicalTypeaheadMenuPlugin,
  MenuOption,
} from "@lexical/react/LexicalTypeaheadMenuPlugin";
import type { EditorState } from "lexical";
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Code,
  Code2,
  List,
  ListOrdered,
  Link,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Quote,
  Pilcrow,
  RemoveFormatting,
  Braces,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  Heading5,
  Heading6,
  Eye,
  EyeOff,
} from "lucide-react";
import { cn } from "@/utils/cn";
import { t } from "@/i18n/t";
import { type VariableDef } from "./variableUtils";
import { VariablePickerMenu } from "./VariablePickerMenu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LexicalState = Record<string, unknown>;

export const VARIABLE_TEXT_FORMATS: FormatType[] = ["bold", "italic", "underline", "strikethrough", "code"];

const VariablePreviewContext = createContext<{
  definitions: Map<string, VariableDef>;
  unavailableLabels: Record<string, string>;
  onEdit?: (name: string) => void;
  highlight: boolean;
  showNames: boolean;
}>({ definitions: new Map(), unavailableLabels: {}, highlight: true, showNames: false });

export interface RichTextEditorProps {
  value: LexicalState | null;
  onChange: (state: LexicalState) => void;
  variables?: VariableDef[];
  unavailableLabels?: Record<string, string>;
  onInsertVariable?: (insert: (name: string, formats?: TextFormatType[]) => void, initialFormats: TextFormatType[]) => void;
  onEditVariable?: (name: string) => void;
  placeholder?: string;
  className?: string;
  /** Default and min height of the scroll area; short fields (hints) pass a smaller one. */
  minHeightClassName?: string;
  /** false: no text alignment (no toolbar control; aligned content is reset to default). */
  allowAlignment?: boolean;
  /** Accessible name of the editable area. */
  ariaLabel?: string;
  /** Marks the field invalid (validation focus finds it via aria-invalid). */
  invalid?: boolean;
  disabled?: boolean;
  showVariableNames?: boolean;
}

// ---------------------------------------------------------------------------
// VariableNode — custom inline DecoratorNode for {{var}} pills
// ---------------------------------------------------------------------------

type SerializedVariableNode = Spread<{ varName: string; formats?: TextFormatType[] }, SerializedLexicalNode>;

export class VariableNode extends DecoratorNode<JSX.Element> {
  __varName: string;
  __formats: TextFormatType[];

  static getType(): string {
    return "variable";
  }

  static clone(node: VariableNode): VariableNode {
    return new VariableNode(node.__varName, node.__formats, node.__key);
  }

  constructor(varName: string, formats: TextFormatType[] = [], key?: NodeKey) {
    super(key);
    this.__varName = varName;
    this.__formats = formats;
  }

  getFormats(): TextFormatType[] {
    return this.getLatest().__formats;
  }

  setFormats(formats: TextFormatType[]): this {
    this.getWritable().__formats = [...new Set(formats)];
    return this;
  }

  createDOM(): HTMLElement {
    const span = document.createElement("span");
    span.setAttribute("contenteditable", "false");
    return span;
  }

  updateDOM(): boolean {
    return false;
  }

  isInline(): boolean {
    return true;
  }

  isKeyboardSelectable(): boolean {
    return true;
  }

  exportDOM(): DOMExportOutput {
    const el = document.createElement("span");
    el.textContent = `{{${this.__varName}}}`;
    el.dataset.variable = this.__varName;
    return { element: el };
  }

  static importDOM(): DOMConversionMap {
    return {
      span: (node: Node) => {
        const el = node as HTMLSpanElement;
        if (!el.dataset?.variable) return null;
        return {
          conversion: (domNode: Node): DOMConversionOutput => {
            const span = domNode as HTMLSpanElement;
            return {
              node: $createVariableNode(span.dataset.variable ?? ""),
            };
          },
          priority: 1,
        };
      },
    };
  }

  exportJSON(): SerializedVariableNode {
    return {
      type: "variable",
      version: 1,
      varName: this.__varName,
      ...(this.__formats.length ? { formats: this.__formats } : {}),
    };
  }

  static importJSON(serialized: SerializedVariableNode): VariableNode {
    return $createVariableNode(serialized.varName, serialized.formats ?? []);
  }

  decorate(): JSX.Element {
    return <VariablePreview name={this.__varName} formats={this.__formats} />;
  }
}

function VariablePreview({ name, formats }: { name: string; formats: TextFormatType[] }): JSX.Element {
  const { definitions, unavailableLabels, onEdit, highlight, showNames } = useContext(VariablePreviewContext);
  const definition = definitions.get(name);
  const missing = name.startsWith("ph_") && !definition;
  const content = missing ? unavailableLabels[name] ?? t("admin.exPh.missing") : showNames ? name : definition?.example ?? `{{${name}}}`;
  const marked = highlight || missing;
  const style = cn(marked ? "inline-flex items-baseline rounded border px-1 align-baseline leading-[inherit]" : "inline align-baseline leading-[inherit]",
    missing ? "bg-destructive/10 text-destructive border-destructive/30" : highlight ? "bg-primary/10 text-primary border-primary/20" : "bg-transparent text-inherit",
    formats.includes("bold") && "font-bold", formats.includes("italic") && "italic", formats.includes("underline") && "underline",
    formats.includes("strikethrough") && "line-through", formats.includes("code") && "font-mono");
  const cleanStyle = marked ? undefined : { background: "transparent", border: 0, padding: 0, color: "inherit", fontSize: "inherit", lineHeight: "inherit" };
  if (onEdit) return <button type="button" contentEditable={false} className={cn(style, "cursor-pointer hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary")}
    style={cleanStyle} aria-label={`${t("admin.exPh.edit")}: ${content}`} title={definition?.description ?? (missing ? content : name)}
    onClick={(event) => { event.preventDefault(); onEdit(name) }}>{content}</button>;
  return (
      <span
        data-notif-variable={showNames ? name : undefined}
        className={style}
        style={cleanStyle}
        contentEditable={false}
        title={definition?.description ?? (missing ? content : name)}
      >
        {content}
      </span>
  );
}

export function $createVariableNode(varName: string, formats: TextFormatType[] = []): VariableNode {
  return new VariableNode(varName, formats);
}

export function $isVariableNode(node: unknown): node is VariableNode {
  return node instanceof VariableNode;
}

/** Apply a normal text-toolbar command to selected inline placeholders too. */
export function $toggleSelectedVariableFormat(format: TextFormatType): boolean {
  const selection = $getSelection();
  if (!selection || ($isRangeSelection(selection) && selection.isCollapsed())) return false;
  const variables = selection.getNodes().filter($isVariableNode);
  if (variables.length === 0) return false;
  const enable = variables.some((node) => !node.getFormats().includes(format));
  variables.forEach((node) => node.setFormats(enable
    ? [...node.getFormats(), format]
    : node.getFormats().filter((item) => item !== format)));
  return true;
}

// ---------------------------------------------------------------------------
// Tooltip
// ---------------------------------------------------------------------------

function Tooltip({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}): JSX.Element {
  return (
    <div className="group/format-tip relative inline-flex">
      {children}
      <div
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 z-30 rounded-md bg-foreground px-2 py-1 text-[11px] leading-none text-background whitespace-nowrap opacity-0 group-hover/format-tip:opacity-100 group-focus-within/format-tip:opacity-100 transition-opacity"
      >
        {label}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ToolbarPlugin
// ---------------------------------------------------------------------------

type FormatType = "bold" | "italic" | "underline" | "strikethrough" | "code";

const ALIGN_FORMAT_MAP: Record<number, string> = {
  1: "left",
  2: "center",
  3: "right",
  4: "justify",
};

function ToolbarPlugin({
  variables,
  onInsertVariable,
  highlightVariables,
  onToggleVariableHighlight,
  allowAlignment,
}: {
  allowAlignment: boolean;
  variables: VariableDef[];
  onInsertVariable?: (insert: (name: string, formats?: TextFormatType[]) => void, initialFormats: TextFormatType[]) => void;
  highlightVariables: boolean;
  onToggleVariableHighlight: () => void;
}): JSX.Element {
  const [editor] = useLexicalComposerContext();
  const [formats, setFormats] = useState<Set<FormatType>>(new Set());
  const [blockType, setBlockType] = useState<string>("paragraph");
  const [alignment, setAlignment] = useState<string>("");
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [showVarsMenu, setShowVarsMenu] = useState(false);
  const linkInputRef = useRef<HTMLInputElement>(null);
  const varsRef = useRef<HTMLDivElement>(null);
  const savedSelection = useRef<BaseSelection | null>(null);

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (varsRef.current && !varsRef.current.contains(e.target as Node)) {
        setShowVarsMenu(false);
      }
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  useEffect(() => {
    return editor.registerCommand(
      SELECTION_CHANGE_COMMAND,
      () => {
        editor.getEditorState().read(() => {
          const selection = $getSelection();
          if (selection && !$isRangeSelection(selection)) {
            const variable = selection.getNodes().find($isVariableNode);
            if (variable) setFormats(new Set(VARIABLE_TEXT_FORMATS.filter((format) => variable.getFormats().includes(format))));
            return;
          }
          if (!$isRangeSelection(selection)) return;

          const active = new Set<FormatType>();
          if (selection.hasFormat("bold")) active.add("bold");
          if (selection.hasFormat("italic")) active.add("italic");
          if (selection.hasFormat("underline")) active.add("underline");
          if (selection.hasFormat("strikethrough")) active.add("strikethrough");
          if (selection.hasFormat("code")) active.add("code");
          setFormats(active);

          const anchorNode = selection.anchor.getNode();
          const element =
            anchorNode.getKey() === "root"
              ? anchorNode
              : anchorNode.getTopLevelElementOrThrow();

          if ($isHeadingNode(element)) {
            setBlockType(element.getTag());
          } else if ($isListNode(element)) {
            const parent = element.getParent();
            const listNode = $isListNode(parent) ? parent : element;
            setBlockType(listNode.getListType() === "number" ? "ol" : "ul");
          } else if ($isQuoteNode(element)) {
            setBlockType("quote");
          } else if ($isCodeNode(element)) {
            setBlockType("code");
          } else {
            setBlockType("paragraph");
          }

          const elemFmt =
            typeof (element as { getFormat?: () => number }).getFormat ===
            "function"
              ? (element as { getFormat: () => number }).getFormat()
              : 0;
          setAlignment(ALIGN_FORMAT_MAP[elemFmt] ?? "");
        });
        return false;
      },
      COMMAND_PRIORITY_LOW
    );
  }, [editor]);

  const formatText = (format: FormatType) => {
    editor.update(() => {
      const changedVariable = $toggleSelectedVariableFormat(format);
      if (!changedVariable || $isRangeSelection($getSelection())) {
        editor.dispatchCommand(FORMAT_TEXT_COMMAND, format);
      }
    });
  };

  const formatBlock = useCallback(
    (type: string) => {
      editor.update(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return;

        if (type === "paragraph") {
          $setBlocksType(selection, () => $createParagraphNode());
        } else if (/^h[1-6]$/.test(type)) {
          $setBlocksType(selection, () => $createHeadingNode(type as HeadingTagType));
        } else if (type === "quote") {
          $setBlocksType(selection, () => $createQuoteNode());
        } else if (type === "code") {
          $setBlocksType(selection, () => $createCodeNode());
        }
      });

      if (type === "ul") {
        editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined);
      } else if (type === "ol") {
        editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined);
      }
    },
    [editor]
  );

  const insertList = useCallback(
    (listType: "ul" | "ol") => {
      if (blockType === listType) {
        editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined);
      } else if (listType === "ul") {
        editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined);
      } else {
        editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined);
      }
    },
    [editor, blockType]
  );

  const clearFormatting = useCallback(() => {
    editor.update(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return;
      selection.getNodes().forEach((node) => {
        if (node instanceof TextNode) {
          node.setFormat(0);
        }
      });
    });
  }, [editor]);

  const insertVariable = useCallback(
    (varName: string) => {
      editor.update(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          const varNode = $createVariableNode(varName);
          const spaceNode = $createTextNode(" ");
          $insertNodes([varNode, spaceNode]);
        }
      });
      setShowVarsMenu(false);
      // The picker's search input held focus; return it to the editor.
      editor.focus();
    },
    [editor]
  );

  const requestVariableInsertion = () => {
    if (!onInsertVariable) return;
    let savedSelection: BaseSelection | null = null;
    let initialFormats: TextFormatType[] = [];
    editor.getEditorState().read(() => {
      const selection = $getSelection();
      savedSelection = selection?.clone() ?? null;
      if ($isRangeSelection(selection)) {
        const anchor = selection.anchor.getNode();
        initialFormats = VARIABLE_TEXT_FORMATS.filter((format) => selection.hasFormat(format) || ($isTextNode(anchor) && anchor.hasFormat(format)));
      }
    });
    onInsertVariable((name, formats) => insertVariableAtSavedSelection(editor, savedSelection, name, formats), initialFormats);
  };

  const handleLinkInsert = () => {
    if (!showLinkInput) {
      rememberSelection();
      setShowLinkInput(true);
      setTimeout(() => linkInputRef.current?.focus(), 0);
      return;
    }
    if (linkUrl) {
      withSavedSelection(() => editor.dispatchCommand(TOGGLE_LINK_COMMAND, linkUrl));
    }
    setShowLinkInput(false);
    setLinkUrl("");
  };

  const rememberSelection = () => {
    editor.getEditorState().read(() => {
      savedSelection.current = $getSelection()?.clone() ?? null;
    });
  };

  // Menu items take focus from the editor; put the caret back before applying.
  const withSavedSelection = (action: () => void) => {
    const saved = savedSelection.current;
    if (saved) editor.update(() => $setSelection(saved.clone()), { discrete: true });
    action();
    editor.focus();
  };

  const btnBase =
    "inline-flex items-center justify-center w-8 h-8 rounded-md transition-colors";
  const btnInactive = cn(
    btnBase,
    "text-foreground hover:bg-accent hover:text-accent-foreground"
  );
  const btnActive = cn(btnBase, "bg-primary text-primary-foreground");
  const group = "flex items-center gap-0.5 pr-1.5 mr-1 border-r border-input";

  const toolButton = (label: string, active: boolean, onPress: () => void, icon: JSX.Element) => (
    <Tooltip label={label}>
      <button
        type="button"
        aria-label={label}
        aria-pressed={active}
        onMouseDown={(e) => e.preventDefault()}
        onClick={onPress}
        className={active ? btnActive : btnInactive}
      >
        {icon}
      </button>
    </Tooltip>
  );

  const headings = [
    { tag: "h1", Icon: Heading1, label: t("admin.notif.editor.heading1") },
    { tag: "h2", Icon: Heading2, label: t("admin.notif.editor.heading2") },
    { tag: "h3", Icon: Heading3, label: t("admin.notif.editor.heading3") },
    { tag: "h4", Icon: Heading4, label: t("admin.notif.editor.heading4") },
    { tag: "h5", Icon: Heading5, label: t("admin.notif.editor.heading5") },
    { tag: "h6", Icon: Heading6, label: t("admin.notif.editor.heading6") },
  ] as const;
  const alignments = [
    { value: "left", Icon: AlignLeft, label: t("admin.notif.editor.alignLeftTitle") },
    { value: "center", Icon: AlignCenter, label: t("admin.notif.editor.alignCenterTitle") },
    { value: "right", Icon: AlignRight, label: t("admin.notif.editor.alignRightTitle") },
    { value: "justify", Icon: AlignJustify, label: t("admin.notif.editor.alignJustifyTitle") },
  ] as const;
  const isHeading = headings.some((item) => item.tag === blockType);
  const HeadingIcon = headings.find((item) => item.tag === blockType)?.Icon ?? Heading1;
  const AlignIcon = alignments.find((item) => item.value === alignment)?.Icon ?? AlignLeft;
  const variableLabel = t(onInsertVariable ? "admin.exPh.insert" : "admin.notif.editor.insertVariable");
  const markerLabel = t(highlightVariables ? "admin.exPh.cleanView" : "admin.exPh.showMarkers");

  return (
    <div className="rounded-t-lg border-b border-input">
      <div role="toolbar" aria-label={t("admin.notif.editor.toolbar")} className="exercise-editor-toolbar flex flex-wrap items-center gap-0.5 p-1.5">
        <div className={group}>
          {toolButton(t("admin.notif.editor.bold"), formats.has("bold"), () => formatText("bold"), <Bold size={16} aria-hidden />)}
          {toolButton(t("admin.notif.editor.italic"), formats.has("italic"), () => formatText("italic"), <Italic size={16} aria-hidden />)}
          {toolButton(t("admin.notif.editor.underline"), formats.has("underline"), () => formatText("underline"), <Underline size={16} aria-hidden />)}
          {toolButton(t("admin.notif.editor.strikethrough"), formats.has("strikethrough"), () => formatText("strikethrough"), <Strikethrough size={16} aria-hidden />)}
        </div>

        <div className={group}>
          <DropdownMenu modal={false}>
            <Tooltip label={t("admin.notif.editor.heading")}>
              <DropdownMenuTrigger asChild>
                <button type="button" aria-label={t("admin.notif.editor.heading")} onPointerDown={rememberSelection}
                  className={isHeading ? btnActive : btnInactive}>
                  <HeadingIcon size={16} aria-hidden />
                </button>
              </DropdownMenuTrigger>
            </Tooltip>
            <DropdownMenuContent align="start" className="min-w-40" onCloseAutoFocus={(e) => e.preventDefault()}>
              {headings.map(({ tag, Icon, label }) => (
                <DropdownMenuItem key={tag} className={cn("gap-2", blockType === tag && "text-primary")}
                  onSelect={() => withSavedSelection(() => formatBlock(tag))}>
                  <Icon size={16} aria-hidden />
                  {label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          {toolButton(t("admin.notif.editor.paragraph"), blockType === "paragraph", () => formatBlock("paragraph"), <Pilcrow size={16} aria-hidden />)}
        </div>

        {allowAlignment && <div className={group}>
          <DropdownMenu modal={false}>
            <Tooltip label={t("admin.notif.editor.alignment")}>
              <DropdownMenuTrigger asChild>
                <button type="button" aria-label={t("admin.notif.editor.alignment")} onPointerDown={rememberSelection}
                  className={btnInactive}>
                  <AlignIcon size={16} aria-hidden />
                </button>
              </DropdownMenuTrigger>
            </Tooltip>
            <DropdownMenuContent align="start" className="min-w-44" onCloseAutoFocus={(e) => e.preventDefault()}>
              {alignments.map(({ value, Icon, label }) => (
                <DropdownMenuItem key={value} className={cn("gap-2", (alignment || "left") === value && "text-primary")}
                  onSelect={() => withSavedSelection(() => editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, value))}>
                  <Icon size={16} aria-hidden />
                  {label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>}

        <div className={group}>
          {toolButton(t("admin.notif.editor.bulletList"), blockType === "ul", () => insertList("ul"), <List size={16} aria-hidden />)}
          {toolButton(t("admin.notif.editor.numberedList"), blockType === "ol", () => insertList("ol"), <ListOrdered size={16} aria-hidden />)}
        </div>

        <div className={group}>
          {toolButton(t("admin.notif.editor.blockquote"), blockType === "quote", () => formatBlock(blockType === "quote" ? "paragraph" : "quote"), <Quote size={16} aria-hidden />)}
          {toolButton(t("admin.notif.editor.codeBlock"), blockType === "code", () => formatBlock(blockType === "code" ? "paragraph" : "code"), <Code2 size={16} aria-hidden />)}
          {toolButton(t("admin.notif.editor.inlineCode"), formats.has("code"), () => formatText("code"), <Code size={16} aria-hidden />)}
        </div>

        <div className={group}>
          <Tooltip label={t("admin.notif.editor.insertLink")}>
            <button type="button" aria-label={t("admin.notif.editor.insertLink")} aria-pressed={showLinkInput}
              onMouseDown={(e) => e.preventDefault()} onClick={handleLinkInsert} className={showLinkInput ? btnActive : btnInactive}>
              <Link size={16} aria-hidden />
            </button>
          </Tooltip>
        </div>

        <div className={cn(group, "mr-0 border-r-0 pr-0")}>
          {toolButton(t("admin.notif.editor.clearFormatting"), false, clearFormatting, <RemoveFormatting size={16} aria-hidden />)}
        </div>

        <div className="ml-auto flex items-center gap-0.5">
          {(variables.length > 0 || onInsertVariable) && (
            <div className="relative" ref={varsRef}>
              {toolButton(variableLabel, showVarsMenu, () => {
                if (onInsertVariable) requestVariableInsertion();
                else setShowVarsMenu((v) => !v);
              }, <Braces size={16} aria-hidden />)}
              {showVarsMenu && !onInsertVariable && (
                <VariablePickerMenu
                  variables={variables}
                  onSelect={insertVariable}
                  onClose={() => { setShowVarsMenu(false); editor.focus(); }}
                  className="absolute right-0 top-full mt-1"
                />
              )}
            </div>
          )}
          {onInsertVariable && toolButton(markerLabel, highlightVariables, onToggleVariableHighlight,
            highlightVariables ? <EyeOff size={16} aria-hidden /> : <Eye size={16} aria-hidden />)}
        </div>
      </div>

      {showLinkInput && (
        <div className="flex gap-2 px-3 py-2 border-t border-input">
          <input
            ref={linkInputRef}
            type="url"
            aria-label={t("admin.notif.editor.insertLink")}
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleLinkInsert();
              }
              if (e.key === "Escape") {
                setShowLinkInput(false);
                setLinkUrl("");
              }
            }}
            placeholder={t("editor.linkPlaceholder")}
            className="h-8 flex-1 text-sm border border-input rounded-md px-2 outline-none focus:border-primary bg-background text-foreground"
          />
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={handleLinkInsert} disabled={!linkUrl}
            className="h-8 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50">
            {t("admin.notif.editor.addLink")}
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// VariablePlugin — {{var}} typeahead
// ---------------------------------------------------------------------------

class VariableMenuOption extends MenuOption {
  varName: string;
  description: string;

  constructor(varName: string, description: string = "") {
    super(varName);
    this.varName = varName;
    this.description = description;
  }
}

interface VariablePluginProps {
  variables: VariableDef[];
}

function VariablePlugin({ variables }: VariablePluginProps): JSX.Element | null {
  const [editor] = useLexicalComposerContext();
  const { showNames } = useContext(VariablePreviewContext);
  const [queryString, setQueryString] = useState<string | null>(null);

  // Matches literal {{ followed by optional word chars at end of text
  const triggerFn = useCallback(
    (
      text: string
    ): {
      leadOffset: number;
      matchingString: string;
      replaceableString: string;
    } | null => {
      const match = /\{\{(\w*)$/.exec(text);
      if (!match) return null;
      return {
        leadOffset: match.index,
        matchingString: match[1],
        replaceableString: match[0],
      };
    },
    []
  );

  const options: VariableMenuOption[] = (
    queryString != null
      ? variables.filter((v) =>
          v.name.toLowerCase().startsWith(queryString.toLowerCase())
        )
      : variables
  ).map((v) => new VariableMenuOption(v.name, v.description ?? ""));

  const onSelectOption = useCallback(
    (
      option: VariableMenuOption,
      textNodeContainingQuery: import("lexical").TextNode | null,
      closeMenu: () => void
    ) => {
      editor.update(() => {
        replaceVariableQueryWithNode(textNodeContainingQuery, option.varName);
      });
      closeMenu();
    },
    [editor]
  );

  const menuRenderFn: (
    anchorElementRef: RefObject<HTMLElement | null>,
    itemProps: {
      selectedIndex: number | null;
      selectOptionAndCleanUp: (option: VariableMenuOption) => void;
      setHighlightedIndex: (index: number) => void;
      options: VariableMenuOption[];
    },
    matchingString: string
  ) => JSX.Element | null = (
    anchorElementRef,
    { selectedIndex, selectOptionAndCleanUp, options: menuOptions }
  ) => {
    if (menuOptions.length === 0 || !anchorElementRef.current) return null;
    const rect = anchorElementRef.current.getBoundingClientRect();
    return createPortal(
      <div
        className="fixed z-[9999] min-w-[200px] max-h-[240px] overflow-y-auto py-1 rounded-lg bg-popover border border-input"
        style={{ top: rect.bottom + 4, left: rect.left }}
      >
        {menuOptions.map((opt, idx) => (
          <button
            key={opt.key}
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              selectOptionAndCleanUp(opt);
            }}
            className={cn(
              "block w-full text-left px-3 py-1.5 transition-colors",
              selectedIndex === idx
                ? "bg-secondary/60"
                : "hover:bg-secondary/40"
            )}
          >
            <span className="text-xs font-medium text-foreground">{showNames ? opt.varName : `{{${opt.varName}}}`}</span>
            {opt.description && (
              <span className="block text-[10px] font-sans text-muted-foreground mt-0.5">
                {opt.description}
              </span>
            )}
          </button>
        ))}
      </div>,
      document.body
    );
  };

  return (
    <LexicalTypeaheadMenuPlugin<VariableMenuOption>
      onQueryChange={setQueryString}
      onSelectOption={onSelectOption}
      triggerFn={triggerFn}
      options={options}
      menuRenderFn={menuRenderFn}
    />
  );
}

/** Replace only the active {{query, retaining surrounding text and its formatting. */
export function replaceVariableQueryWithNode(textNode: TextNode | null, varName: string): boolean {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed() || !textNode) return false;
  if (selection.anchor.key !== textNode.getKey()) return false;
  const offset = selection.anchor.offset;
  const match = /\{\{\w*$/.exec(textNode.getTextContent().slice(0, offset));
  if (!match) return false;
  selection.setTextNodeRange(textNode, match.index, textNode, offset);
  selection.insertNodes([$createVariableNode(varName)]);
  return true;
}

/** Restore the caret captured before a dialog took focus, then insert one inline token. */
export function insertVariableAtSavedSelection(editor: LexicalEditor, savedSelection: BaseSelection | null, varName: string, requestedFormats?: TextFormatType[]): void {
  editor.update(() => {
    if (savedSelection) $setSelection(savedSelection.clone());
    else $getRoot().selectEnd();
    const selection = $getSelection();
    if ($isRangeSelection(selection)) {
      const anchor = selection.anchor.getNode();
      const inheritedFormats = VARIABLE_TEXT_FORMATS.filter((format) => selection.hasFormat(format) || ($isTextNode(anchor) && anchor.hasFormat(format)));
      selection.insertNodes([$createVariableNode(varName, requestedFormats ?? inheritedFormats), $createTextNode(" ")]);
    } else {
      const paragraph = $createParagraphNode();
      paragraph.append($createVariableNode(varName, requestedFormats ?? []));
      $getRoot().append(paragraph);
    }
  });
}

// ---------------------------------------------------------------------------
// ExternalStateSync — apply value prop changes that did not come from typing
// ---------------------------------------------------------------------------

function ExternalStateSync({ value, lastEmittedRef }: { value: LexicalState | null; lastEmittedRef: RefObject<string | null> }): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const serialized = value ? JSON.stringify(value) : null;
    if (serialized === lastEmittedRef.current) return;
    lastEmittedRef.current = serialized;
    // Defer past the current React flush — Lexical's setEditorState calls
    // flushSync internally, which throws when invoked from a lifecycle method.
    queueMicrotask(() => {
      try {
        if (serialized) {
          editor.setEditorState(editor.parseEditorState(serialized));
        } else {
          editor.update(() => $getRoot().clear().append($createParagraphNode()));
        }
      } catch {
        // malformed or empty root state — leave the editor as is
      }
    });
  }, [editor, value, lastEmittedRef]);

  return null;
}

// ---------------------------------------------------------------------------
// NoAlignmentPlugin — alignment commands are ignored and aligned blocks
// (pasted or loaded) fall back to the default alignment
// ---------------------------------------------------------------------------

function NoAlignmentPlugin(): null {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    const reset = (node: ElementNode) => {
      if (node.getFormatType() !== "") node.setFormat("");
    };
    return mergeRegister(
      editor.registerCommand(FORMAT_ELEMENT_COMMAND, () => true, COMMAND_PRIORITY_CRITICAL),
      ...[ParagraphNode, HeadingNode, QuoteNode, ListItemNode].map((klass) => editor.registerNodeTransform(klass, reset)),
    );
  }, [editor]);
  return null;
}

// ---------------------------------------------------------------------------
// EditableSync — Lexical reads `editable` only on mount
// ---------------------------------------------------------------------------

function EditableSync({ editable }: { editable: boolean }): null {
  const [editor] = useLexicalComposerContext();
  useEffect(() => editor.setEditable(editable), [editor, editable]);
  return null;
}

// ---------------------------------------------------------------------------
// MarkdownPastePlugin — pasted Markdown becomes formatted content
// ---------------------------------------------------------------------------

const MARKDOWN_TRANSFORMERS: Transformer[] = [
  HEADING, QUOTE, CODE, UNORDERED_LIST, ORDERED_LIST,
  INLINE_CODE, BOLD_ITALIC_STAR, BOLD_ITALIC_UNDERSCORE, BOLD_STAR, BOLD_UNDERSCORE,
  ITALIC_STAR, ITALIC_UNDERSCORE, STRIKETHROUGH, LINK,
];

const MARKDOWN_HINT = /(^|\n)\s{0,3}(#{1,6}\s|[-*+]\s|\d+[.)]\s|>\s?|```)|\*\*\S|__\S|~~\S|`[^`\n]+`|\[[^\]\n]+\]\([^)\s]+\)|\{\{[^}\n]+\}\}/;
const VARIABLE_MARKDOWN = /\{\{\s*\.?([A-Za-z_][\w.]*)\s*\}\}/;

function variableTransformer(known: Set<string>): TextMatchTransformer {
  return {
    type: "text-match",
    dependencies: [VariableNode],
    export: (node) => ($isVariableNode(node) ? `{{${node.__varName}}}` : null),
    importRegExp: VARIABLE_MARKDOWN,
    regExp: new RegExp(`${VARIABLE_MARKDOWN.source}$`),
    // Unknown names stay plain text instead of becoming broken pills.
    replace: (node, match) => {
      if (known.has(match[1])) node.replace($createVariableNode(match[1]));
    },
  };
}

function MarkdownPastePlugin({ variables }: { variables: VariableDef[] }): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const transformers = [...MARKDOWN_TRANSFORMERS, variableTransformer(new Set(variables.map((variable) => variable.name)))];
    return editor.registerCommand(
      PASTE_COMMAND,
      (event) => {
        const clipboard = (event as ClipboardEvent).clipboardData;
        const text = clipboard?.getData("text/plain") ?? "";
        if (!MARKDOWN_HINT.test(text)) return false;
        event.preventDefault();
        editor.update(() => {
          const selection = $getSelection();
          if (!selection) return;
          selection.insertNodes($generateNodesFromMarkdownString(text.replace(/\r\n?/g, "\n"), transformers));
        });
        return true;
      },
      COMMAND_PRIORITY_LOW
    );
  }, [editor, variables]);

  return null;
}

// ---------------------------------------------------------------------------
// Theme — DS Tailwind v4 tokens (no ai-tutor CSS vars)
// ---------------------------------------------------------------------------

const editorTheme = {
  text: {
    bold: "font-bold",
    italic: "italic",
    underline: "underline",
    strikethrough: "line-through",
    code: "font-mono text-sm bg-secondary/40 px-1 rounded",
  },
  heading: {
    h1: "text-2xl font-bold mb-2",
    h2: "text-xl font-semibold mb-1.5",
    h3: "text-lg font-medium mb-1",
    h4: "text-base font-semibold mb-1",
    h5: "text-sm font-semibold mb-1",
    h6: "text-sm font-medium text-muted-foreground mb-1",
  },
  quote: "border-l-4 border-input pl-4 text-muted-foreground italic my-2",
  code: "block font-mono text-sm bg-secondary/40 p-3 rounded my-2 whitespace-pre-wrap",
  list: {
    ul: "list-disc list-inside my-1",
    ol: "list-decimal list-inside my-1",
    listitem: "my-0.5",
  },
  link: "text-primary underline cursor-pointer",
};

// ---------------------------------------------------------------------------
// RichTextEditor — main exported component
// ---------------------------------------------------------------------------

export function RichTextEditor({
  value,
  onChange,
  variables = [],
  unavailableLabels = {},
  onInsertVariable,
  onEditVariable,
  placeholder,
  className,
  minHeightClassName = "min-h-[200px]",
  allowAlignment = true,
  ariaLabel,
  invalid = false,
  disabled = false,
  showVariableNames = false,
}: RichTextEditorProps): JSX.Element {
  const [highlightVariables, setHighlightVariables] = useState(!onInsertVariable);
  const lastEmitted = useRef<string | null>(null);
  const initialConfig = {
    namespace: "RichTextEditor",
    theme: editorTheme,
    nodes: [
      HeadingNode,
      QuoteNode,
      CodeNode,
      ListNode,
      ListItemNode,
      LinkNode,
      VariableNode,
    ],
    onError: (error: Error) => {
      console.error("Lexical editor error:", error);
    },
    editable: !disabled,
  };

  const handleChange = useCallback(
    (editorState: EditorState) => {
      const json = editorState.toJSON() as unknown as LexicalState;
      const serialized = JSON.stringify(json);
      if (serialized === lastEmitted.current) return;
      lastEmitted.current = serialized;
      onChange(json);
    },
    [onChange]
  );

  return (
    <VariablePreviewContext.Provider value={{ definitions: new Map(variables.map((variable) => [variable.name, variable])), unavailableLabels, onEdit: disabled ? undefined : onEditVariable, highlight: highlightVariables, showNames: showVariableNames }}>
    <LexicalComposer initialConfig={initialConfig}>
      <div
        className={cn(
          "relative rounded-lg overflow-visible bg-background border",
          invalid ? "border-destructive" : "border-input",
          className
        )}
      >
        {!disabled && <ToolbarPlugin allowAlignment={allowAlignment} variables={variables} onInsertVariable={onInsertVariable}
          highlightVariables={highlightVariables} onToggleVariableHighlight={() => setHighlightVariables((value) => !value)} />}

        <div className={cn("editor-scroll relative has-focus-visible:ring-1 has-focus-visible:ring-inset has-focus-visible:ring-ring", minHeightClassName)}>
          <RichTextPlugin
            contentEditable={
              placeholder ? (
                <ContentEditable
                  className="px-4 py-3 text-sm text-foreground outline-none"
                  aria-label={ariaLabel}
                  aria-invalid={invalid || undefined}
                  aria-placeholder={placeholder}
                  placeholder={() => (
                    <div className="absolute top-3 left-4 text-sm text-muted-foreground pointer-events-none">
                      {placeholder}
                    </div>
                  )}
                />
              ) : (
                <ContentEditable className="px-4 py-3 text-sm text-foreground outline-none" aria-label={ariaLabel} aria-invalid={invalid || undefined} />
              )
            }
            ErrorBoundary={LexicalErrorBoundary}
          />
        </div>

        <OnChangePlugin onChange={handleChange} ignoreSelectionChange />
        <HistoryPlugin />
        <ListPlugin />
        <LinkPlugin />
        <VariablePlugin variables={variables} />
        <MarkdownPastePlugin variables={variables} />
        {!allowAlignment && <NoAlignmentPlugin />}
        <EditableSync editable={!disabled} />
        <ExternalStateSync value={value} lastEmittedRef={lastEmitted} />
      </div>
    </LexicalComposer>
    </VariablePreviewContext.Provider>
  );
}

export default RichTextEditor;
