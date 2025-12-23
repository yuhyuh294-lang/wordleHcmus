const API_URL = "http://127.0.0.1:5000";

let currentUser = localStorage.getItem("wordle_username");
let currentState = { token: null, mode: 'vi', length: 5, maxTurns: 6, currentRow: 0, isGameOver: false, guesses: [[]] };

// --- HỆ THỐNG ÂM THANH (FIXED - DÙNG HTML TAG + CLONE) ---
let isMusicOn = false;
let isSFXOn = true;
const bgMusic = document.getElementById("bg-music");

// Lấy thẻ audio từ HTML (Đảm bảo file click.mp3 nằm cùng thư mục)
const clickSoundRaw = document.getElementById("sfx-click");

function playClickSound() {
    if (!isSFXOn || !clickSoundRaw) return;

    // Kỹ thuật xử lý độ trễ bằng 0:
    if (clickSoundRaw.paused) {
        // Nếu đang không chạy thì chạy luôn
        clickSoundRaw.play().catch(e => {}); 
    } else {
        // Nếu đang chạy (do bấm phím liên tục), clone ra một bản sao để chạy đè lên
        const soundClone = clickSoundRaw.cloneNode(true);
        soundClone.volume = 1.0;
        soundClone.play().catch(e => {});
    }
}

function toggleMusic() {
    isMusicOn = !isMusicOn;
    if (isMusicOn) {
        bgMusic.volume = 0.5;
        bgMusic.play().catch(e => showToast("Chạm vào màn hình trước khi bật nhạc!"));
        showToast("🎵 Đã bật nhạc");
    } else {
        bgMusic.pause();
        showToast("🔇 Đã tắt nhạc");
    }
}

function toggleSFX() {
    isSFXOn = !isSFXOn;
    showToast(isSFXOn ? "🔊 Đã bật âm thanh" : "🔇 Đã tắt âm thanh");
}

function changeBackground(input) {
    const file = input.files[0];
    if (!file) return;

    const img = document.getElementById("bg-image");
    const vid = document.getElementById("bg-video");
    const url = URL.createObjectURL(file);

    if (file.type.startsWith("image")) {
        img.src = url;
        img.style.display = "block";
        vid.style.display = "none";
        vid.pause();
    } else if (file.type.startsWith("video")) {
        vid.src = url;
        vid.style.display = "block";
        img.style.display = "none";
        vid.play();
    }
    showToast("Đã đổi hình nền!");
}

// Gắn sự kiện click cho toàn bộ nút tĩnh
document.addEventListener("DOMContentLoaded", () => {
    const allButtons = document.querySelectorAll("button, .mc-btn, .icon-btn");
    allButtons.forEach(btn => {
        btn.addEventListener("click", playClickSound);
    });
});

// --- LOGIC MENU & GAME ---

function handlePlayClick() {
    playClickSound();
    if (currentUser && currentUser !== "null" && currentUser !== "") {
        startGameSession();
    } else {
        document.getElementById("login-modal").style.display = "flex";
        document.getElementById("username-input").focus();
    }
}

function saveUsernameAndPlay() {
    playClickSound();
    const nameInput = document.getElementById("username-input").value.trim();
    if (nameInput) {
        currentUser = nameInput;
        localStorage.setItem("wordle_username", currentUser);
        document.getElementById("login-modal").style.display = "none";
        startGameSession();
    } else {
        showToast("Vui lòng nhập tên!");
    }
}

function closeLoginModal() {
    playClickSound();
    document.getElementById("login-modal").style.display = "none";
}

function startGameSession() {
    document.getElementById("main-menu").style.display = "none";
    document.getElementById("game-container").style.display = "flex";
    initGame(currentState.mode);
}

function backToMenu() {
    playClickSound();
    document.getElementById("game-container").style.display = "none";
    document.getElementById("main-menu").style.display = "flex";
    document.getElementById("game-over-panel").classList.remove("show");
    document.getElementById("game-over-panel").classList.add("hidden");
    currentState.token = null;
}

function toggleModeFromMenu() {
    playClickSound();
    currentState.mode = (currentState.mode === 'vi') ? 'math' : 'vi';
    updateMenuModeText();
}

