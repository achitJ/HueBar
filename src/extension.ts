import * as vscode from 'vscode';
import { PALETTE } from './palette';
import { getAutoColor, contrastForeground, darkenHsl } from './colorUtils';

interface WorkspaceEntry {
  color: string;
  pinned: boolean;
}

const STATE_KEY = 'chromabar.workspaceColors';

const TITLE_BAR_KEYS = [
  'titleBar.activeBackground',
  'titleBar.inactiveBackground',
  'titleBar.activeForeground',
  'titleBar.inactiveForeground',
] as const;

const STATUS_BAR_KEYS = [
  'statusBar.background',
  'statusBar.foreground',
] as const;

function getState(context: vscode.ExtensionContext): Record<string, WorkspaceEntry> {
  return context.globalState.get<Record<string, WorkspaceEntry>>(STATE_KEY) ?? {};
}

async function setState(
  context: vscode.ExtensionContext,
  state: Record<string, WorkspaceEntry>,
): Promise<void> {
  await context.globalState.update(STATE_KEY, state);
}

function getWorkspacePath(): string | undefined {
  if (vscode.workspace.workspaceFile) {
    return vscode.workspace.workspaceFile.fsPath;
  }
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

function getUsedColors(state: Record<string, WorkspaceEntry>, excludePath: string): Set<string> {
  const used = new Set<string>();
  for (const [path, entry] of Object.entries(state)) {
    if (path !== excludePath) {
      used.add(entry.color);
    }
  }
  return used;
}

function getConfigTarget(config: vscode.WorkspaceConfiguration): vscode.ConfigurationTarget {
  return config.get<string>('scope', 'workspace') === 'user'
    ? vscode.ConfigurationTarget.Global
    : vscode.ConfigurationTarget.Workspace;
}

async function applyColor(color: string): Promise<void> {
  const config = vscode.workspace.getConfiguration('chromabar');

  if (!config.get<boolean>('enabled', true)) {
    await clearColors(getConfigTarget(config));
    return;
  }

  const target = getConfigTarget(config);
  const colorStatusBar = config.get<boolean>('colorStatusBar', false);

  const inactiveColor = darkenHsl(color, 0.2);
  const activeFg = contrastForeground(color);
  const inactiveFg = contrastForeground(inactiveColor);

  const workbenchConfig = vscode.workspace.getConfiguration('workbench');
  const existing = workbenchConfig.get<Record<string, string>>('colorCustomizations') ?? {};

  const updates: Record<string, string> = {
    ...existing,
    'titleBar.activeBackground': color,
    'titleBar.inactiveBackground': inactiveColor,
    'titleBar.activeForeground': activeFg,
    'titleBar.inactiveForeground': inactiveFg,
  };

  if (colorStatusBar) {
    updates['statusBar.background'] = color;
    updates['statusBar.foreground'] = activeFg;
  } else {
    delete updates['statusBar.background'];
    delete updates['statusBar.foreground'];
  }

  await workbenchConfig.update('colorCustomizations', updates, target);
}

async function clearColors(target: vscode.ConfigurationTarget): Promise<void> {
  const workbenchConfig = vscode.workspace.getConfiguration('workbench');
  const existing = workbenchConfig.get<Record<string, string>>('colorCustomizations') ?? {};

  const chromabarKeys = new Set<string>([...TITLE_BAR_KEYS, ...STATUS_BAR_KEYS]);
  const cleaned: Record<string, string> = {};

  for (const [k, v] of Object.entries(existing)) {
    if (!chromabarKeys.has(k)) {
      cleaned[k] = v;
    }
  }

  await workbenchConfig.update(
    'colorCustomizations',
    Object.keys(cleaned).length > 0 ? cleaned : undefined,
    target,
  );
}

async function autoAssign(context: vscode.ExtensionContext): Promise<void> {
  const folderPath = getWorkspacePath();
  if (!folderPath) return;

  const state = getState(context);

  if (state[folderPath]) {
    await applyColor(state[folderPath].color);
    return;
  }

  const usedColors = getUsedColors(state, folderPath);
  const color = getAutoColor(folderPath, usedColors);

  state[folderPath] = { color, pinned: false };
  await setState(context, state);
  await applyColor(color);
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  await autoAssign(context);

  context.subscriptions.push(
    vscode.commands.registerCommand('chromabar.setColor', async () => {
      const folderPath = getWorkspacePath();
      if (!folderPath) {
        vscode.window.showErrorMessage('ChromaBar: No workspace folder open.');
        return;
      }

      const items = PALETTE.map(({ name, hex }) => ({
        label: `■ ${name}`,
        description: hex,
        hex,
      }));

      const picked = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select a title bar color',
        title: 'ChromaBar: Set Color',
        matchOnDescription: true,
      });

      if (!picked) return;

      const state = getState(context);
      state[folderPath] = { color: picked.hex, pinned: true };
      await setState(context, state);
      await applyColor(picked.hex);
    }),

    vscode.commands.registerCommand('chromabar.resetColor', async () => {
      const folderPath = getWorkspacePath();
      if (!folderPath) return;

      const state = getState(context);
      delete state[folderPath];
      await setState(context, state);
      await autoAssign(context);
    }),

    vscode.workspace.onDidChangeConfiguration(async (e) => {
      if (!e.affectsConfiguration('chromabar')) return;
      const folderPath = getWorkspacePath();
      if (!folderPath) return;
      const state = getState(context);
      if (state[folderPath]) {
        await applyColor(state[folderPath].color);
      }
    }),
  );
}

export function deactivate(): void {
  // Color customizations persist in workspace settings intentionally.
}
