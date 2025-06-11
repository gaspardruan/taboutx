import { reverse } from "dns";
import * as vscode from "vscode";

interface Pair {
  open: string;
  close: string;
}

export function activate(context: vscode.ExtensionContext) {
  const config = vscode.workspace.getConfiguration("taboutx");

  // active or not
  const isDisabled = config.get("disableByDefault") as boolean;
  context.workspaceState.update("taboutx-active", !isDisabled);

  // mode
  const isMultiline = config.get("enableMultilineMode") as boolean;

  // skip blank char
  const skipBlank = config.get("skipBlankChar") as boolean;

  // backward
  const canBackward = config.get("enableTaboutBackward") as boolean;

  // load pairs
  const pairs = config.get<Pair[]>("pairsToTabOutFrom")!;
  const lenSet = new Set<number>();
  pairs.forEach((p) => {
    lenSet.add(p.open.length);
    lenSet.add(p.close.length);
  });
  const lenArr = Array.from(lenSet);
  lenArr.sort((a, b) => b - a);

  const pairMap = new Map<number, Set<string>>();
  lenArr.forEach((len) => pairMap.set(len, new Set()));

  const openSet = new Set<string>();
  const closeSet = new Set<string>();
  pairs.forEach((p) => {
    openSet.add(p.open);
    closeSet.add(p.close);
    pairMap.get(p.open.length)!.add(p.open);
    pairMap.get(p.close.length)!.add(p.close);
  });

  const pairArr: string[] = [];
  pairMap.forEach((v) => {
    pairArr.push(...v);
  });

  // toggle command
  const toggle = vscode.commands.registerCommand("taboutx.toggle", () => {
    const isActive = context.workspaceState.get("taboutx-active");
    context.workspaceState.update("taboutx-active", !isActive);
    vscode.window.showInformationMessage(`TabOutX is ${!isActive ? "activated" : "deactivated"}.`);
  });
  context.subscriptions.push(toggle);

  // taboutx command
  const taboutx = vscode.commands.registerCommand("taboutx", () => {
    if (!context.workspaceState.get("taboutx-active")) {
      vscode.commands.executeCommand("tab");
      return;
    }

    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }
    const pos = editor.selection.active;
    const line = editor.document.lineAt(pos.line);

    // line begin
    if (pos.character === 0 || atLineHead(line.text, pos.character)) {
      vscode.commands.executeCommand("tab");
      return;
    }

    // line end
    if (pos.character === line.range.end.character || atLineTail(line.text, pos.character)) {
      if (!isMultiline) {
        vscode.commands.executeCommand("tab");
        return;
      }

      return gotoNextLinePair(editor, pairMap, pos.line + 1);
    }

    // right first not blank char is special
    const rightSubStr = line.text.substring(pos.character);
    let index = findFirstPrintChar(rightSubStr);
    let match = index === -1 ? null : getPairFrom(pairMap, rightSubStr, index);
    if (skipBlank && match) {
      moveFrom(editor, pos, index + match.length);
      return;
    }

    // right char is special
    match = getPairFrom(pairMap, rightSubStr, 0);
    if (!skipBlank && match) {
      moveFrom(editor, pos, match.length);
      return;
    }

    // left char not special
    match = getPairFrom(pairMap, line.text, pos.character - 1, true);
    if (!match) {
      vscode.commands.executeCommand("tab");
      return;
    }

    // right substr doesn't include special char
    const res = findFirstMatchingPair(rightSubStr, pairMap);
    if (!res) {
      vscode.commands.executeCommand("tab");
      return;
    }

    // open: jump to right
    // close: jump to left
    match = rightSubStr.substring(res.start, res.end);
    if (closeSet.has(match)) {
      moveFrom(editor, pos, res.start);
    } else {
      moveFrom(editor, pos, res.end);
    }
  });
  context.subscriptions.push(taboutx);

  // taboutxBack command
  const taboutxBack = vscode.commands.registerCommand("taboutxBack", () => {
    if (!context.workspaceState.get("taboutx-active") || !canBackward) {
      vscode.commands.executeCommand("outdent");
      return;
    }

    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }
    const pos = editor.selection.active;
    const line = editor.document.lineAt(pos.line);

    if (pos.line === 0 && pos.character === 0) {
      return;
    }

    if (pos.character === 0) {
      return gotoPrevLinePair(editor, pairMap, pos.line - 1);
    }

    if (atLineHead(line.text, pos.character) && isMultiline) {
      return gotoPrevLinePair(editor, pairMap, pos.line - 1);
    }

    if (atLineHead(line.text, pos.character) && !isMultiline) {
      vscode.commands.executeCommand("outdent");
      return;
    }

    // pair at left with blank in the middle
    const leftSubStr = line.text.substring(0, pos.character);
    let index = findLastPrintChar(leftSubStr);
    let match = index === -1 ? null : getPairFrom(pairMap, leftSubStr, index, true);
    if (skipBlank && match) {
      moveFrom(editor, pos, index - leftSubStr.length - match.length + 1);
      return;
    }

    // pair closely at left
    match = getPairFrom(pairMap, line.text, pos.character - 1, true);
    if (!skipBlank && match) {
      moveFrom(editor, pos, -match.length);
      return;
    }

    // no pair closely at right
    match = getPairFrom(pairMap, line.text, pos.character);
    if (!match) {
      vscode.commands.executeCommand("outdent");
      return;
    }

    // no pair in left substr
    const res = findLastMatchingPairChar(leftSubStr, pairMap);
    if (!res) {
      vscode.commands.executeCommand("outdent");
      return;
    }

    // pair in left substr
    // open: jump to right; close: jump to left
    match = leftSubStr.substring(res.start, res.end);
    if (openSet.has(match)) {
      moveFrom(editor, pos, res.end - leftSubStr.length);
    } else {
      moveFrom(editor, pos, res.start - leftSubStr.length);
    }
  });
  context.subscriptions.push(taboutxBack);
}

