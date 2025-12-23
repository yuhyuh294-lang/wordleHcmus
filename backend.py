from flask import Flask, request, jsonify
from flask_cors import CORS
import random
import json
import uuid
import os
import unicodedata

# Import các module vệ tinh
from database import init_db, save_game, get_user_games
from wordle_engine import evaluate
from ai_solver import WordleAISolver
from math_gen import generate_equation

# Cho phép Flask tìm file html, css, js ở thư mục hiện tại
app = Flask(__name__, static_folder='.', static_url_path='')
CORS(app)

init_db()
MAX_TURNS = 6
ACTIVE_GAMES = {}

# --- LOAD DỮ LIỆU ---
def load_vietnamese_words():
    candidates = ["words_vi.json", "data/words_vi.json"]
    filename = None
    for path in candidates:
        if os.path.exists(path):
            filename = path
            break
            
    if not filename:
        return ["thanh", "hạnhphúc", "bạnbè"], {}

    try:
        with open(filename, encoding="utf-8") as f:
            raw = json.load(f)
            cleaned = list(set([w.strip().replace(" ", "").lower() for w in raw if len(w) >= 3]))
            words_map = {}
            for w in cleaned:
                l = len(w)
                if l not in words_map: words_map[l] = []
                words_map[l].append(w)
            print(f"✅ Đã load Tiếng Việt: {len(cleaned)} từ.")
            return cleaned, words_map
    except Exception as e:
        print(f"❌ Lỗi đọc file: {e}")
        return ["thanh", "hạnhphúc"], {}

ALL_WORDS_VI, MAP_WORDS_VI = load_vietnamese_words()

# --- LOGIC GỢI Ý ---
def ai_generate_hint(game):
    answer = game["answer"]
    mode = game["mode"]
    level = game["hint_level"]
    hint_msg = ""
    
    if mode == "math":
        lhs, rhs = answer.split('=')
        if level == 0: hint_msg = f"🔍 Cấp 1: Kết quả là {rhs}."
        elif level == 1: 
            ops = [c for c in "+-*/" if c in lhs]
            hint_msg = f"🔍 Cấp 2: Phép tính dùng dấu '{', '.join(set(ops))}'."
        else:
            idx = random.randint(0, len(answer)-1)
            hint_msg = f"🔍 Cấp 3: Vị trí {idx+1} là '{answer[idx]}'."
    else:
        if level == 0:
            # Gợi ý dấu thanh điệu
            normalized = unicodedata.normalize('NFD', answer)
            hints = []
            if '\u0301' in normalized: hints.append("dấu Sắc (´)")
            if '\u0300' in normalized: hints.append("dấu Huyền (`)")
            if '\u0309' in normalized: hints.append("dấu Hỏi (?)")
            if '\u0303' in normalized: hints.append("dấu Ngã (~)")
            if '\u0323' in normalized: hints.append("dấu Nặng (.)")
            
            if not hints: hint_msg = "🔍 Cấp 1: Từ này là thanh Ngang (không dấu)."
            else: hint_msg = f"🔍 Cấp 1: Có chứa {' và '.join(hints)}."
        elif level == 1:
            char_in = random.choice(list(set(answer)))
            hint_msg = f"🔍 Cấp 2: Có chứa chữ '{char_in.upper()}'."
        else:
            idx = random.randint(0, len(answer)-1)
            hint_msg = f"🔍 Cấp 3: Vị trí {idx+1} là '{answer[idx].upper()}'."

    if level < 2: game["hint_level"] += 1
    return hint_msg

# --- ROUTES ---

@app.route('/')
def index():
    return app.send_static_file('index.html')

@app.route("/start", methods=["POST"])
def start_game():
    data = request.json
    username = data.get("username", "guest")
    mode = data.get("mode", "vi")
    strict = data.get("strict", False)

    answer = ""
    ai_candidates = []

    if mode == "math":
        target_len = random.randint(5, 8) 
        answer = generate_equation(target_len)
        # Sinh pool giả cho AI
        ai_candidates = set([answer])
        attempts = 0
        while len(ai_candidates) < 100 and attempts < 500:
            attempts += 1
            ai_candidates.add(generate_equation(target_len))
        ai_candidates = list(ai_candidates)
    else:
        pool_map = MAP_WORDS_VI
        valid_lengths = [l for l, words in pool_map.items() if len(words) >= 5]
        if not valid_lengths: valid_lengths = list(pool_map.keys()) if pool_map else [5]
        chosen_len = random.choice(valid_lengths)
        candidates_pool = pool_map.get(chosen_len, ALL_WORDS_VI)
        if not candidates_pool: 
            candidates_pool = ["thanh", "nhung"]
            chosen_len = 5
        answer = random.choice(candidates_pool)
        ai_candidates = [w for w in candidates_pool if len(w) == chosen_len]

    user_token = str(uuid.uuid4())
    ACTIVE_GAMES[user_token] = {
        "username": username,
        "mode": mode,
        "strict": strict,
        "answer": answer,
        "history": [],
        "hint_level": 0,
        "ai_solver": WordleAISolver(ai_candidates, mode, strict)
    }

    print(f"--> New Game [{mode}] for {username}: {answer}")

    return jsonify({
        "status": "ok",
        "token": user_token,
        "length": len(answer),
        "max_turns": MAX_TURNS
    })

