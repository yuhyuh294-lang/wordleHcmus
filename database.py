import sqlite3
import json

DB_NAME = "games.db"

def init_db():
    conn = sqlite3.connect(DB_NAME)
    c = conn.cursor()
    c.execute("""
        CREATE TABLE IF NOT EXISTS games (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT,
            mode TEXT,
            answer TEXT,
            turns INTEGER,
            win INTEGER,
            history TEXT
        )
    """)
    conn.commit()
    conn.close()

def save_game(username, mode, answer, turns, win, history):
    try:
        conn = sqlite3.connect(DB_NAME)
        c = conn.cursor()
        c.execute("""
            INSERT INTO games (username, mode, answer, turns, win, history)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (
            username,
            mode,
            answer,
            turns,
            win,
            json.dumps(history, ensure_ascii=False)
        ))
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"Lỗi lưu DB: {e}")

def get_user_games(username):
    try:
        conn = sqlite3.connect(DB_NAME)
        c = conn.cursor()
        # Lấy các trận đấu mới nhất lên đầu
        c.execute("""
            SELECT mode, answer, turns, win, history
            FROM games
            WHERE username = ?
            ORDER BY id DESC
        """, (username,))
        rows = c.fetchall()
        conn.close()
        return rows
    except Exception as e:
        print(f"Lỗi đọc DB: {e}")
        return []