function updateMenuModeText() {
    const btnText = document.getElementById("menu-mode-text");
    if(btnText) {
        btnText.innerText = (currentState.mode === 'vi') 
            ? "CHẾ ĐỘ: TIẾNG VIỆT" 
            : "CHẾ ĐỘ: TOÁN HỌC";
    }
}

// --- GAMEPLAY LOGIC ---
const KEYS_VI = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];
const KEYS_MATH = ["1234567890", "+-*/="];
const TELEX_MAP = {
    'a': {'s':'á','f':'à','r':'ả','x':'ã','j':'ạ','w':'ă','a':'â'},
    'e': {'s':'é','f':'è','r':'ẻ','x':'ẽ','j':'ẹ','e':'ê'},
    'o': {'s':'ó','f':'ò','r':'ỏ','x':'õ','j':'ọ','w':'ơ','o':'ô'},
    'u': {'s':'ú','f':'ù','r':'ủ','x':'ũ','j':'ụ','w':'ư'},
    'i': {'s':'í','f':'ì','r':'ỉ','x':'ĩ','j':'ị'},
    'y': {'s':'ý','f':'ỳ','r':'ỷ','x':'ỹ','j':'ỵ'},
    'd': {'d':'đ'},
    'â': {'s':'ấ','f':'ầ','r':'ẩ','x':'ẫ','j':'ậ'},
    'ă': {'s':'ắ','f':'ằ','r':'ẳ','x':'ẵ','j':'ặ'},
    'ê': {'s':'ế','f':'ề','r':'ể','x':'ễ','j':'ệ'},
    'ô': {'s':'ố','f':'ồ','r':'ổ','x':'ỗ','j':'ộ'},
    'ơ': {'s':'ớ','f':'ờ','r':'ở','x':'ỡ','j':'ợ'},
    'ư': {'s':'ứ','f':'ừ','r':'ử','x':'ữ','j':'ự'}
};

function initGame(mode) {
    currentState.mode = mode;
    document.getElementById("mode-badge").innerText = mode === 'math' ? "TOÁN" : "VN";
    document.getElementById("game-over-panel").classList.remove("show");
    document.getElementById("game-over-panel").classList.add("hidden");
    
    fetch(`${API_URL}/start`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: currentUser, mode: mode })
    })
    .then(res => res.json())
    .then(data => {
        currentState.token = data.token;
        currentState.length = data.length;
        currentState.maxTurns = data.max_turns;
        currentState.currentRow = 0;
        currentState.isGameOver = false;
        currentState.guesses = Array(data.max_turns).fill(null).map(() => []);
        
        createBoard();
        createKeyboard();
    })
    .catch(err => {
        console.error(err);
        showToast("Lỗi kết nối Server!");
    });
}

function restartGame() {
    playClickSound();
    initGame(currentState.mode);
}

function createBoard() {
    const board = document.getElementById("game-board");
    board.innerHTML = "";
    // Điều chỉnh kích thước ô theo số lượng ô
    const tileSize = currentState.length > 8 ? "40px" : "50px";
    
    for(let r=0; r<currentState.maxTurns; r++) {
        const rowDiv = document.createElement("div");
        rowDiv.className = "row";
        for(let c=0; c<currentState.length; c++) {
            const tile = document.createElement("div");
            tile.className = "tile";
            tile.id = `tile-${r}-${c}`;
            tile.style.width = tileSize; tile.style.height = tileSize;
            rowDiv.appendChild(tile);
        }
        board.appendChild(rowDiv);
    }
}

function createKeyboard() {
    const container = document.getElementById("keyboard-container");
    container.innerHTML = "";
    const layout = currentState.mode === 'math' ? KEYS_MATH : KEYS_VI;

    layout.forEach(rowStr => {
        const rowDiv = document.createElement("div");
        rowDiv.className = "kb-row";
        rowStr.split("").forEach(char => {
            const btn = document.createElement("button");
            btn.className = "key";
            btn.textContent = char;
            btn.dataset.key = char;
            // GẮN CLICK SOUND VÀO PHÍM ẢO
            btn.onclick = (e) => { 
                e.preventDefault(); 
                playClickSound(); 
                handleInput(char); 
            };
            rowDiv.appendChild(btn);
        });
        container.appendChild(rowDiv);
    });

    const funcRow = document.createElement("div");
    funcRow.className = "kb-row";
    
    const btnEnter = document.createElement("button");
    btnEnter.className = "key key-big"; btnEnter.innerText = "ENTER";
    btnEnter.onclick = () => { playClickSound(); submitGuess(); };

    const btnDel = document.createElement("button");
    btnDel.className = "key key-big"; btnDel.innerText = "⌫";
    btnDel.onclick = () => { playClickSound(); handleDelete(); };

    funcRow.appendChild(btnEnter);
    funcRow.appendChild(btnDel);
    container.appendChild(funcRow);
}