@app.route("/guess", methods=["POST"])
def guess():
    data = request.json
    token = data.get("token")
    guess_word = data.get("guess")
    if not token or token not in ACTIVE_GAMES: return jsonify({"error": "Game not found"}), 400
    
    game = ACTIVE_GAMES[token]
    if len(guess_word) != len(game["answer"]):
        return jsonify({"error": f"Độ dài không đúng"}), 400

    feedback = evaluate(game["answer"], guess_word, game["mode"], game["strict"])
    game["history"].append((guess_word, feedback))
    
    if game["ai_solver"]: game["ai_solver"].update_candidates(guess_word, feedback)
    
    win = all(c == "green" for c in feedback)
    lose = len(game["history"]) >= MAX_TURNS and not win
    if win or lose: 
        save_game(game["username"], game["mode"], game["answer"], len(game["history"]), 1 if win else 0, game["history"])

    return jsonify({"guess": guess_word, "feedback": feedback, "win": win, "lose": lose, "turn": len(game["history"]), "answer": game["answer"] if lose else None})

@app.route("/get_hint", methods=["POST"])
def get_hint():
    data = request.json
    token = data.get("token")
    if token in ACTIVE_GAMES: return jsonify({"hint": ai_generate_hint(ACTIVE_GAMES[token])})
    return jsonify({"error": "Game not found"}), 400

@app.route("/ai_auto_move", methods=["POST"])
def ai_auto_move():
    data = request.json
    token = data.get("token")
    if token not in ACTIVE_GAMES: return jsonify({"error": "Game not found"}), 400
    game = ACTIVE_GAMES[token]
    ai = game["ai_solver"]
    
    try:
        best_guess = ai.choose_guess(len(game["history"]))
    except:
        best_guess = ai.choose_guess()
    
    if not best_guess: return jsonify({"error": "AI bó tay"}), 400

    answer = game["answer"]
    feedback = evaluate(answer, best_guess, game["mode"], game["strict"])
    game["history"].append((best_guess, feedback))
    ai.update_candidates(best_guess, feedback)
    win = all(c == "green" for c in feedback)
    lose = len(game["history"]) >= MAX_TURNS and not win
    if win or lose: 
        save_game(game["username"], game["mode"], answer, len(game["history"]), 1 if win else 0, game["history"])

    return jsonify({"guess": best_guess, "feedback": feedback, "win": win, "lose": lose, "turn": len(game["history"]), "answer": answer if lose else None, "remaining_candidates": len(ai.candidates)})

@app.route("/stats", methods=["POST"])
def get_stats():
    data = request.json
    username = data.get("username", "guest")
    games = get_user_games(username)
    
    total_played = len(games)
    wins = 0
    current_streak = 0
    guess_dist = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0}
    streak_active = True
    
    for game in games:
        # game: (mode, answer, turns, win, history)
        is_win = game[3]
        turns = game[2]
        if is_win:
            wins += 1
            if streak_active: current_streak += 1
            if 1 <= turns <= 6: guess_dist[turns] += 1
        else:
            streak_active = False

    win_rate = round((wins / total_played * 100) if total_played > 0 else 0)
    return jsonify({
        "total_played": total_played,
        "win_rate": win_rate,
        "current_streak": current_streak,
        "guess_dist": guess_dist
    })

@app.route("/history", methods=["POST"])
def get_history():
    data = request.json
    username = data.get("username", "guest")
    raw_games = get_user_games(username)
    # Lấy 20 trận gần nhất
    recent_games = raw_games[:20]
    history_data = []
    for g in recent_games:
        history_data.append({
            "mode": g[0],
            "answer": g[1],
            "turns": g[2],
            "result": "Thắng" if g[3] else "Thua"
        })
    return jsonify(history_data)

if __name__ == "__main__":
    app.run(debug=True, port=5000)