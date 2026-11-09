/**
 * ============================================================================
 * 【LINE 無結尾內部循環跳題機器人 ＋ 困境推敲引擎 ＋ 擬真 LINE 互動模擬器】
 * ============================================================================
 * 試算表網址：https://docs.google.com/spreadsheets/d/1ai9X4CUwxcqWPy0gzL4yfbNZ7OJLk7HyFkUjVzMxuro/edit
 * 
 * 【免 LINE 真實互動測試方式（含圖片網址完整串聯）】：
 * 1. 貼上此程式碼並儲存後，回到 Google 試算表畫面並「重新整理網頁」。
 * 2. 試算表上方選單列會出現「🤖 跳題機器人模擬」-> 點選「📱 開啟 LINE 擬真聊天室」。
 *    (右側會直接出現擬真 LINE 聊天視窗，同步載入每題的「圖片網址」預覽圖與按鈕！)
 * 3. 您也可以直接在 Apps Script 上方選單選擇：
 *    - testLocalSimulation    (真正讀取表單選項與圖片網址，隨機挑按鈕走 10 步並寫入狀態表)
 *    - startInteractivePrompt (在試算表中央彈出對話框，由您真人一步步輸入 1/2/3 跳題)
 * ============================================================================
 */

// ==================== 【1. 必填與選填設定區】 ====================
const CONFIG = {
  // 【必填 (串接正式 LINE 時才需填)】LINE Messaging API 的 Channel access token：
  LINE_CHANNEL_ACCESS_TOKEN: "請在此填入您的_LINE_CHANNEL_ACCESS_TOKEN",

  // 【已自動綁定】您的 Google Sheet 試算表 ID：
  SPREADSHEET_ID: "1ai9X4CUwxcqWPy0gzL4yfbNZ7OJLk7HyFkUjVzMxuro",

  // 【選填】管理員 LINE User ID（當真人陷入困境時主動推播通知管理員）：
  ADMIN_LINE_USER_ID: "",

  // 【工作表名稱設定】
  QUESTION_SHEET_NAME: "題目內容",
  STATE_SHEET_NAME: "使用者狀態記錄",

  // 【預設起始題號】
  DEFAULT_START_NODE: "Q01",

  // 【困境推敲靈敏度設定】
  THRESHOLD: {
    RECENT_WINDOW: 10,       // 取最近幾步納入循環熱區分析
    TROUBLESHOOT_LOOP: 5,    // 故障排查區累計幾步觸發「複合故障困境」
    PRICING_LOOP: 4,         // 費用保固區累計幾步觸發「價格猶豫困境」
    BOOKING_LOOP: 4,         // 預約備份區累計幾步觸發「操作卡關困境」
    NAVIGATION_RESET: 3,     // 返回主選單幾次觸發「選單迷航困境」
    SUPPORT_WAIT_LOOP: 2     // 真人候位刷新幾次觸發「急迫等待焦慮」
  }
};
// ================================================================


/**
 * 當打開試算表時，自動在上方新增「🤖 跳題機器人模擬」選單
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("🤖 跳題機器人模擬")
    .addItem("📱 開啟 LINE 擬真聊天室 (含圖片即時顯示)", "openChatSimulatorSidebar")
    .addItem("💬 啟動彈出式問答模擬 (逐步輸入 1/2/3)", "startInteractivePrompt")
    .addSeparator()
    .addItem("🎲 執行 10 步隨機探索模擬 (testLocalSimulation)", "testLocalSimulation")
    .addToUi();
}


/**
 * 模式 A：在試算表右側開啟「擬真 LINE 聊天室」側邊欄（完整載入圖片網址與按鈕）
 */
function openChatSimulatorSidebar() {
  const html = HtmlService.createHtmlOutput(getSimulatorHtml())
    .setTitle("📱 LINE 跳題機器人模擬器")
    .setWidth(380);
  SpreadsheetApp.getUi().showSidebar(html);
}


/**
 * 網頁入口 (GET)：部署為 Web App 後打開網址，直接顯示擬真 LINE 聊天室模擬器！
 */
function doGet(e) {
  return HtmlService.createHtmlOutput(getSimulatorHtml())
    .setTitle("📱 LINE 跳題機器人線上模擬器")
    .addMetaTag("viewport", "width=device-width, initial-scale=1");
}


/**
 * 供前端擬真聊天室呼叫的後端 API：真實讀取試算表題目、圖片網址、更新狀態並回傳診斷結果
 */
