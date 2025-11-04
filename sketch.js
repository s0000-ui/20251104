let table;
let questions = [];
let pool = [];
let quiz = [];
let state = 'start'; // 'start' | 'asking' | 'result'
let current = 0;
let score = 0;
let selected = -1;
let showFeedback = false;
let feedbackText = '';
let confetti = [];
let optionRects = [];
let startBtn;

function preload() {
  // 不使用 loadTable，改用 fetch 以取得更清楚的錯誤回報
  // preload 保留空白（fetch 在 setup 觸發以便處理錯誤與 UI）
}

function setup() {
  createCanvas(windowWidth, windowHeight);
  textFont('Arial');

  // 以 fetch 載入 CSV，成功後會將 questions 填好並設 tableLoaded = true
  loadCSVWithFetch();

  startBtn = createButton('開始測驗');
  styleButton(startBtn);
  positionStartBtn();

  startBtn.mousePressed(() => {
    if (!tableLoaded || questions.length === 0) {
      alert('questions.csv 尚未載入或為空。請確認檔案位置並以 HTTP 伺服器開啟（如 python -m http.server 或 Live Server）。');
      return;
    }
    startBtn.hide();
    initQuiz();
  });
}

let tableLoaded = false;

function loadCSVWithFetch() {
  tableLoaded = false;
  fetch('questions.csv', {cache: "no-store"})
    .then(resp => {
      if (!resp.ok) {
        throw new Error('HTTP ' + resp.status + ' ' + resp.statusText);
      }
      return resp.text();
    })
    .then(txt => {
      parseCSVText(txt);
      tableLoaded = true;
      console.log('questions.csv 解析完成，題數:', questions.length);
    })
    .catch(err => {
      console.error('fetch questions.csv 失敗：', err);
      // 在畫面上顯示明確錯誤（方便除錯）
      createLoadErrorOverlay(err);
    });
}

function createLoadErrorOverlay(err) {
  // 只建立一次 overlay
  if (document.getElementById('csvLoadErrorOverlay')) return;
  const div = document.createElement('div');
  div.id = 'csvLoadErrorOverlay';
  div.style.position = 'fixed';
  div.style.left = '10px';
  div.style.top = '10px';
  div.style.right = '10px';
  div.style.padding = '12px';
  div.style.background = 'rgba(255,240,240,0.95)';
  div.style.color = '#900';
  div.style.border = '1px solid #f66';
  div.style.zIndex = 9999;
  div.style.fontFamily = 'Arial, sans-serif';
  div.innerText = '載入 questions.csv 失敗：' + err + '\n請確認 questions.csv 位於專案資料夾並以 HTTP 伺服器啟動（不要用 file://）。';
  const btn = document.createElement('button');
  btn.innerText = '重新嘗試';
  btn.style.marginLeft = '12px';
  btn.onclick = () => { div.remove(); loadCSVWithFetch(); };
  div.appendChild(btn);
  document.body.appendChild(div);
}

/* 取代原先 parseTable 的實作，直接將 CSV 文字解析成 questions 陣列 */
function parseCSVText(text) {
  questions = [];
  if (!text || text.trim().length === 0) return;

  const rows = csvToRows(text);
  if (rows.length === 0) return;

  // 嘗試偵測 header（容許大寫/小寫差異）
  const firstRowLower = rows[0].map(h => (h || '').toString().trim().toLowerCase());
  const hasHeader = firstRowLower.includes('question') && firstRowLower.includes('answer');

  let idx;
  let dataRows;
  if (hasHeader) {
    // 使用 header 映射欄位
    const header = rows.shift().map(h => h.trim().toLowerCase());
    idx = {
      question: header.indexOf('question'),
      optionA: header.indexOf('optiona'),
      optionB: header.indexOf('optionb'),
      optionC: header.indexOf('optionc'),
      optionD: header.indexOf('optiond'),
      answer: header.indexOf('answer'),
      feedback: header.indexOf('feedback')
    };
    dataRows = rows;
  } else {
    // 沒有 header，採預設欄位順序：question, optionA, optionB, optionC, optionD, answer, (feedback)
    idx = {
      question: 0,
      optionA: 1,
      optionB: 2,
      optionC: 3,
      optionD: 4,
      answer: 5,
      feedback: 6
    };
    dataRows = rows;
  }

  for (let r of dataRows) {
    // skip empty rows
    if (!r || r.length === 0) continue;
    // 安全取值（若長度不足則使用空字串）
    const get = (i) => (i >= 0 && i < r.length) ? (r[i] || '').toString().trim() : '';
    const q = {
      question: get(idx.question),
      options: [
        get(idx.optionA),
        get(idx.optionB),
        get(idx.optionC),
        get(idx.optionD)
      ],
      answer: (get(idx.answer) || '').toUpperCase(),
      feedback: get(idx.feedback) || ''
    };
    // 簡單驗證：至少需有題目與答案
    if (q.question && q.answer) questions.push(q);
  }
}