function handleInput(key) {
    if (currentState.isGameOver) return;
    let row = currentState.guesses[currentState.currentRow];
    key = key.toLowerCase();

    if (currentState.mode === 'vi' && row.length > 0) {
        const lastIdx = row.length - 1;
        const lastChar = row[lastIdx];
        if (TELEX_MAP[lastChar] && TELEX_MAP[lastChar][key]) {
            row[lastIdx] = TELEX_MAP[lastChar][key];
            updateTile(currentState.currentRow, lastIdx, row[lastIdx]);
            return;
        }
    }

    if (row.length < currentState.length) {
        if (key.match(/^[a-z0-9+\-*=à-ỹ]$/)) { 
            row.push(key);
            updateTile(currentState.currentRow, row.length-1, key);
        }
    }
}

function updateTile(r, c, val) {
    const tile = document.getElementById(`tile-${r}-${c}`);
    if(tile) {
        tile.innerText = val;
        tile.setAttribute("data-status", val ? "filled" : "empty");
    }
}

function handleDelete() {
    if (currentState.isGameOver) return;
    const row = currentState.guesses[currentState.currentRow];
    if (row.length > 0) {
        row.pop();
        updateTile(currentState.currentRow, row.length, "");
    }
}

function submitGuess() {
    if (currentState.isGameOver) return;
    const row = currentState.guesses[currentState.currentRow];
    if (row.length !== currentState.length) {
        showToast("⚠️ Chưa đủ ký tự!");
        return;
    }

    fetch(`${API_URL}/guess`, {
        method: "POST", headers: {"Content-Type": "application/json"},
        body: JSON.stringify({ token: currentState.token, guess: row.join("") })
    })
    .then(res => res.json())
    .then(data => {
        if (data.error) { showToast(data.error); return; }
        
        animateReveal(data.feedback, currentState.currentRow, () => {
             if (data.win) showEndGame(true, data.answer);
             else if (data.lose) showEndGame(false, data.answer);
             else { currentState.currentRow++; currentState.guesses.push([]); }
        });
        
        data.feedback.forEach((color, i) => updateKeyColor(row.join("")[i], color));
    });
}

function animateReveal(feedback, rowIdx, callback) {
    feedback.forEach((color, i) => {
        setTimeout(() => {
            const tile = document.getElementById(`tile-${rowIdx}-${i}`);
            tile.style.setProperty("--color", getColor(color));
            tile.classList.add("flip");
            updateKey(currentState.guesses[rowIdx][i], color);
        }, i * 250);
    });
    setTimeout(callback, feedback.length * 250 + 200);
}

function getColor(status) {
    if (status === "green") return "#538d4e";
    if (status === "yellow") return "#b59f3b";
    return "#3a3a3c";
}

function updateKey(char, status) {
    const keyBtn = document.querySelector(`.key[data-key="${char}"]`);
    if (!keyBtn) return;
    const newColor = getColor(status);
    const currentColor = keyBtn.style.backgroundColor;
    
    if (newColor === "#538d4e") { 
        keyBtn.style.backgroundColor = newColor; 
    } else if (newColor === "#b59f3b" && currentColor !== "rgb(83, 141, 78)" && currentColor !== "#538d4e") { 
        keyBtn.style.backgroundColor = newColor; 
    } else if (!currentColor) { 
        keyBtn.style.backgroundColor = newColor; 
    }
}

function showEndGame(isWin, answer) {
    currentState.isGameOver = true;
    const panel = document.getElementById("game-over-panel");
    const title = document.getElementById("result-title");
    const ans = document.getElementById("result-answer");

    panel.classList.remove("hidden");
    panel.classList.add("show");

    if (isWin) {
        title.innerText = "CHIẾN THẮNG!";
        title.style.color = "#538d4e";
        ans.innerText = `Xuất sắc!`;
        confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
    } else {
        title.innerText = "GAME OVER";
        title.style.color = "#b59f3b";
        ans.innerText = `Đáp án: ${answer}`;
    }
}

