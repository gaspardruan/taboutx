import * as vscode from "vscode";

interface Pair {
  open: string;
  close: string;
}

export function activate(context: vscode.ExtensionContext) {
  // active or not
  const isDisabled = vscode.workspace
    .getConfiguration("taboutx")
    .get("disableByDefault") as boolean;
  context.workspaceState.update("taboutx-active", !isDisabled);

  // load pairs
  const pairs = vscode.workspace
    .getConfiguration("taboutx")
    .get<Pair[]>("pairsToTabOutFrom")!;
  const pariSet = new Set<string>();
  pairs.forEach((p) => {
    pariSet.add(p.open);
    pariSet.add(p.close);
  });

  // toggle command
  const toggle = vscode.commands.registerCommand("taboutx.toggle", () => {
    const isActive = context.workspaceState.get("taboutx-active");
    context.workspaceState.update("taboutx-active", !isActive);
    vscode.window.showInformationMessage(
      `TabOutX is ${!isActive ? "activated" : "deactivated"}.`
    );
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

    // line begin or end
    if (pos.character === 0 || pos.character === line.range.end.character) {
      vscode.commands.executeCommand("tab");
      return;
    }

    // right char is special
    const rightChar = line.text[pos.character];
    if (pariSet.has(rightChar)) {
      rightFrom(editor, pos, 1);
      return;
    }

    // left char not special
    const leftChar = line.text[pos.character - 1];
    if (!pariSet.has(leftChar)) {
      vscode.commands.executeCommand("tab");
      return;
    }

    // right substr doesn't have special char
    const rightSubStr = line.text.substring(pos.character);
    const index = findFirstMatchingPairChar(rightSubStr, pariSet);
    if (index === -1) {
      vscode.commands.executeCommand("tab");
      return;
    }

    // jump to the right of the special char
    rightFrom(editor, pos, index + 1);
  });
  context.subscriptions.push(taboutx);
}

function rightFrom(
  editor: vscode.TextEditor,
  pos: vscode.Position,
  offset: number
) {
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

export function deactivate() {}
