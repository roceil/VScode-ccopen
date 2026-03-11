# ccopen — Claude Code 帳號切換器

在 VS Code 中快速切換多個 Claude Code 帳號，免手動編輯設定檔或執行 Terminal 指令。

> **僅支援 macOS。** 本擴充套件使用 macOS Keychain（`security`）儲存與還原帳號憑證。

---

## 功能

- **側邊欄面板** — 一覽所有已儲存帳號，目前使用中的帳號以綠色標示
- **狀態列** — 顯示目前帳號的 Email，點擊即可切換
- **儲存目前帳號** — 將目前登入的 Claude Code session 儲存為一筆帳號
- **切換帳號** — 一鍵還原任一已儲存帳號的憑證，可選擇是否立即重啟 Claude Code
- **新增帳號** — 登出後以新帳號登入，再儲存新 session
- **移除帳號** — 刪除已儲存帳號；若刪除的是目前使用中的唯一一筆，將同步清除 session

---

## 需求

- macOS（使用 `security` 存取 Keychain，並以 `pkill` 重啟 Claude Code）
- 已安裝 [Claude Code](https://claude.ai/code) CLI 並至少登入過一次

---

## 使用方式

### 1. 儲存目前帳號

切換前，請先將目前登入的帳號儲存起來：

- 開啟側邊欄的 **Claude Code Accounts** 面板
- 點擊工具列的 **+**（儲存目前帳號）按鈕
- 輸入一個名稱（例如 `work` 或 `personal`）

### 2. 新增第二個帳號

- 點擊工具列的 **新增帳號**（人像+）按鈕
- 擴充套件會登出目前帳號，並開啟 Terminal 讓你以新帳號登入
- 登入完成後，點擊提示中的 **儲存新帳號**

### 3. 切換帳號

- 點擊**狀態列**上的帳號 Email，或
- 點擊側邊欄中帳號旁的 **⇄** 圖示
- 選擇是否立即重啟 Claude Code

### 4. 移除帳號

- 點擊側邊欄中帳號旁的**垃圾桶**圖示，或
- 從指令面板執行 **ccopen: Remove Account**

---

## 指令

| 指令 | 說明 |
|---|---|
| `ccopen: Switch Account` | 開啟帳號選擇器（也可透過狀態列點擊） |
| `ccopen: Save Current Account` | 儲存目前登入的 Claude Code session |
| `ccopen: Add New Account` | 登出並以新帳號登入 |
| `ccopen: Remove Account` | 移除一筆已儲存的帳號 |
| `ccopen: Refresh` | 重新整理帳號列表 |

---

## 運作原理

帳號資料儲存於 `~/.claude/accounts/<名稱>/`：

| 檔案 | 內容 |
|---|---|
| `oauth_account.json` | 從 `~/.claude.json` 取出的 OAuth 帳號資訊 |
| `keychain_credential.txt` | 從 macOS Keychain 取出的憑證 token |
| `email.txt` | 帳號 Email（用於顯示） |

切換時，擴充套件會：
1. 將已儲存的 `oauthAccount` 寫回 `~/.claude.json`
2. 更新 macOS Keychain 中的 `Claude Code-credentials` 項目

> **安全提醒：** 為了實現帳號切換，Keychain 中的憑證 token 會以明文備份至 `~/.claude/accounts/<名稱>/keychain_credential.txt`。請確保你的電腦帳號有適當的存取保護，並避免將 `~/.claude/accounts/` 目錄分享或同步至雲端。

---

## 授權

MIT