function simulatorStepApi(userId, inputType, targetOrText, labelText) {
  const uid = userId || "SIM_HUMAN_USER";
  let nextNodeId = CONFIG.DEFAULT_START_NODE;
  let userChoiceText = "";

  if (inputType === "init") {
    nextNodeId = CONFIG.DEFAULT_START_NODE;
    userChoiceText = "[啟動模擬聊天室]";
  } else if (inputType === "postback") {
    nextNodeId = targetOrText || CONFIG.DEFAULT_START_NODE;
    userChoiceText = labelText || nextNodeId;
  } else if (inputType === "text") {
    const text = String(targetOrText || "").trim();
    const state = getUserState(uid);
    const currentNode = getNode(state.currentNodeId || CONFIG.DEFAULT_START_NODE);

    if (text === "重來" || text === "開始" || text === "選單" || text === "主選單") {
      nextNodeId = CONFIG.DEFAULT_START_NODE;
      userChoiceText = `[指令重置] ${text}`;
    } else if (text === "1" && currentNode && currentNode.next1) {
      nextNodeId = currentNode.next1;
      userChoiceText = `[輸入1] ${currentNode.opt1}`;
    } else if (text === "2" && currentNode && currentNode.next2) {
      nextNodeId = currentNode.next2;
      userChoiceText = `[輸入2] ${currentNode.opt2}`;
    } else if (text === "3" && currentNode && currentNode.next3) {
      nextNodeId = currentNode.next3;
      userChoiceText = `[輸入3] ${currentNode.opt3}`;
    } else {
      nextNodeId = "Q20";
      userChoiceText = `[自由輸入訴求] ${text}`;
    }
  }

  const node = getNode(nextNodeId) || getNode(CONFIG.DEFAULT_START_NODE);
  const diagnosis = updateAndDiagnoseUser(uid, node.id, userChoiceText, node.imageUrl);

  return {
    node: node,
    diagnosis: diagnosis
  };
}


/**
 * 模式 B：在試算表中央彈出對話框，讓真人一步一步輸入 1 / 2 / 3 或文字進行真實互動
 */
function startInteractivePrompt() {
  const ui = SpreadsheetApp.getUi();
  const userId = "PROMPT_USER_" + Utilities.formatDate(new Date(), "Asia/Taipei", "HHmmss");
  let currentNodeId = CONFIG.DEFAULT_START_NODE;
  let choiceText = "[啟動彈出式互動]";

  while (true) {
    const node = getNode(currentNodeId);
    if (!node) {
      ui.alert("找不到題目：" + currentNodeId);
      break;
    }

    // 真實寫入「使用者狀態記錄」（包含當前圖片網址）並推敲困境
    const diagnosis = updateAndDiagnoseUser(userId, node.id, choiceText, node.imageUrl);

    let promptMsg = `【目前題號：${node.id}】（區段：${node.zone}）\n`;
    promptMsg += `🖼️ 圖片網址：${node.imageUrl || "(無)"}\n\n`;
    promptMsg += `💬 題目：${node.question}\n\n`;
    if (node.opt1) promptMsg += `[ 1 ] ${node.opt1}  (➔ 跳至 ${node.next1})\n`;
    if (node.opt2) promptMsg += `[ 2 ] ${node.opt2}  (➔ 跳至 ${node.next2})\n`;
    if (node.opt3) promptMsg += `[ 3 ] ${node.opt3}  (➔ 跳至 ${node.next3})\n`;

    promptMsg += `\n📊 目前系統推敲狀態：\n${diagnosis.dilemmaTag}`;
    if (diagnosis.shouldIntervene) {
      promptMsg += `\n\n${diagnosis.interventionMessage}`;
    }
    promptMsg += `\n\n👉 請輸入 1、2、3 選擇按鈕，或直接打字抱怨（按「取消」結束測試）：`;

    const response = ui.prompt(`🤖 跳題機器人真人互動模擬 (${userId})`, promptMsg, ui.ButtonSet.OK_CANCEL);
    if (response.getSelectedButton() !== ui.Button.OK) {
      break;
    }

    const input = response.getResponseText().trim();
    if (!input) continue;

    if (input === "1" && node.next1) {
      choiceText = node.opt1;
      currentNodeId = node.next1;
    } else if (input === "2" && node.next2) {
      choiceText = node.opt2;
      currentNodeId = node.next2;
    } else if (input === "3" && node.next3) {
      choiceText = node.opt3;
      currentNodeId = node.next3;
    } else if (input === "重來" || input === "開始") {
      choiceText = `[指令重置] ${input}`;
      currentNodeId = CONFIG.DEFAULT_START_NODE;
    } else {
      choiceText = `[自由輸入訴求] ${input}`;
      currentNodeId = "Q20";
    }
  }
}


/**
 * 模式 C：動態隨機探索模擬器（非固定腳本，且完整串聯每題圖片網址！）
 * 每次執行時，從 Q01 開始「真實讀取試算表上的可用選項與圖片網址」，隨機挑 1~3 號按鈕走 10 步，
 * 並將最後停留題目的圖片網址與即時預覽寫入「使用者狀態記錄」！
 */
