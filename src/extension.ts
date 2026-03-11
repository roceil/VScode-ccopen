import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const ACCOUNTS_DIR = path.join(os.homedir(), '.claude', 'accounts');
const CLAUDE_JSON = path.join(os.homedir(), '.claude.json');
const KEYCHAIN_SERVICE = 'Claude Code-credentials';

function getCurrentUser(): string {
  return os.userInfo().username;
}

function killClaudeProcesses(): void {
  try {
    cp.spawnSync('pkill', ['-x', 'claude']);
  } catch { /* ignore if no processes found */ }
}

function atomicWriteJson(filePath: string, data: unknown): void {
  if (fs.existsSync(filePath)) {
    fs.copyFileSync(filePath, filePath + '.bak');
  }
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, filePath);
}

function relaunchClaude(): void {
  const terminal = vscode.window.createTerminal('Claude Code');
  terminal.show();
  terminal.sendText('claude');
}

function validateAccountName(name: string): string | null {
  if (!name.trim()) return 'Name cannot be empty';
  if (!/^[a-zA-Z0-9_\-. ]+$/.test(name)) return 'Only letters, numbers, -, _, . and spaces allowed';
  if (name.length > 50) return 'Name too long (max 50 chars)';
  return null;
}

function validateAccountPath(name: string): string {
  const error = validateAccountName(name);
  if (error) throw new Error(error);
  const dir = path.resolve(ACCOUNTS_DIR, name);
  if (!dir.startsWith(path.resolve(ACCOUNTS_DIR) + path.sep)) {
    throw new Error('Invalid account path');
  }
  return dir;
}

