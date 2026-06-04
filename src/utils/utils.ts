import * as vscode from 'vscode';
import { getAutoColor, contrastForeground } from './color';
import { STATE_KEY, STATUS_BAR_KEYS, TITLE_BAR_KEYS } from '../constants/constants';

export interface WorkspaceEntry {
  color: string;
  pinned: boolean;
}

export function getState(context: vscode.ExtensionContext): Record<string, WorkspaceEntry> {
  return context.globalState.get<Record<string, WorkspaceEntry>>(STATE_KEY) ?? {};
}

export async function setState(
  context: vscode.ExtensionContext,
  state: Record<string, WorkspaceEntry>
): Promise<void> {
  await context.globalState.update(STATE_KEY, state);
}

export function getWorkspacePath(): string | undefined {
  if (vscode.workspace.workspaceFile) {
    return vscode.workspace.workspaceFile.fsPath;
  }
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

export function getUsedColors(
  state: Record<string, WorkspaceEntry>,
  excludePath: string
): Set<string> {
  const used = new Set<string>();
  for (const [path, entry] of Object.entries(state)) {
    if (path !== excludePath) {
      used.add(entry.color);
    }
  }
  return used;
}

export function getConfigTarget(config: vscode.WorkspaceConfiguration): vscode.ConfigurationTarget {
  return config.get<string>('scope', 'workspace') === 'user'
    ? vscode.ConfigurationTarget.Global
    : vscode.ConfigurationTarget.Workspace;
}

export async function applyColor(color: string): Promise<void> {
  const config = vscode.workspace.getConfiguration('huebar');

  if (!config.get<boolean>('enabled', true)) {
    await clearColors(getConfigTarget(config));
    return;
  }

  const target = getConfigTarget(config);
  const colorStatusBar = config.get<boolean>('colorStatusBar', false);

  const activeFg = contrastForeground(color);

  const workbenchConfig = vscode.workspace.getConfiguration('workbench');
  const existing = workbenchConfig.get<Record<string, string>>('colorCustomizations') ?? {};

  const updates: Record<string, string> = {
    ...existing,
    'titleBar.activeBackground': color,
    'titleBar.activeForeground': activeFg,
    'titleBar.inactiveBackground': color,
    'titleBar.inactiveForeground': activeFg,
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

export async function clearColors(target: vscode.ConfigurationTarget): Promise<void> {
  const workbenchConfig = vscode.workspace.getConfiguration('workbench');
  const existing = workbenchConfig.get<Record<string, string>>('colorCustomizations') ?? {};

  const huebarKeys = new Set<string>([...TITLE_BAR_KEYS, ...STATUS_BAR_KEYS]);
  const cleaned: Record<string, string> = {};

  for (const [k, v] of Object.entries(existing)) {
    if (!huebarKeys.has(k)) {
      cleaned[k] = v;
    }
  }

  await workbenchConfig.update(
    'colorCustomizations',
    Object.keys(cleaned).length > 0 ? cleaned : undefined,
    target
  );
}

export async function autoAssign(context: vscode.ExtensionContext): Promise<void> {
  const folderPath = getWorkspacePath();
  if (!folderPath) return;

  const state = getState(context);

  if (state[folderPath]) {
    await applyColor(state[folderPath].color);
    return;
  }

  const workbenchConfig = vscode.workspace.getConfiguration('workbench');
  const existingCustomizations =
    workbenchConfig.get<Record<string, string>>('colorCustomizations') ?? {};

  if (TITLE_BAR_KEYS.some((key) => key in existingCustomizations)) {
    return;
  }

  const usedColors = getUsedColors(state, folderPath);
  const color = getAutoColor(folderPath, usedColors);

  state[folderPath] = { color, pinned: false };
  await setState(context, state);
  await applyColor(color);
}