function testLocalSimulation() {
  const testUserId = "RANDOM_AGENT_" + Math.floor(100 + Math.random() * 900);
  const totalStepsToRun = 10;
  let currentNodeId = CONFIG.DEFAULT_START_NODE;
  let choiceText = "[啟動動態隨機探索]";

  console.log(`🚀 開始動態隨機模擬 (用戶 ID: ${testUserId})，共執行 ${totalStepsToRun} 步...`);

  for (let step = 1; step <= totalStepsToRun; step++) {
    const node = getNode(currentNodeId);
    if (!node) {
      console.log(`❌ 找不到題號 ${currentNodeId}，中止模擬。`);
      break;
    }

    // 1. 記錄當前節點與對應圖片網址，並執行困境推敲
    const diagnosis = updateAndDiagnoseUser(testUserId, node.id, choiceText, node.imageUrl);
    console.log(
      `第 ${step} 步 | 抵達 [${node.id}] (${node.zone}) | 動作:「${choiceText}」\n` +
      `   ↳ 🖼️ 串聯圖片網址: ${node.imageUrl || "(無)"}\n` +
      `   ↳ 📊 推敲困境結果: ${diagnosis.dilemmaTag}`
    );

    // 2. 真實讀取該題在試算表上的 3 個有效選項，動態隨機挑選下一步
    const validOptions = [];
    if (node.opt1 && node.next1) validOptions.push({ label: node.opt1, target: node.next1 });
    if (node.opt2 && node.next2) validOptions.push({ label: node.opt2, target: node.next2 });
    if (node.opt3 && node.next3) validOptions.push({ label: node.opt3, target: node.next3 });

    if (validOptions.length === 0) {
      currentNodeId = CONFIG.DEFAULT_START_NODE;
      choiceText = "[無選項自動回Q01]";
    } else {
      const randomPick = validOptions[Math.floor(Math.random() * validOptions.length)];
      currentNodeId = randomPick.target;
      choiceText = randomPick.label;
    }
  }

  console.log(`✅ 動態模擬完成！請查看試算表「使用者狀態記錄」中 ${testUserId} 的隨機軌跡、推敲結果與 I~J 欄圖片預覽。`);
}


// ==================== 【以下為 LINE Webhook 與核心推敲引擎】 ====================

/**
 * LINE Webhook 主入口 (POST)
 */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return ContentService.createTextOutput("OK");
    }

    const payload = JSON.parse(e.postData.contents);
    const events = payload.events || [];
    if (events.length === 0) {
      return ContentService.createTextOutput("OK");
    }

    events.forEach(event => handleLineEvent(event));
    return ContentService.createTextOutput("OK");
  } catch (err) {
    console.error("doPost Error:", err);
    return ContentService.createTextOutput("Error: " + err.message);
  }
}


/**
 * 處理單一 LINE 事件
 */
function handleLineEvent(event) {
  const replyToken = event.replyToken;
  const userId = (event.source && event.source.userId) ? event.source.userId : "UNKNOWN_USER";

  if (event.type === "follow") {
    processAndReply(replyToken, userId, CONFIG.DEFAULT_START_NODE, "[加入好友啟動]");
    return;
  }

  if (event.type === "postback" && event.postback && event.postback.data) {
    let nextNodeId = CONFIG.DEFAULT_START_NODE;
    let userChoiceText = "";
    try {
      const data = JSON.parse(event.postback.data);
      nextNodeId = data.target || CONFIG.DEFAULT_START_NODE;
      userChoiceText = data.label || "";
    } catch (_) {
      nextNodeId = event.postback.data;
    }
    processAndReply(replyToken, userId, nextNodeId, userChoiceText);
    return;
  }

  if (event.type === "message" && event.message && event.message.type === "text") {
    const text = event.message.text.trim();
    const state = getUserState(userId);
    const currentNode = getNode(state.currentNodeId || CONFIG.DEFAULT_START_NODE);

    let nextNodeId = state.currentNodeId || CONFIG.DEFAULT_START_NODE;
    let userChoiceText = text;

    if (text === "重來" || text === "開始" || text === "選單" || text === "主選單") {
      nextNodeId = CONFIG.DEFAULT_START_NODE;
      userChoiceText = `[指令重置] ${text}`;
    } else if (text === "1" && currentNode && currentNode.next1) {
      nextNodeId = currentNode.next1;
      userChoiceText = `[輸入1] ${currentNode.opt1}`;
    } else if (text === "2" && currentNode && currentNode.next2) {
      nextNodeId = currentNode.next2;
      userChoiceText = `[輸入2] ${currentNode.opt2}`;
    } else if (text === "3" && currentNode && currentNode.next3) {
      nextNodeId = currentNode.next3;
      userChoiceText = `[輸入3] ${currentNode.opt3}`;
    } else {
      nextNodeId = "Q20";
      userChoiceText = `[自由輸入訴求] ${text}`;
    }

    processAndReply(replyToken, userId, nextNodeId, userChoiceText);
  }
}


/**
 * 核心流程：讀取題目與圖片網址 -> 更新軌跡與推敲困境 -> 組裝並發送 LINE 訊息
 */