function execArgs(file: string, args: string[]): string {
  const result = cp.spawnSync(file, args, { encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr?.trim() || `Command failed: ${file}`);
  return (result.stdout || '').trim();
}

function getAccounts(): { name: string; email: string }[] {
  if (!fs.existsSync(ACCOUNTS_DIR)) return [];
  return fs.readdirSync(ACCOUNTS_DIR)
    .filter(d => fs.statSync(path.join(ACCOUNTS_DIR, d)).isDirectory())
    .map(name => {
      const emailFile = path.join(ACCOUNTS_DIR, name, 'email.txt');
      const email = fs.existsSync(emailFile)
        ? fs.readFileSync(emailFile, 'utf8').trim()
        : 'unknown';
      return { name, email };
    });
}

function getCurrentEmail(): string {
  try {
    const json = JSON.parse(fs.readFileSync(CLAUDE_JSON, 'utf8'));
    return json?.oauthAccount?.emailAddress ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

function switchAccount(name: string): void {
  const dir = validateAccountPath(name);
  const oauth = fs.readFileSync(path.join(dir, 'oauth_account.json'), 'utf8');
  const cred = fs.readFileSync(path.join(dir, 'keychain_credential.txt'), 'utf8').trim();

  // Update ~/.claude.json
  const claudeJson = JSON.parse(fs.readFileSync(CLAUDE_JSON, 'utf8'));
  claudeJson.oauthAccount = JSON.parse(oauth);
  atomicWriteJson(CLAUDE_JSON, claudeJson);

  // Update Keychain (single-step: -U updates if exists, adds if not)
  const user = getCurrentUser();
  execArgs('security', ['add-generic-password', '-U', '-s', KEYCHAIN_SERVICE, '-a', user, '-w', cred]);
}

function saveCurrentAccount(name: string): void {
  const dir = validateAccountPath(name);
  fs.mkdirSync(dir, { recursive: true });

  // Save oauthAccount from ~/.claude.json
  const claudeJson = JSON.parse(fs.readFileSync(CLAUDE_JSON, 'utf8'));
  if (!claudeJson.oauthAccount) {
    throw new Error('No oauthAccount found in ~/.claude.json');
  }
  fs.writeFileSync(
    path.join(dir, 'oauth_account.json'),
    JSON.stringify(claudeJson.oauthAccount, null, 2)
  );
  fs.writeFileSync(path.join(dir, 'email.txt'), claudeJson.oauthAccount.emailAddress ?? 'unknown');

  // Save Keychain credential
  const user = getCurrentUser();
  const cred = execArgs('security', ['find-generic-password', '-s', KEYCHAIN_SERVICE, '-a', user, '-w']);
  if (!cred) {
    fs.rmSync(dir, { recursive: true });
    throw new Error('Cannot find Claude Code credentials in Keychain');
  }
  fs.writeFileSync(path.join(dir, 'keychain_credential.txt'), cred);
}

function removeAccount(name: string): void {
  const dir = validateAccountPath(name);
  const emailFile = path.join(dir, 'email.txt');
  const removedEmail = fs.existsSync(emailFile)
    ? fs.readFileSync(emailFile, 'utf8').trim()
    : 'unknown';

  fs.rmSync(dir, { recursive: true });

  // If removing current account and no other saved account shares the same email, clear the session
  const currentEmail = getCurrentEmail();
  if (removedEmail === currentEmail) {
    const remaining = getAccounts();
    const hasDuplicate = remaining.some(a => a.email === removedEmail);
    if (!hasDuplicate) {
      const user = getCurrentUser();
      try {
        execArgs('security', ['delete-generic-password', '-s', KEYCHAIN_SERVICE, '-a', user]);
      } catch { /* ignore */ }
      const claudeJson = JSON.parse(fs.readFileSync(CLAUDE_JSON, 'utf8'));
      claudeJson.oauthAccount = null;
      atomicWriteJson(CLAUDE_JSON, claudeJson);
    }
  }
}

// ── Tree View ──────────────────────────────────────────────────────────────

class AccountItem extends vscode.TreeItem {
  constructor(
    public readonly accountName: string,
    public readonly email: string,
    public readonly isCurrent: boolean
  ) {
    super(accountName, vscode.TreeItemCollapsibleState.None);
    this.description = email;
    this.tooltip = `${accountName} (${email})${isCurrent ? ' — current' : ''}`;
    this.iconPath = new vscode.ThemeIcon(
      isCurrent ? 'account' : 'person',
      isCurrent ? new vscode.ThemeColor('charts.green') : undefined
    );
    this.contextValue = isCurrent ? 'currentAccount' : 'account';
  }
}

class AccountsProvider implements vscode.TreeDataProvider<AccountItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: AccountItem): vscode.TreeItem {
    return element;
  }

  getChildren(): AccountItem[] {
    const accounts = getAccounts();
    const currentEmail = getCurrentEmail();

    if (accounts.length === 0) return [];

    return accounts.map(a => new AccountItem(a.name, a.email, a.email === currentEmail));
  }
}

// ── Activate ───────────────────────────────────────────────────────────────

export function activate(context: vscode.ExtensionContext) {
  const provider = new AccountsProvider();

  // Status bar
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBar.command = 'ccopen.switch';
  statusBar.tooltip = 'Claude Code 帳號 — 點擊切換';

  function updateStatusBar() {
    const email = getCurrentEmail();
    statusBar.text = `$(account) ${email}`;
    statusBar.show();
  }
  updateStatusBar();
  context.subscriptions.push(statusBar);

  // Tree view
  const treeView = vscode.window.createTreeView('ccopen.accountsView', {
    treeDataProvider: provider,
    showCollapseAll: false,
  });
  context.subscriptions.push(treeView);

  function refresh() {
    provider.refresh();
    updateStatusBar();
  }

  // Command: refresh
  context.subscriptions.push(vscode.commands.registerCommand('ccopen.refresh', () => {
    refresh();
  }));

  // Command: switch (QuickPick, from palette or status bar)
  context.subscriptions.push(vscode.commands.registerCommand('ccopen.switch', async () => {
    const accounts = getAccounts();
    if (accounts.length === 0) {
      const go = await vscode.window.showWarningMessage(
        '尚無已儲存的帳號。請先登入 Claude Code，再執行「儲存目前帳號」。',
        '儲存目前帳號', '新增帳號'
      );
      if (go === '儲存目前帳號') vscode.commands.executeCommand('ccopen.save');
      if (go === '新增帳號') vscode.commands.executeCommand('ccopen.addNew');
      return;
    }
    const currentEmail = getCurrentEmail();
    const items = accounts.map(a => ({
      label: a.name,
      description: a.email,
      detail: a.email === currentEmail ? '● 目前使用中' : undefined,
    }));
    const picked = await vscode.window.showQuickPick(items, {
      title: `Claude Code 帳號（目前：${currentEmail}）`,
      placeHolder: '選擇要切換的帳號',
    });
    if (!picked) return;

    try {
      const selected = accounts.find(a => a.name === picked.label);
      if (!selected) return;
      if (selected.email === currentEmail) {
        vscode.window.showInformationMessage(`目前已是 ${selected.name}（${currentEmail}）`);
      } else {
        const action = await vscode.window.showInformationMessage(
          `切換至 ${selected.name}（${selected.email}），是否立即重啟 Claude Code？`,
          '立即重啟並切換', '切換但不重啟'
        );
        if (!action) return;
        if (action === '立即重啟並切換') killClaudeProcesses();
        switchAccount(selected.name);
        if (action === '立即重啟並切換') {
          relaunchClaude();
          vscode.window.showInformationMessage(`已切換至 ${selected.name}（${selected.email}）`);
        } else {
          vscode.window.showInformationMessage(`已切換至 ${selected.name}（${selected.email}），請手動重啟 Claude Code`);
        }
      }
    } catch (e: any) {
      vscode.window.showErrorMessage(`切換失敗：${e.message}`);
    } finally {
      refresh();
    }
  }));

  // Command: switchItem (inline button in tree view)
  context.subscriptions.push(vscode.commands.registerCommand('ccopen.switchItem', async (item: AccountItem) => {
    try {
      const currentEmail = getCurrentEmail();
      if (item.email === currentEmail) {
        vscode.window.showInformationMessage(`目前已是 ${item.accountName}（${currentEmail}）`);
        return;
      }
      const action = await vscode.window.showInformationMessage(
        `切換至 ${item.accountName}（${item.email}），是否立即重啟 Claude Code？`,
        '立即重啟並切換', '切換但不重啟'
      );
      if (!action) return;
      if (action === '立即重啟並切換') killClaudeProcesses();
      switchAccount(item.accountName);
      if (action === '立即重啟並切換') {
        relaunchClaude();
        vscode.window.showInformationMessage(`已切換至 ${item.accountName}（${item.email}）`);
      } else {
        vscode.window.showInformationMessage(`已切換至 ${item.accountName}（${item.email}），請手動重啟 Claude Code`);
      }
    } catch (e: any) {
      vscode.window.showErrorMessage(`切換失敗：${e.message}`);
    } finally {
      refresh();
    }
  }));

  // Command: save
  context.subscriptions.push(vscode.commands.registerCommand('ccopen.save', async () => {
    // Pre-check: ensure user is logged in
    try {
      const currentJson = JSON.parse(fs.readFileSync(CLAUDE_JSON, 'utf8'));
      if (!currentJson.oauthAccount) {
        const go = await vscode.window.showWarningMessage(
          '尚未登入 Claude Code。如需新增帳號，請使用「新增帳號」功能。',
          '新增帳號'
        );
        if (go) vscode.commands.executeCommand('ccopen.addNew');
        return;
      }
    } catch {
      vscode.window.showErrorMessage('無法讀取 Claude Code 狀態，請確認 ~/.claude.json 存在。');
      return;
    }

    const name = await vscode.window.showInputBox({
      title: '儲存目前帳號',
      prompt: '為此帳號輸入名稱',
      placeHolder: '例如：work、personal',
      validateInput: v => validateAccountName(v),
    });
    if (!name) return;

    // Duplicate name check
    const existingAccounts = getAccounts();
    const exists = existingAccounts.find(a => a.name === name);
    if (exists) {
      const overwrite = await vscode.window.showWarningMessage(
        `帳號「${name}」已存在（${exists.email}），確定要覆蓋嗎？`,
        { modal: true }, '覆蓋'
      );
      if (overwrite !== '覆蓋') return;
    }

    // Duplicate email check (same CC account saved under a different name)
    const currentEmail = getCurrentEmail();
    const emailDuplicate = existingAccounts.find(a => a.email === currentEmail && a.name !== name);
    if (emailDuplicate) {
      const proceed = await vscode.window.showWarningMessage(
        `此 CC 帳號（${currentEmail}）已以「${emailDuplicate.name}」儲存過，確定要再新增一筆？`,
        { modal: true }, '繼續儲存'
      );
      if (proceed !== '繼續儲存') return;
    }

    try {
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: `儲存帳號「${name}」中...` },
        async () => { saveCurrentAccount(name); }
      );
      refresh();
      const email = getCurrentEmail();
      vscode.window.showInformationMessage(`帳號「${name}」已儲存（${email}）`);
    } catch (e: any) {
      vscode.window.showErrorMessage(`儲存失敗：${e.message}`);
    }
  }));

  // Command: addNew
  context.subscriptions.push(vscode.commands.registerCommand('ccopen.addNew', async () => {
    const currentEmail = getCurrentEmail();
    const proceed = await vscode.window.showInformationMessage(
      `新增帳號需要暫時登出目前帳號（${currentEmail}），完成後可再切換回來。\n\n請確認目前帳號已儲存（若未儲存請先執行「儲存目前帳號」）。`,
      { modal: true },
      '繼續新增'
    );
    if (!proceed) return;

    const terminal = vscode.window.createTerminal('Claude Code — 新增帳號');
    terminal.show();
    terminal.sendText('claude logout && echo "=== 請使用上方指令登入新帳號 ===" && claude login');

    const saveLater = await vscode.window.showInformationMessage(
      '請在 Terminal 中完成新帳號登入，完成後點擊「儲存新帳號」。',
      '儲存新帳號', '稍後再說'
    );
    if (saveLater === '儲存新帳號') {
      vscode.commands.executeCommand('ccopen.save');
    }
  }));

  // Command: remove (QuickPick, from palette)
  context.subscriptions.push(vscode.commands.registerCommand('ccopen.remove', async () => {
    const accounts = getAccounts();
    if (accounts.length === 0) {
      vscode.window.showWarningMessage('尚無已儲存的帳號。');
      return;
    }
    const items = accounts.map(a => ({ label: a.name, description: a.email }));
    const picked = await vscode.window.showQuickPick(items, {
      title: '移除帳號',
      placeHolder: '選擇要移除的帳號',
    });
    if (!picked) return;

    const confirm = await vscode.window.showWarningMessage(
      `確定要移除「${picked.label}」（${picked.description}）嗎？`,
      { modal: true },
      '移除'
    );
    if (confirm !== '移除') return;

    try {
      removeAccount(picked.label);
      refresh();
      vscode.window.showInformationMessage(`已移除「${picked.label}」`);
    } catch (e: any) {
      vscode.window.showErrorMessage(`移除失敗：${e.message}`);
    }
  }));

  // Command: removeItem (inline button in tree view)
  context.subscriptions.push(vscode.commands.registerCommand('ccopen.removeItem', async (item: AccountItem) => {
    const confirm = await vscode.window.showWarningMessage(
      `確定要移除「${item.accountName}」（${item.email}）嗎？`,
      { modal: true },
      '移除'
    );
    if (confirm !== '移除') return;

    try {
      removeAccount(item.accountName);
      refresh();
      vscode.window.showInformationMessage(`已移除「${item.accountName}」`);
    } catch (e: any) {
      vscode.window.showErrorMessage(`移除失敗：${e.message}`);
    }
  }));
}

export function deactivate() {}