function moveFrom(editor: vscode.TextEditor, pos: vscode.Position, offset: number) {
  const nextPos = pos.translate(0, offset);
  editor.selection = new vscode.Selection(nextPos, nextPos);
}

function findFirstMatchingPair(
  text: string,
  pairMap: Map<number, Set<string>>
): { start: number; end: number } | null {
  for (let i = 0; i < text.length; i++) {
    for (const [k, v] of pairMap) {
      if (v.has(text.substring(i, i + k))) {
        return { start: i, end: i + k };
      }
    }
  }
  return null;
}

function findLastMatchingPairChar(
  text: string,
  pairMap: Map<number, Set<string>>
): { start: number; end: number } | null {
  for (let i = text.length - 1; i >= 0; i--) {
    for (const [k, v] of pairMap) {
      if (v.has(text.substring(i, i + k))) {
        return { start: i, end: i + k };
      }
    }
  }
  return null;
}

function findFirstPrintChar(s: string): number {
  for (let i = 0; i < s.length; i++) {
    if (/\S/.test(s[i])) {
      return i;
    }
  }
  return -1;
}

function findLastPrintChar(s: string): number {
  for (let i = s.length - 1; i >= 0; i--) {
    if (/\S/.test(s[i])) {
      return i;
    }
  }
  return -1;
}

function getPairFrom(
  pairMap: Map<number, Set<string>>,
  line: string,
  start: number,
  reverse = false
): string {
  for (const [k, v] of pairMap) {
    let sub;
    if (reverse) {
      sub = line.substring(start - k + 1, start + 1);
    } else {
      sub = line.substring(start, start + k);
    }
    if (v.has(sub)) {
      return sub;
    }
  }
  return "";
}

function findNextPrintChar(editor: vscode.TextEditor, startLine: number): vscode.Position | null {
  const doc = editor.document;
  const totalLineNum = doc.lineCount;
  for (let l = startLine; l < totalLineNum; l++) {
    const lineText = doc.lineAt(l).text;
    const index = findFirstPrintChar(lineText);
    if (index !== -1) {
      return new vscode.Position(l, index);
    }
  }
  return null;
}

function gotoNextLinePair(
  editor: vscode.TextEditor,
  pairMap: Map<number, Set<string>>,
  startLine: number
) {
  const pos = findNextPrintChar(editor, startLine);
  if (pos) {
    const line = editor.document.lineAt(pos.line).text;
    const match = getPairFrom(pairMap, line, pos.character);
    if (match) {
      const newPos = pos.translate(0, match.length);
      editor.selection = new vscode.Selection(newPos, newPos);
      return;
    }
  }
  vscode.commands.executeCommand("tab");
  return;
}

function findPrevPrintChar(editor: vscode.TextEditor, startLine: number): vscode.Position | null {
  const doc = editor.document;
  for (let l = startLine; l >= 0; l--) {
    const lineText = doc.lineAt(l).text;
    const index = findLastPrintChar(lineText);
    if (index !== -1) {
      return new vscode.Position(l, index);
    }
  }
  return null;
}

function gotoPrevLinePair(
  editor: vscode.TextEditor,
  pairMap: Map<number, Set<string>>,
  startLine: number
) {
  const pos = findPrevPrintChar(editor, startLine);
  if (pos) {
    const line = editor.document.lineAt(pos.line).text;
    const match = getPairFrom(pairMap, line, pos.character, true);
    if (match) {
      const newPos = pos.translate(0, 1);
      editor.selection = new vscode.Selection(newPos, newPos);
      return;
    }
  }

  vscode.commands.executeCommand("outdent");
  return;
}

function atLineHead(s: string, pos: number): boolean {
  return s.substring(0, pos).trim() === "";
}

function atLineTail(s: string, pos: number): boolean {
  return s.substring(pos).trim() === "";
}

export function deactivate() {}