function processAndReply(replyToken, userId, nextNodeId, userChoiceText) {
  const node = getNode(nextNodeId) || getNode(CONFIG.DEFAULT_START_NODE);
  if (!node) {
    replyMessage(replyToken, [{ type: "text", text: "試算表題目載入異常，請確認「題目內容」工作表。" }]);
    return;
  }

  const diagnosis = updateAndDiagnoseUser(userId, node.id, userChoiceText, node.imageUrl);
  const messages = [];

  // (A) 若該題有 HTTPS 圖片網址，自動連上並發送 LINE Image Message
  if (node.imageUrl && String(node.imageUrl).trim().startsWith("https://")) {
    const imgUrl = String(node.imageUrl).trim();
    messages.push({
      type: "image",
      originalContentUrl: imgUrl,
      previewImageUrl: imgUrl
    });
  }

  // (B) 組裝 3 個內部循環選項按鈕 (Quick Reply)
  const quickReplies = [];
  const options = [
    { label: node.opt1, target: node.next1 },
    { label: node.opt2, target: node.next2 },
    { label: node.opt3, target: node.next3 }
  ];

  options.forEach(opt => {
    if (opt.label && opt.target) {
      const labelStr = String(opt.label).trim();
      const targetStr = String(opt.target).trim();
      quickReplies.push({
        type: "action",
        action: {
          type: "postback",
          label: labelStr.slice(0, 20),
          displayText: labelStr,
          data: JSON.stringify({ target: targetStr, label: labelStr })
        }
      });
    }
  });

  // (C) 若系統推敲出使用者正處於困境，自動在題目下方附加「破圈關懷提醒」
  let messageBody = `[${node.id}] ${node.question}`;
  if (diagnosis.shouldIntervene && diagnosis.interventionMessage) {
    messageBody += `\n\n━━━━━━━━━━━━━━\n${diagnosis.interventionMessage}`;
  }

  const textMsg = { type: "text", text: messageBody };
  if (quickReplies.length > 0) {
    textMsg.quickReply = { items: quickReplies };
  }
  messages.push(textMsg);

  replyMessage(replyToken, messages);

  if (CONFIG.ADMIN_LINE_USER_ID && diagnosis.shouldIntervene) {
    pushMessage(CONFIG.ADMIN_LINE_USER_ID, [{
      type: "text",
      text: `🔔【困境偵測通知】\n用戶 ID：${userId}\n目前題號：${node.id}\n最新動作：${userChoiceText}\n推敲困境：${diagnosis.dilemmaTag}`
    }]);
  }
}


/**
 * 根據題號從「題目內容」工作表讀取題目資料（含 J 欄圖片網址）
 */
function getNode(nodeId) {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheet = ss.getSheetByName(CONFIG.QUESTION_SHEET_NAME) || ss.getSheets()[0];
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(nodeId).trim()) {
      return {
        id: String(data[i][0]).trim(),
        question: String(data[i][1] || ""),
        opt1: String(data[i][2] || ""),
        next1: String(data[i][3] || ""),
        opt2: String(data[i][4] || ""),
        next2: String(data[i][5] || ""),
        opt3: String(data[i][6] || ""),
        next3: String(data[i][7] || ""),
        zone: String(data[i][8] || ""),     // I欄: 循環區段分類
        imageUrl: String(data[i][9] || "")  // J欄: 圖片網址
      };
    }
  }
  return null;
}


/**
 * 取得使用者目前在「使用者狀態記錄」的狀態
 */
function getUserState(userId) {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheet = ss.getSheetByName(CONFIG.STATE_SHEET_NAME);
  if (!sheet) return { row: -1, currentNodeId: CONFIG.DEFAULT_START_NODE, pathStr: "" };

  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(userId)) {
      return {
        row: i + 1,
        currentNodeId: String(data[i][1] || CONFIG.DEFAULT_START_NODE),
        pathStr: String(data[i][2] || "")
      };
    }
  }
  return { row: -1, currentNodeId: CONFIG.DEFAULT_START_NODE, pathStr: "" };
}


/**
 * 更新「使用者狀態記錄」（包含寫入 I 欄「當前題目圖片網址」與 J 欄「=IMAGE() 圖片預覽」）
 */
function updateAndDiagnoseUser(userId, nextNodeId, userChoiceText, imageUrl) {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheet = ss.getSheetByName(CONFIG.STATE_SHEET_NAME);
  const data = sheet.getDataRange().getValues();
  const now = new Date().toLocaleString("zh-TW", { timeZone: "Asia/Taipei" });

  let rowIndex = -1;
  let oldPathStr = "";

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(userId)) {
      rowIndex = i + 1;
      oldPathStr = String(data[i][2] || "");
      break;
    }
  }

  const pathArray = oldPathStr ? oldPathStr.split(" > ").filter(Boolean) : [];
  pathArray.push(nextNodeId);

  const diagnosis = inferDilemmaFromPath(pathArray, userChoiceText);
  const newPathStr = pathArray.join(" > ");
  const targetRow = rowIndex > 0 ? rowIndex : data.length + 1;
  const imgFormula = imageUrl ? `=IMAGE(I${targetRow})` : "";

  const rowValues = [
    userId,
    nextNodeId,
    newPathStr,
    diagnosis.statsText,
    userChoiceText,
    diagnosis.dilemmaTag,
    diagnosis.actionSuggestion,
    now,
    imageUrl || "", // I欄：當前題目圖片網址
    imgFormula      // J欄：當前圖片即時預覽
  ];

  if (rowIndex > 0) {
    sheet.getRange(rowIndex, 1, 1, 10).setValues([rowValues]);
  } else {
    sheet.appendRow(rowValues);
  }

  return diagnosis;
}


/**
 * 困境推敲演算法：根據內部循環軌跡推斷真人的真實痛點與困境
 */
