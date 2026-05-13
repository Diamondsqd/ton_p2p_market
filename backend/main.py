import httpx
import sqlite3
from fastapi import FastAPI, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import Optional
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Настройки Telegram
BOT_TOKEN = "8414041113:AAE9xKBXmxW4jfNIcCBr3Sd9AohDmoXCPHE"
CHAT_ID = "1129955575"

# --- Работа с БД ---

def init_db():
    conn = sqlite3.connect("tasks.db")
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS tasks (
            id INTEGER PRIMARY KEY,
            title TEXT,
            description TEXT,
            amount TEXT,
            deadline INTEGER,
            contract_address TEXT,
            customer_address TEXT,
            freelancer_address TEXT,
            result_link TEXT,
            status TEXT
        )
    """)
    conn.commit()
    conn.close()

# Инициализируем базу при запуске
init_db()

def get_db_connection():
    conn = sqlite3.connect("tasks.db")
    conn.row_factory = sqlite3.Row  # Чтобы обращаться к полям по именам, а не индексам
    return conn

# --- Модели и функции ---

class Task(BaseModel):
    id: int
    title: str
    description: str
    amount: str
    deadline: int
    contract_address: str
    customer_address: str
    freelancer_address: Optional[str] = None
    result_link: Optional[str] = None
    status: str

async def send_tg_message(text: str):
    url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"
    payload = {"chat_id": CHAT_ID, "text": text, "parse_mode": "HTML"}
    async with httpx.AsyncClient() as client:
        try:
            await client.post(url, json=payload)
        except Exception as e:
            print(f"Ошибка ТГ: {e}")

# --- Эндпоинты ---

@app.get("/tasks")
async def get_tasks():
    conn = get_db_connection()
    tasks = conn.execute("SELECT * FROM tasks").fetchall()
    conn.close()
    # Превращаем строки БД в список словарей
    return [dict(task) for task in tasks]

@app.post("/tasks")
async def create_task(task: Task, background_tasks: BackgroundTasks):
    conn = get_db_connection()
    try:
        conn.execute("""
            INSERT INTO tasks (id, title, description, amount, deadline, contract_address, customer_address, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (task.id, task.title, task.description, task.amount, task.deadline, 
              task.contract_address, task.customer_address, task.status))
        conn.commit()
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=400, detail="Task ID already exists")
    finally:
        conn.close()
    
    msg = f"📦 <b>Новый заказ!</b>\n\n<b>{task.title}</b>\nЦена: {task.amount} TON"
    background_tasks.add_task(send_tg_message, msg)
    return task

@app.patch("/tasks/{task_id}")
async def update_task(
    task_id: int, 
    background_tasks: BackgroundTasks, 
    status: Optional[str] = None, 
    freelancer_address: Optional[str] = None,
    result_link: Optional[str] = None
):
    conn = get_db_connection()
    task = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
    
    if not task:
        conn.close()
        raise HTTPException(status_code=404, detail="Task not found")

    # Формируем динамический SQL запрос на обновление
    updates = []
    params = []
    if status:
        updates.append("status = ?")
        params.append(status)
    if freelancer_address:
        updates.append("freelancer_address = ?")
        params.append(freelancer_address)
    if result_link:
        updates.append("result_link = ?")
        params.append(result_link)
    
    if updates:
        params.append(task_id)
        conn.execute(f"UPDATE tasks SET {', '.join(updates)} WHERE id = ?", params)
        conn.commit()

    conn.close()

    # Уведомления (логика та же)
    if status == 'taken':
        msg = f"⏳ <b>Заказ взят!</b>\n<i>{task['title']}</i>"
        background_tasks.add_task(send_tg_message, msg)
    elif status == 'work_submitted':
        msg = f"✅ <b>Работа сдана!</b>\n<i>{task['title']}</i>\n🔗 {result_link}"
        background_tasks.add_task(send_tg_message, msg)
    elif status == 'completed':
        msg = f"💸 <b>Завершено!</b>\nЗаказ <i>{task['title']}</i> закрыт."
        background_tasks.add_task(send_tg_message, msg)

    return {"status": "updated"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)