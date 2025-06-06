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
  const openSet = new Set<string>();
  const closeSet = new Set<string>();
  const pairSet = new Set<string>();
  pairs.forEach((p) => {
    openSet.add(p.open);
    closeSet.add(p.close);
    pairSet.add(p.open);
    pairSet.add(p.close);
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
    if (pos.character === 0) {
      vscode.commands.executeCommand("tab");
      return;
    }

    // line end
    if (pos.character === line.range.end.character || atLineTail(line.text, pos.character)) {
      if (!isMultiline) {
        vscode.commands.executeCommand("tab");
        return;
      }

      return gotoNextLinePair(editor, pairSet, pos.line + 1);
    }

    // right first not blank char is special
    const rightSubStr = line.text.substring(pos.character);
    let index = findFirstPrintChar(rightSubStr);
    if (skipBlank && index !== -1 && pairSet.has(rightSubStr[index])) {
      moveFrom(editor, pos, index + 1);
      return;
    }

    // right char is special
    const rightChar = line.text[pos.character];
    if (!skipBlank && pairSet.has(rightChar)) {
      moveFrom(editor, pos, 1);
      return;
    }

    // left char not special
    const leftChar = line.text[pos.character - 1];
    if (!pairSet.has(leftChar)) {
      vscode.commands.executeCommand("tab");
      return;
    }

    // right substr doesn't include special char
    index = findFirstMatchingPairChar(rightSubStr, pairSet);
    if (index === -1) {
      vscode.commands.executeCommand("tab");
      return;
    }

    // open: jump to right
    // close: jump to left
    const matchChar = rightSubStr[index];
    if (closeSet.has(matchChar)) {
      moveFrom(editor, pos, index);
    } else {
      moveFrom(editor, pos, index + 1);
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
      return gotoPrevLinePair(editor, pairSet, pos.line - 1);
    }

    if (atLineHead(line.text, pos.character) && isMultiline) {
      return gotoPrevLinePair(editor, pairSet, pos.line - 1);
    }

    if (atLineHead(line.text, pos.character) && !isMultiline) {
      vscode.commands.executeCommand("outdent");
      return;
    }

    const leftSubStr = line.text.substring(0, pos.character);
    let index = findLastPrintChar(leftSubStr);
    if (skipBlank && index !== -1 && pairSet.has(leftSubStr[index])) {
      moveFrom(editor, pos, index - leftSubStr.length);
      return;
    }

    const leftChar = line.text[pos.character - 1];
    if (!skipBlank && pairSet.has(leftChar)) {
      moveFrom(editor, pos, -1);
      return;
    }

    const rightChar = line.text[pos.character];
    if (!pairSet.has(rightChar)) {
      vscode.commands.executeCommand("outdent");
      return;
    }

    index = findLastMatchingPairChar(leftSubStr, pairSet);
    if (index === -1) {
      vscode.commands.executeCommand("outdent");
      return;
    }

    const matchChar = leftSubStr[index];
    if (openSet.has(matchChar)) {
      moveFrom(editor, pos, index - leftSubStr.length + 1);
    } else {
      moveFrom(editor, pos, index - leftSubStr.length);
    }
  });
  context.subscriptions.push(taboutxBack);
}

function moveFrom(editor: vscode.TextEditor, pos: vscode.Position, offset: number) {
  const nextPos = pos.translate(0, offset);
  editor.selection = new vscode.Selection(nextPos, nextPos);
}

function findFirstMatchingPairChar(text: string, set: Set<string>): number {
  for (let i = 0; i < text.length; i++) {
    if (set.has(text[i])) {
      return i;
    }
  }
  return -1;
}

function findLastMatchingPairChar(text: string, set: Set<string>): number {
  for (let i = text.length - 1; i >= 0; i--) {
    if (set.has(text[i])) {
      return i;
    }
  }
  return -1;
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

function findNextPrintChar(
  editor: vscode.TextEditor,
  startLine: number
): { char: string; pos: vscode.Position } | null {
  const doc = editor.document;
  const totalLineNum = doc.lineCount;
  for (let l = startLine; l < totalLineNum; l++) {
    const lineText = doc.lineAt(l).text;
    const index = findFirstPrintChar(lineText);
    if (index !== -1) {
      return { char: lineText[index], pos: new vscode.Position(l, index + 1) };
    }
  }
  return null;
}

function gotoNextLinePair(editor: vscode.TextEditor, pairSet: Set<string>, startLine: number) {
  const res = findNextPrintChar(editor, startLine);
  if (res && pairSet.has(res.char)) {
    editor.selection = new vscode.Selection(res.pos, res.pos);
    return;
  }

  vscode.commands.executeCommand("tab");
  return;
}

function findPrevPrintChar(
  editor: vscode.TextEditor,
  startLine: number
): { char: string; pos: vscode.Position } | null {
  const doc = editor.document;
  for (let l = startLine; l >= 0; l--) {
    const lineText = doc.lineAt(l).text;
    const index = findLastPrintChar(lineText);
    if (index !== -1) {
      return { char: lineText[index], pos: new vscode.Position(l, index + 1) };
    }
  }
  return null;
}

function gotoPrevLinePair(editor: vscode.TextEditor, pairSet: Set<string>, startLine: number) {
  const res = findPrevPrintChar(editor, startLine);
  if (res && pairSet.has(res.char)) {
    editor.selection = new vscode.Selection(res.pos, res.pos);
    return;
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