/* CSV to rows - 支援雙引號包住欄位與內部雙引號轉義（RFC4180 類似） */
function csvToRows(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (ch === '"') {
      // 如果在引號中且下個字元也是引號，視為 escaped quote
      if (inQuotes && text[i + 1] === '"') {
        cell += '"';
        i++; // skip next quote
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === ',' && !inQuotes) {
      row.push(cell);
      cell = '';
      continue;
    }

    if ((ch === '\n' || ch === '\r') && !inQuotes) {
      // handle CRLF
      if (ch === '\r' && text[i + 1] === '\n') { /* skip, will handle at \n */ }
      row.push(cell);
      cell = '';
      // 若 row 只有一空欄且為 header 前的空行，忽略
      // 檢查是否為真正的空列
      const isEmptyRow = row.every(c => c === '');
      if (!isEmptyRow) rows.push(row);
      row = [];
      // skip potential following \n when we've seen \r
      continue;
    }

    // 其他情況直接累加字元
    cell += ch;
  }
  // 最後一個 cell/row
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    const isEmptyRow = row.every(c => c === '');
    if (!isEmptyRow) rows.push(row);
  }
  return rows;
}

function draw() {
  // 馬卡龍漸層背景
  drawPastelBackground();

  drawDecor();

  if (state === 'start') {
    drawStartScreen();
  } else if (state === 'asking') {
    drawQuestion();
    if (showFeedback) {
      drawFeedback();
    }
    for (let p of confetti) {
      p.update();
      p.show();
    }
  } else if (state === 'result') {
    drawResult();
    for (let p of confetti) {
      p.update();
      p.show();
    }
  }
}

function drawPastelBackground() {
  // 設定固定背景色
  background('#b0c4b1');
  // 加入些微漸層效果
  for (let y = 0; y < height; y++) {
    let t = y / height;
    let c1 = color('#b0c4b1');
    let c2 = color('#a5b8a6');
    let c = lerpColor(c1, c2, t);
    stroke(red(c), green(c), blue(c), 220);
    line(0, y, width, y);
  }
}

function drawStartScreen() {
  fill(60, 80);
  textAlign(CENTER, CENTER);
  textSize(min(48, width * 0.05));
  fill(60);
  text('多選題測驗系統', width/2, height/2 - 80);
  textSize(min(18, width * 0.02));
  fill(90);
  text('一題20分，總共5題', width/2, height/2 - 40);
}

function parseTable() {
  questions = [];
  if (!table) return;
  for (let r = 0; r < table.getRowCount(); r++) {
    let row = table.getRow(r);
    let q = {
      question: row.get('question'),
      options: [
        row.get('optionA'),
        row.get('optionB'),
        row.get('optionC'),
        row.get('optionD')
      ],
      answer: row.get('answer'), // e.g. "A"
      feedback: row.get('feedback') || ''
    };
    questions.push(q);
  }
}