function inferDilemmaFromPath(pathArray, userChoiceText) {
  const totalSteps = pathArray.length;
  const recentSteps = pathArray.slice(-CONFIG.THRESHOLD.RECENT_WINDOW);

  const zones = {
    troubleshoot: ["Q02", "Q03", "Q04", "Q05", "Q06", "Q13", "Q14"],
    pricing:      ["Q11", "Q12", "Q17"],
    booking:      ["Q07", "Q08", "Q18"],
    navigation:   ["Q01", "Q10", "Q15"],
    support:      ["Q19", "Q20"]
  };

  const countIn = (list) => recentSteps.filter(id => list.includes(id)).length;
  const countNode = (target) => recentSteps.filter(id => id === target).length;

  const tCount = countIn(zones.troubleshoot);
  const pCount = countIn(zones.pricing);
  const bCount = countIn(zones.booking);
  const sCount = countIn(zones.support);
  const q01Count = countNode("Q01");
  const q19Count = countNode("Q19");

  if (String(userChoiceText).startsWith("[自由輸入訴求]")) {
    return {
      statsText: `總步數: ${totalSteps} (觸發自由輸入)`,
      dilemmaTag: "🗣️ 【主動表達特殊困境】現有選項無法涵蓋需求，使用者已直接打字輸入訴求",
      actionSuggestion: "💡 請直接檢視 E 欄（最後作答內容）的使用者原話，並由專人回覆",
      shouldIntervene: true,
      interventionMessage: "💡 已收到您的文字訊息並記錄至客服系統！請問您的問題屬於以下哪一類，方便我們加速分派？"
    };
  }

  if (q19Count >= CONFIG.THRESHOLD.SUPPORT_WAIT_LOOP || sCount >= 3) {
    return {
      statsText: `總步數: ${totalSteps} (支援區循環: ${sCount}次)`,
      dilemmaTag: "🚨 【急迫等待焦慮 / 現有選項無法滿足】多次刷新真人候位或進入困境分流器",
      actionSuggestion: "💡 已標記高優先急件：引導使用者直接打字留下電話與問題，由專人回電",
      shouldIntervene: true,
      interventionMessage: "💡 【系統智慧偵測】發現您急需專人協助！您不必在線上苦等，請直接在下方對話框「打字留下您的稱呼、電話與問題」，專員將優先回電給您！"
    };
  }

  if (tCount >= CONFIG.THRESHOLD.TROUBLESHOOT_LOOP && (countNode("Q02") >= 2 || countNode("Q05") >= 2)) {
    return {
      statsText: `總步數: ${totalSteps} (故障排查區循環: ${tCount}次)`,
      dilemmaTag: "⚠️ 【非典型/複合型硬體故障】於故障排查區反覆循環，標準步驟無法解決問題",
      actionSuggestion: "💡 已觸發破圈引導：建議使用者直接拍攝故障畫面/聲音並轉由工程師專案診斷",
      shouldIntervene: true,
      interventionMessage: "💡 【系統智慧偵測】發現您已嘗試多項排查步驟仍未解決，您的設備可能屬於「複合型或特殊硬體異常」。建議直接點選「預約專人檢測」，或直接打字描述異常細節！"
    };
  }

  if (pCount >= CONFIG.THRESHOLD.PRICING_LOOP && (countNode("Q12") >= 2 || countNode("Q17") >= 2)) {
    return {
      statsText: `總步數: ${totalSteps} (費用保固區循環: ${pCount}次)`,
      dilemmaTag: "⚠️ 【維修費用與保固焦慮】於保固試算與收費標準間反覆徘徊，對報修費用有疑慮",
      actionSuggestion: "💡 已觸發破圈引導：主動提供「免費線上初步估價」與「不修免收費」說明消除疑慮",
      shouldIntervene: true,
      interventionMessage: "💡 【系統智慧偵測】擔心過保維修費用太高嗎？請放心，您可以直接「打字輸入機型與損壞狀況」，我們先幫您免費線上初步估價，不修完全不收維修費！"
    };
  }

  if (bCount >= CONFIG.THRESHOLD.BOOKING_LOOP && (countNode("Q08") >= 2 || countNode("Q18") >= 2)) {
    return {
      statsText: `總步數: ${totalSteps} (預約備份區循環: ${bCount}次)`,
      dilemmaTag: "⚠️ 【前置操作障礙 / 資料備份卡關】在預約確認與備份教學間反覆卡住，無法送出預約",
      actionSuggestion: "💡 已觸發破圈引導：主動詢問是否因設備無法開機無法備份，提供到府拆機搶救資料選項",
      shouldIntervene: true,
      interventionMessage: "💡 【系統智慧偵測】在備份資料或確認時段遇到困難了嗎？若是因為「設備無法開機導致沒辦法備份」，請直接點擊「已備份，送出並建立單號」，現場請工程師免費協助拆機搶救資料即可！"
    };
  }

  if (q01Count >= CONFIG.THRESHOLD.NAVIGATION_RESET) {
    return {
      statsText: `總步數: ${totalSteps} (返回主選單: ${q01Count}次)`,
      dilemmaTag: "⚠️ 【選單迷航 / 非典型服務需求】頻繁切換主選單，需求可能不在現有分類(如配件/發票/退換貨)",
      actionSuggestion: "💡 已觸發破圈引導：開放使用者自由打字輸入非典型需求",
      shouldIntervene: true,
      interventionMessage: "💡 【系統智慧偵測】在選單中找不到您要辦理的項目嗎？（例如：購買配件、查詢發票、退換貨服務）請直接在下方「打字輸入您的需求」，系統將自動為您記錄並轉交專員！"
    };
  }

  return {
    statsText: `總步數: ${totalSteps} (正常循環中)`,
    dilemmaTag: "🟢 正常探索循環中",
    actionSuggestion: "持續觀察軌跡（未達破圈介入門檻）",
    shouldIntervene: false,
    interventionMessage: ""
  };
}