function showToast(msg) {
    const container = document.getElementById("toast-container");
    const toast = document.createElement("div");
    toast.style.background = "white"; toast.style.color="black"; 
    toast.style.padding="10px"; toast.style.borderRadius="5px"; toast.style.marginTop="5px";
    toast.innerText = msg;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 2000);
}

function closeInfoModal() { 
    playClickSound();
    document.getElementById("info-modal-overlay").style.display = "none"; 
}

function openProfile() {
    playClickSound();
    if(!currentUser) { showToast("Bạn chưa đăng nhập!"); return; }
    
    fetch(`${API_URL}/history`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: currentUser })
    }).then(res => res.json()).then(data => {
        let html = `<h2 style="color:var(--yellow)">LỊCH SỬ CỦA ${currentUser.toUpperCase()}</h2>
                    <button onclick="logout()" class="mc-btn secondary" style="width:100px; margin-bottom:10px;">ĐĂNG XUẤT</button>
                    <div style="max-height:300px; overflow-y:auto; text-align:left;">`;
        if(data.length === 0) html += "<p>Chưa có trận đấu nào.</p>";
        else {
            data.forEach(g => {
                html += `<div style="border-bottom:1px solid #555; padding:8px; display:flex; justify-content:space-between;">
                    <span>${g.mode === 'vi' ? '🇻🇳' : '🧮'} <b>${g.answer}</b></span>
                    <span style="color:${g.result==='Thắng'?'#538d4e':'#b59f3b'}">${g.result} (${g.turns})</span>
                </div>`;
            });
        }
        html += `</div>`;
        document.getElementById("info-modal-body").innerHTML = html;
        document.getElementById("info-modal-overlay").style.display = "flex";
    });
}

function showStats() {
    playClickSound();
    if(!currentUser) { showToast("Bạn chưa đăng nhập!"); return; }

    fetch(`${API_URL}/stats`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: currentUser })
    }).then(res => res.json()).then(data => {
        document.getElementById("info-modal-body").innerHTML = `
            <h2>THỐNG KÊ (${currentUser})</h2>
            <div style="display:flex; justify-content:space-around; margin-top:20px;">
                <div><h1>${data.total_played}</h1><small>Đã chơi</small></div>
                <div><h1>${data.win_rate}%</h1><small>Tỉ lệ thắng</small></div>
                <div><h1>${data.current_streak}</h1><small>Chuỗi thắng</small></div>
            </div>`;
        document.getElementById("info-modal-overlay").style.display = "flex";
    });
}

function logout() {
    playClickSound();
    localStorage.removeItem("wordle_username");
    currentUser = null;
    closeInfoModal();
    showToast("Đã đăng xuất");
}

function getHint() {
    playClickSound();
    if(currentState.token && !currentState.isGameOver) {
        fetch(`${API_URL}/get_hint`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: currentState.token })
        }).then(res => res.json()).then(data => showToast(data.hint));
    }
}

function autoPlayAI() {
    playClickSound();
    if(currentState.token && !currentState.isGameOver) {
        fetch(`${API_URL}/ai_auto_move`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: currentState.token })
        }).then(res => res.json()).then(data => {
            if(data.error) showToast(data.error);
            else {
                currentState.guesses[currentState.currentRow] = data.guess.split("");
                data.guess.split("").forEach((c, i) => updateTile(currentState.currentRow, i, c));
                animateReveal(data.feedback, currentState.currentRow, () => {
                     if (data.win) showEndGame(true, data.answer);
                     else if (data.lose) showEndGame(false, data.answer);
                     else currentState.currentRow++;
                });
            }
        });
    }
}

// Global Listener
document.addEventListener("keydown", (e) => {
    if (document.getElementById("game-container").style.display === "none") return;
    
    // Gõ phím thật cũng có tiếng kêu
    if(e.key !== 'F12' && e.key !== 'F5') playClickSound();

    if (e.key === "Enter") submitGuess();
    else if (e.key === "Backspace") handleDelete();
    else if (e.key.length === 1 && !e.ctrlKey && !e.altKey) handleInput(e.key.toLowerCase());
});

updateMenuModeText();