function initQuiz() {
  // 改成每次測驗出 5 題（若題庫不足則全部採用）
  let poolSize = min(5, questions.length);
  pool = shuffleArray(questions).slice(0, poolSize);
  let quizSize = min(5, pool.length); // 改為 5 題
  quiz = shuffleArray(pool).slice(0, quizSize);
  current = 0;
  score = 0;
  selected = -1;
  showFeedback = false;
  feedbackText = '';
  confetti = [];
  state = 'asking';
}

function drawQuestion() {
  let q = quiz[current];
  if (!q) return;
  textAlign(LEFT, TOP);
  fill(70);
  textSize(min(22, width * 0.028));
  text('題目 ' + (current + 1) + ' / ' + quiz.length, width * 0.04, height * 0.03);
  textSize(min(28, width * 0.04));
  fill(60);
  text(q.question, width * 0.04, height * 0.08, width * 0.92);

  // 畫選項（響應式）
  optionRects = [];
  let startY = height * 0.25;
  let gap = min(24, height * 0.03);
  let h = min(80, height * 0.11);
  let w = width * 0.92;
  let x = width * 0.04;
  for (let i = 0; i < q.options.length; i++) {
    let y = startY + i * (h + gap);
    let isHover = mouseX > x && mouseX < x + w && mouseY > y && mouseY < y + h;
    // 固定背景顏色
    let bg;
    // 每個選項固定顏色
    if (i === 0) bg = color('#ffc8dd'); // A 選項：粉紅
    else if (i === 1) bg = color('#bde0fe'); // B 選項：淺藍
    else if (i === 2) bg = color('#fbf8cc'); // C 選項：淺黃
    else bg = color('#cfbaf0'); // D 選項：淺紫
    fill(bg);
    stroke(200);
    strokeWeight(1);
    rect(x, y, w, h, 12);
    fill(60);
    noStroke();
    textSize(min(18, width * 0.02));
    textAlign(LEFT, CENTER);
    let label = String.fromCharCode(65 + i) + '. ';
    text(label + q.options[i], x + 16, y + h / 2);
    optionRects.push({x, y, w, h});
  }
}

function drawFeedback() {
  let q = quiz[current];
  if (!q) return;
  let correctIndex = q.answer.toUpperCase().charCodeAt(0) - 65;
  let r = optionRects[correctIndex];
  if (r) {
    noFill();
    stroke(255, 165, 140); // 馬卡龍珊瑚色框
    strokeWeight(4);
    rect(r.x, r.y, r.w, r.h, 12);
  }
}

function mousePressed() {
  if (state !== 'asking') return;
  if (!optionRects) return;
  for (let i = 0; i < optionRects.length; i++) {
    let r = optionRects[i];
    if (mouseX > r.x && mouseX < r.x + r.w && mouseY > r.y && mouseY < r.y + r.h) {
      handleAnswer(i);
      break;
    }
  }
}

function handleAnswer(i) {
  if (showFeedback) return; // 已選過
  selected = i;
  let q = quiz[current];
  let chosenLabel = String.fromCharCode(65 + i);
  let correctLabel = q.answer.toUpperCase();
  // 不管對錯都出現特效
  for (let k = 0; k < 20; k++) confetti.push(new Particle(mouseX, mouseY));
  
  if (chosenLabel === correctLabel) {
    score += 20; // 每題20分
  }
  
  // 直接前進下一題，不顯示回饋
  setTimeout(() => {
    current++;
    selected = -1;
    if (current >= quiz.length) {
      showResult();
    }
  }, 800);
}

function showResult() {
  state = 'result';
  createRestartButton();
  if (score >= ceil(quiz.length * 0.8)) {
    for (let k = 0; k < 60; k++) confetti.push(new Particle(random(width), random(-200, 0), true));
  }
}

function createRestartButton() {
  let btn = createButton('重新測驗');
  styleButton(btn);
  btn.position(width/2 - 60, height - 100);
  btn.mousePressed(() => {
    btn.remove();
    confetti = [];
    state = 'start';
    startBtn.show();
  });
}