/**
 * 發送 LINE Reply Message
 */
function replyMessage(replyToken, messages) {
  if (!CONFIG.LINE_CHANNEL_ACCESS_TOKEN || CONFIG.LINE_CHANNEL_ACCESS_TOKEN.includes("請在此填入")) {
    console.log("【模擬發送 LINE Reply】(尚未設定 Token):", JSON.stringify(messages, null, 2));
    return;
  }

  UrlFetchApp.fetch("https://api.line.me/v2/bot/message/reply", {
    method: "post",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + CONFIG.LINE_CHANNEL_ACCESS_TOKEN
    },
    payload: JSON.stringify({
      replyToken: replyToken,
      messages: messages
    }),
    muteHttpExceptions: true
  });
}


/**
 * 發送 LINE Push Message
 */
function pushMessage(toUserId, messages) {
  if (!CONFIG.LINE_CHANNEL_ACCESS_TOKEN || CONFIG.LINE_CHANNEL_ACCESS_TOKEN.includes("請在此填入")) {
    return;
  }

  UrlFetchApp.fetch("https://api.line.me/v2/bot/message/push", {
    method: "post",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + CONFIG.LINE_CHANNEL_ACCESS_TOKEN
    },
    payload: JSON.stringify({
      to: toUserId,
      messages: messages
    }),
    muteHttpExceptions: true
  });
}


/**
 * 擬真 LINE 聊天室前端介面 (1:1 還原手機版 LINE 與真實 Quick Reply 浮動膠囊按鈕)
 */
