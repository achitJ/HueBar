import * as vscode from 'vscode';
import { PALETTE } from './constants/palette';
import {
  getState,
  setState,
  getWorkspacePath,
  getConfigTarget,
  applyColor,
  clearColors,
  autoAssign,
} from './utils/utils';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  await autoAssign(context);

  context.subscriptions.push(
    vscode.commands.registerCommand('huebar.setColor', async () => {
      const folderPath = getWorkspacePath();
      if (!folderPath) {
        vscode.window.showErrorMessage('HueBar: No workspace folder open.');
        return;
      }

      const items = PALETTE.map(({ name, hex }) => ({
        label: `■ ${name}`,
        description: hex,
        hex,
      }));
      const picked = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select a title bar color',
        title: 'HueBar: Set Color',
        matchOnDescription: true,
      });

      if (!picked) return;

      const state = getState(context);

      state[folderPath] = { color: picked.hex, pinned: true };
      await setState(context, state);
      await applyColor(picked.hex);
    }),

    vscode.commands.registerCommand('huebar.resetColor', async () => {
      const folderPath = getWorkspacePath();

      if (!folderPath) return;

      const state = getState(context);

      delete state[folderPath];

      await setState(context, state);

      const config = vscode.workspace.getConfiguration('huebar');

      await clearColors(getConfigTarget(config));
      await autoAssign(context);
    }),

    vscode.workspace.onDidChangeConfiguration(async (e) => {
      if (!e.affectsConfiguration('huebar')) return;

      const folderPath = getWorkspacePath();

      if (!folderPath) return;

      const state = getState(context);

      if (state[folderPath]) {
        await applyColor(state[folderPath].color);
      }
    })
  );
}

export function deactivate(): void {
  // Color customizations persist in workspace settings intentionally.
}