function drawResult() {
  // 100分時持續產生新的特效
  if (score === 100 && frameCount % 10 === 0) { // 每10幀產生新的特效
    for (let k = 0; k < 5; k++) {
      confetti.push(new Particle(random(width), random(-50, 0), true));
    }
  }

  // 半透明卡片式顯示結果
  let cardW = min(900, width * 0.8);
  let cardH = min(500, height * 0.7);
  let cx = width/2 - cardW/2;
  let cy = height * 0.12;

  fill(255, 250);
  noStroke();
  rect(cx, cy, cardW, cardH, 20);

  textAlign(CENTER, CENTER);
  fill(60);
  textSize(min(36, width * 0.03));
  text('測驗結果', width/2, cy + 50);
  textSize(min(24, width * 0.02));
  text('得分：' + score + '/100', width/2, cy + 110);

  textSize(min(18, width * 0.018));
  let msg = '';
  if (score === 100) msg = '恭喜贏過全國99.99%的人，您是個仔細並認真上課的人!';
  else if (score === 80) msg = '恭喜您贏過全國79.99%的人，您是個聰明的人';
  else if (score === 60) msg = '恭喜您是個普通人';
  else if (score === 40) msg = '恭喜您贏過全國39.99%的人，您是跟髓本心上課隨性的人';
  else if (score === 20) msg = '恭喜您贏過全國19.99%的人，您是個富有運氣和實力的人，請加油';
  else msg = '恭喜您……?您在跟我開玩笑嗎?您是閉著眼睛寫的嗎?還是您是大雄轉世?這便建議您轉系，祝您有個美好的一天:)';
  text(msg, width/2, cy + 150);

  // 不顯示題目檢視和答案，只顯示最終得分
}

function drawDecor() {
  // 左上與右下柔和元素
  noStroke();
  fill(255, 235, 245, 80);
  ellipse(width * 0.12, height * 0.1, min(width, height) * 0.25);
  fill(235, 255, 240, 70);
  ellipse(width * 0.85, height * 0.85, min(width, height) * 0.35);
}

/* util & particles */

function shuffleArray(a) {
  let b = a.slice();
  for (let i = b.length - 1; i > 0; i--) {
    let j = floor(random(i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

class Particle {
  constructor(x, y, fromTop=false) {
    this.pos = createVector(x, y);
    this.vel = createVector(random(-2, 2), random(1, 6));
    if (fromTop) this.pos.y = random(-200, 0), this.vel.y = random(2, 6);
    this.acc = createVector(0, 0.08);
    // 馬卡龍顏色
    const palettes = [
      [255, 205, 210], // 粉
      [225, 245, 254], // 淡藍
      [232, 245, 233], // 薄荷
      [255, 243, 224], // 淡黃
      [243, 229, 245]  // 淡紫
    ];
    let p = random(palettes);
    this.color = color(p[0], p[1], p[2]);
    this.size = random(6, 12);
    this.life = 255;
  }
  update() {
    this.vel.add(this.acc);
    this.pos.add(this.vel);
    this.life -= 3;
  }
  show() {
    push();
    noStroke();
    fill(red(this.color), green(this.color), blue(this.color), this.life);
    translate(this.pos.x, this.pos.y);
    rotate(frameCount/40);
    rect(0, 0, this.size, this.size/2, 3);
    pop();
  }
}

function styleButton(btn) {
  if (!btn) return;
  btn.style('font-size', '18px');
  btn.style('padding', '10px 14px');
  btn.style('border-radius', '8px');
  btn.style('background', '#ffffff');
  btn.style('color', '#444444');
  btn.style('box-shadow', '0 4px 10px rgba(0,0,0,0.08)');
  btn.elt.style.cursor = 'pointer';
}

function positionStartBtn() {
  if (!startBtn) return;
  // 若能取得實際寬度可更精準置中，否則使用固定偏移
  let w = startBtn.elt && startBtn.elt.offsetWidth ? startBtn.elt.offsetWidth : 140;
  startBtn.position((width - w) / 2, height/2 + 40);
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  positionStartBtn();
}
// end of file