function getSimulatorHtml() {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", "PingFang TC", "Microsoft JhengHei", sans-serif; }
    body {
      margin: 0;
      padding: 0;
      background: #1e2229;
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      overflow: hidden;
    }
    /* 手機外框容器（在電腦網頁上呈現真實手機尺寸，在試算表側邊欄則自動貼合） */
    .phone-frame {
      width: 100%;
      max-width: 414px;
      height: 100vh;
      max-height: 860px;
      background: #8cabd9;
      display: flex;
      flex-direction: column;
      position: relative;
      box-shadow: 0 12px 40px rgba(0,0,0,0.45);
      overflow: hidden;
    }
    @media (min-width: 480px) {
      .phone-frame {
        height: 94vh;
        border-radius: 28px;
        border: 6px solid #2c313a;
      }
    }
    /* LINE 頂部導覽列 */
    .line-header {
      background: rgba(122, 150, 194, 0.92);
      backdrop-filter: blur(8px);
      color: #111;
      padding: 12px 14px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid rgba(0,0,0,0.06);
      z-index: 10;
    }
    .line-header-left {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 16px;
      font-weight: 700;
      color: #111;
    }
    .back-arrow { font-size: 18px; cursor: pointer; color: #111; }
    .uid-badge {
      background: rgba(255,255,255,0.65);
      border: 1px solid rgba(0,0,0,0.1);
      border-radius: 12px;
      padding: 3px 8px;
      font-size: 11px;
      color: #333;
      width: 112px;
      text-align: center;
      outline: none;
    }
    /* 頂部微型困境推敲狀態條（不破壞 LINE 視覺） */
    .diagnosis-bar {
      background: rgba(34, 42, 56, 0.86);
      color: #f8f9fa;
      padding: 6px 12px;
      font-size: 11.5px;
      line-height: 1.35;
      display: flex;
      justify-content: space-between;
      align-items: center;
      z-index: 9;
    }
    .diagnosis-bar span.step-tag {
      color: #9ec5fe;
      font-size: 10.5px;
      white-space: nowrap;
      margin-left: 8px;
    }
    /* LINE 對話捲動區 */
    .chat-box {
      flex: 1;
      overflow-y: auto;
      padding: 14px 12px 20px 12px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      scroll-behavior: smooth;
    }
    /* 機器人訊息列（左頭像 + 右氣泡 + 時間戳記） */
    .bot-row {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      width: 100%;
    }
    .bot-avatar {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      background: #06c755;
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
      flex-shrink: 0;
      box-shadow: 0 1px 3px rgba(0,0,0,0.15);
    }
    .bot-content-col {
      display: flex;
      flex-direction: column;
      gap: 6px;
      max-width: 84%;
    }
    .bot-name {
      font-size: 11px;
      color: #2c384e;
      margin-left: 2px;
      font-weight: 500;
    }
    .bubble-time-wrap {
      display: flex;
      align-items: flex-end;
      gap: 5px;
    }
    /* LINE 白色文字對話氣泡（含左上角對話尖角） */
    .bot-msg {
      position: relative;
      background: #ffffff;
      color: #111111;
      border-radius: 4px 16px 16px 16px;
      padding: 9px 13px;
      font-size: 14px;
      line-height: 1.45;
      box-shadow: 0 1px 1px rgba(0,0,0,0.08);
      white-space: pre-wrap;
      word-break: break-word;
    }
    /* LINE 圖片訊息氣泡 */
    .bot-img {
      border-radius: 14px;
      overflow: hidden;
      box-shadow: 0 1px 2px rgba(0,0,0,0.12);
      background: #e9ecef;
      width: 230px;
      max-width: 100%;
      cursor: pointer;
    }
    .bot-img img {
      width: 100%;
      height: 145px;
      object-fit: cover;
      display: block;
    }
    /* 使用者綠色對話氣泡（含右上角尖角與左側已讀時間） */
    .user-row {
      display: flex;
      justify-content: flex-end;
      align-items: flex-end;
      gap: 5px;
      width: 100%;
    }
    .user-msg {
      background: #7ae263;
      color: #111111;
      border-radius: 16px 4px 16px 16px;
      padding: 9px 13px;
      font-size: 14px;
      line-height: 1.45;
      max-width: 74%;
      box-shadow: 0 1px 1px rgba(0,0,0,0.08);
      word-break: break-word;
    }
    .msg-meta {
      font-size: 10px;
      color: #3f506b;
      line-height: 1.15;
      white-space: nowrap;
      margin-bottom: 2px;
    }
    .user-row .msg-meta { text-align: right; }

    /* ============================================================
     * 緊跟在目前對話串下方的 Quick Reply 膠囊列
     * - 直接位於最新一則機器人對話氣泡正下方
     * - 自動換行或緊湊排列，不裁切任何選項，點完後自動移除
     * ============================================================ */
    .inline-quick-replies {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 4px;
    }
    .qr-pill {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      background: rgba(255, 255, 255, 0.96);
      color: #1f2329;
      border: 1px solid rgba(0, 0, 0, 0.08);
      border-radius: 999px;
      padding: 6px 12px;
      font-size: 12.5px;
      font-weight: 500;
      cursor: pointer;
      box-shadow: 0 2px 5px rgba(0, 0, 0, 0.12);
      transition: transform 0.1s ease, background 0.15s ease;
      white-space: nowrap;
    }
    .qr-pill:hover {
      background: #eef4ff;
      border-color: #93c5fd;
    }
    .qr-pill:active {
      transform: scale(0.96);
      background: #e2e8f0;
    }
    .qr-icon {
      width: 15px;
      height: 15px;
      border-radius: 50%;
      background: #06c755;
      color: #fff;
      font-size: 9.5px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-weight: bold;
    }

    /* 真實 LINE 底部輸入列 */
    .line-input-bar {
      height: 52px;
      background: #ffffff;
      border-top: 1px solid #e5e7eb;
      display: flex;
      align-items: center;
      padding: 0 10px;
      gap: 8px;
      z-index: 10;
    }
    .bar-icon {
      color: #64748b;
      font-size: 20px;
      cursor: pointer;
      user-select: none;
      padding: 2px;
    }
    .input-wrap {
      flex: 1;
      background: #f1f3f5;
      border-radius: 20px;
      display: flex;
      align-items: center;
      padding: 0 12px;
      height: 36px;
    }
    .input-wrap input {
      flex: 1;
      border: none;
      background: transparent;
      font-size: 13.5px;
      color: #111;
      outline: none;
    }
    .send-btn {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      background: #06c755;
      color: #fff;
      border: none;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      cursor: pointer;
      flex-shrink: 0;
    }
    .send-btn:hover { background: #05b04a; }
  </style>
</head>
<body>
  <div class="phone-frame">
    <div class="line-header">
      <div class="line-header-left">
        <span class="back-arrow" onclick="resetChat()" title="點擊重新開始">〈</span>
        <span>智慧客服官方帳號</span>
      </div>
      <input id="uid" class="uid-badge" value="HUMAN_TEST_01" title="模擬的 LINE User ID（可修改）" />
    </div>

    <div id="diag" class="diagnosis-bar">
      <span>⏳ 正在讀取試算表題目...</span>
      <span class="step-tag">連線中</span>
    </div>

    <div id="chat" class="chat-box"></div>

    <div class="line-input-bar">
      <span class="bar-icon" onclick="resetChat()" title="回到主選單 Q01">＋</span>
      <div class="input-wrap">
        <input id="txt" placeholder="Aa" autocomplete="off" />
      </div>
      <button class="send-btn" onclick="sendText()" title="傳送">➤</button>
    </div>
  </div>

  <script>
    let isSending = false;
    let isImeComposing = false;
    let lastCompositionEndTime = 0;

    function getUid() {
      return document.getElementById('uid').value.trim() || 'HUMAN_TEST_01';
    }

    function getNowTime() {
      const d = new Date();
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      return hh + ':' + mm;
    }

    function clearOldQuickReplies() {
      document.querySelectorAll('.inline-quick-replies').forEach(el => el.remove());
    }

    function appendUserBubble(text) {
      const chat = document.getElementById('chat');
      const row = document.createElement('div');
      row.className = 'user-row';
      row.innerHTML =
        '<div class="msg-meta">已讀<br>' + getNowTime() + '</div>' +
        '<div class="user-msg"></div>';
      row.querySelector('.user-msg').textContent = text;
      chat.appendChild(row);
      chat.scrollTop = chat.scrollHeight;
    }

    function renderResponse(res) {
      isSending = false;
      const chat = document.getElementById('chat');
      const diag = document.getElementById('diag');
      clearOldQuickReplies();

      if (!res || !res.node) return;
      const node = res.node;
      const d = res.diagnosis;
      const timeStr = getNowTime();

      diag.innerHTML =
        '<span>' + d.dilemmaTag + '</span>' +
        '<span class="step-tag">' + d.statsText + '</span>';

      const botRow = document.createElement('div');
      botRow.className = 'bot-row';

      const avatar = document.createElement('div');
      avatar.className = 'bot-avatar';
      avatar.textContent = '🤖';

      const col = document.createElement('div');
      col.className = 'bot-content-col';

      const nameDiv = document.createElement('div');
      nameDiv.className = 'bot-name';
      nameDiv.textContent = '智慧客服機器人';
      col.appendChild(nameDiv);

      if (node.imageUrl && node.imageUrl.startsWith('https://')) {
        const imgTimeWrap = document.createElement('div');
        imgTimeWrap.className = 'bubble-time-wrap';

        const imgBox = document.createElement('div');
        imgBox.className = 'bot-img';
        imgBox.title = '點擊開啟原圖：' + node.imageUrl;
        imgBox.onclick = () => window.open(node.imageUrl, '_blank');

        const imgEl = document.createElement('img');
        imgEl.src = node.imageUrl;
        imgEl.onerror = function() {
          this.onerror = null;
          this.src = 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=800&auto=format&fit=crop&q=80';
        };
        imgBox.appendChild(imgEl);

        const imgTime = document.createElement('div');
        imgTime.className = 'msg-meta';
        imgTime.textContent = timeStr;

        imgTimeWrap.appendChild(imgBox);
        imgTimeWrap.appendChild(imgTime);
        col.appendChild(imgTimeWrap);
      }

      let msgText = node.question;
      if (d.shouldIntervene && d.interventionMessage) {
        msgText += '\\n\\n━━━━━━━━━━━━━━\\n' + d.interventionMessage;
      }

      const txtTimeWrap = document.createElement('div');
      txtTimeWrap.className = 'bubble-time-wrap';

      const msgDiv = document.createElement('div');
      msgDiv.className = 'bot-msg';
      msgDiv.textContent = msgText;

      const txtTime = document.createElement('div');
      txtTime.className = 'msg-meta';
      txtTime.textContent = timeStr;

      txtTimeWrap.appendChild(msgDiv);
      txtTimeWrap.appendChild(txtTime);
      col.appendChild(txtTimeWrap);

      // 直接在目前這則對話氣泡的正下方渲染 Quick Reply 膠囊列
      const qrWrap = document.createElement('div');
      qrWrap.className = 'inline-quick-replies';

      const opts = [
        { label: node.opt1, target: node.next1 },
        { label: node.opt2, target: node.next2 },
        { label: node.opt3, target: node.next3 }
      ];

      opts.forEach(o => {
        if (o.label && o.target) {
          const pill = document.createElement('button');
          pill.className = 'qr-pill';
          pill.title = '點擊跳轉至 ' + o.target;
          pill.innerHTML = '<span class="qr-icon">↩</span><span class="qr-label"></span>';
          pill.querySelector('.qr-label').textContent = o.label;
          pill.onclick = () => selectOption(o.target, o.label);
          qrWrap.appendChild(pill);
        }
      });

      col.appendChild(qrWrap);
      botRow.appendChild(avatar);
      botRow.appendChild(col);
      chat.appendChild(botRow);

      chat.scrollTop = chat.scrollHeight;
    }

    function selectOption(target, label) {
      if (isSending) return;
      isSending = true;
      clearOldQuickReplies();
      appendUserBubble(label);
      google.script.run
        .withSuccessHandler(renderResponse)
        .withFailureHandler(() => { isSending = false; })
        .simulatorStepApi(getUid(), 'postback', target, label);
    }

    function sendText() {
      if (isSending) return;
      const input = document.getElementById('txt');
      const text = input.value.trim();
      if (!text) return;
      isSending = true;
      input.value = '';
      clearOldQuickReplies();
      appendUserBubble(text);
      google.script.run
        .withSuccessHandler(renderResponse)
        .withFailureHandler(() => { isSending = false; })
        .simulatorStepApi(getUid(), 'text', text, text);
    }

    function resetChat() {
      if (isSending) return;
      isSending = true;
      clearOldQuickReplies();
      appendUserBubble('重來');
      google.script.run
        .withSuccessHandler(renderResponse)
        .withFailureHandler(() => { isSending = false; })
        .simulatorStepApi(getUid(), 'text', '重來', '重來');
    }

    window.onload = () => {
      const inputEl = document.getElementById('txt');
      inputEl.addEventListener('compositionstart', () => {
        isImeComposing = true;
      });
      inputEl.addEventListener('compositionend', () => {
        isImeComposing = false;
        lastCompositionEndTime = Date.now();
      });
      inputEl.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        // 排除中文輸入法選字確認的第一次 Enter (包含 Safari/Mac compositionend 瞬間觸發的 keydown)
        if (e.isComposing || isImeComposing || e.keyCode === 229 || (Date.now() - lastCompositionEndTime < 80)) {
          return;
        }
        e.preventDefault();
        sendText();
      });

      isSending = true;
      google.script.run
        .withSuccessHandler(renderResponse)
        .withFailureHandler(() => { isSending = false; })
        .simulatorStepApi(getUid(), 'init', 'Q01', '[啟動]');
    };
  </script>
</body>
</html>`;
}
