# 🤖 LINE 無結尾內部循環跳題機器人 ＋ 困境推敲引擎

以 **Google Sheets** 作為題庫與狀態資料庫，結合 **Google Apps Script (GAS)** 打造的 **100% 無結尾內部循環（Closed-Loop）LINE 對話機器人**。系統可根據真人在迴圈中的「點擊折返軌跡」自動推敲使用者正面臨的真實困境，並內建 **1:1 擬真手機版 LINE 聊天室與 Quick Reply 模擬器**。

---

## 🔗 專案雲端連結

- **Google Sheets 試算表**：[點此開啟試算表](https://docs.google.com/spreadsheets/d/1ai9X4CUwxcqWPy0gzL4yfbNZ7OJLk7HyFkUjVzMxuro/edit)
  - Spreadsheet ID：`1ai9X4CUwxcqWPy0gzL4yfbNZ7OJLk7HyFkUjVzMxuro`
- **Google Apps Script 專案**：[點此開啟 Apps Script](https://script.google.com/u/0/home/projects/16_KMeNKy-mqT_2xOM4oYrxdEULaKuZFYGv3FVSPLRal9Nm9HVpdAZI74/edit)
  - Script ID：`16_KMeNKy-mqT_2xOM4oYrxdEULaKuZFYGv3FVSPLRal9Nm9HVpdAZI74`
- **線上 LINE 擬真模擬器 / Webhook URL**：
  - `https://script.google.com/macros/s/AKfycbwBwH3SyvY_5eDQcgxeUaGeatjn09b3K0iuYVudEZEpHC0uDLbG0Ozl_KH93N2Zt6FO/exec`

---

## 📂 專案檔案結構

- `Code.gs`：Google Apps Script 核心程式碼（含 LINE Webhook、困境推敲演算法、1:1 手機版 LINE 擬真模擬器、本地隨機探索模擬器）
- `appsscript.json`：Apps Script 專案設定檔（V8 Runtime、`Asia/Taipei` 時區、Web App 權限設定）
- `.clasp.json`：`clasp` CLI 專案綁定設定
- `data/題目內容.csv`：20 題無結尾內部循環題庫、5 大循環區段與圖片網址備份
- `data/使用者狀態記錄.csv`：使用者軌跡與自動困境推敲紀錄表備份

---

## 🧠 五大循環區段與自動困境推敲邏輯

| 循環區段 | 包含題號 | 自動推敲之使用者困境 |
| :--- | :--- | :--- |
| **1. 導覽入口區** | `Q01`, `Q10`, `Q15` | ⚠️ **【選單迷航 / 非典型服務需求】** 頻繁返回主選單，需求可能不在現有分類 |
| **2. 故障排查區** | `Q02`~`Q06`, `Q13`, `Q14` | ⚠️ **【非典型 / 複合型硬體故障】** 於故障排查區反覆循環，標準步驟無法解決 |
| **3. 費用保固區** | `Q11`, `Q12`, `Q17` | ⚠️ **【維修費用與保固焦慮】** 於保固試算與收費標準間反覆徘徊，對報修費用有疑慮 |
| **4. 預約備份區** | `Q07`, `Q08`, `Q09`, `Q16`, `Q18` | ⚠️ **【前置操作障礙 / 資料備份卡關】** 在預約確認與備份教學間反覆卡住 |
| **5. 困境支援區** | `Q19`, `Q20` | 🚨 **【急迫等待焦慮 / 主動表達特殊困境】** 多次刷新真人候位或觸發自由文字輸入 |

---

## 🚀 本地開發與部署指令 (`clasp` & `gsheets`)

```bash
# 推送程式碼至 Google Apps Script
clasp push -f

# 更新線上 Web App 部署
clasp redeploy AKfycbwBwH3SyvY_5eDQcgxeUaGeatjn09b3K0iuYVudEZEpHC0uDLbG0Ozl_KH93N2Zt6FO -d "更新版本說明"
```
