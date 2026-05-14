import httpx
import sqlite3
import os
from fastapi import FastAPI, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import Optional
from dotenv import load_dotenv
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
load_dotenv()

# Настройки Telegram
BOT_TOKEN = os.getenv("BOT_TOKEN")

# --- Работа с БД ---

def init_db():
    conn = sqlite3.connect("tasks.db")
    cursor = conn.cursor()
    
    # 1. Создаем таблицу, если её нет
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
            status TEXT,
            customer_tg_id INTEGER,
            freelancer_tg_id INTEGER
        )
    """)
    
    # 2. АВТО-МИГРАЦИЯ: Проверяем, есть ли новые колонки в старой БД
    cursor.execute("PRAGMA table_info(tasks)")
    columns = [column[1] for column in cursor.fetchall()]
    
    if "customer_tg_id" not in columns:
        print("Добавляю колонку customer_tg_id...")
        cursor.execute("ALTER TABLE tasks ADD COLUMN customer_tg_id INTEGER")
        
    if "freelancer_tg_id" not in columns:
        print("Добавляю колонку freelancer_tg_id...")
        cursor.execute("ALTER TABLE tasks ADD COLUMN freelancer_tg_id INTEGER")
    
    conn.commit()
    conn.close()

# Инициализируем базу при запуске
init_db()

def get_db_connection():
    conn = sqlite3.connect("tasks.db")
    conn.row_factory = sqlite3.Row
    return conn

# --- Модели ---

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
    customer_tg_id: Optional[int] = None
    freelancer_tg_id: Optional[int] = None

async def send_tg_message(chat_id: int, text: str):
    if not chat_id:
        return
    url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"
    payload = {"chat_id": chat_id, "text": text, "parse_mode": "HTML"}
    async with httpx.AsyncClient() as client:
        try:
            res = await client.post(url, json=payload)
            if res.status_code != 200:
                print(f"Ошибка отправки сообщения: {res.text}")
        except Exception as e:
            print(f"Ошибка ТГ API: {e}")

# --- Эндпоинты ---

@app.get("/tasks")
async def get_tasks():
    conn = get_db_connection()
    tasks = conn.execute("SELECT * FROM tasks").fetchall()
    conn.close()
    return [dict(task) for task in tasks]

@app.post("/tasks")
async def create_task(task: Task, background_tasks: BackgroundTasks):
    conn = get_db_connection()
    try:
        conn.execute("""
            INSERT INTO tasks (id, title, description, amount, deadline, contract_address, customer_address, status, customer_tg_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (task.id, task.title, task.description, task.amount, task.deadline, 
              task.contract_address, task.customer_address, task.status, task.customer_tg_id))
        conn.commit()
    except sqlite3.IntegrityError:
        conn.close()
        raise HTTPException(status_code=400, detail="Task ID already exists")
    finally:
        conn.close()
    
    if task.customer_tg_id:
        msg = f"📦 <b>Заказ опубликован!</b>\n\n<b>{task.title}</b>\nЦена: {task.amount} TON"
        background_tasks.add_task(send_tg_message, task.customer_tg_id, msg)
    
    return task

@app.patch("/tasks/{task_id}")
async def update_task(
    task_id: int, 
    background_tasks: BackgroundTasks, 
    status: Optional[str] = None, 
    freelancer_address: Optional[str] = None,
    result_link: Optional[str] = None,
    freelancer_tg_id: Optional[int] = None
):
    conn = get_db_connection()
    task_exists = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
    
    if not task_exists:
        conn.close()
        raise HTTPException(status_code=404, detail="Task not found")

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
    if freelancer_tg_id:
        updates.append("freelancer_tg_id = ?")
        params.append(freelancer_tg_id)
    
    if updates:
        params.append(task_id)
        conn.execute(f"UPDATE tasks SET {', '.join(updates)} WHERE id = ?", params)
        conn.commit()

    # Берем обновленные данные для уведомлений
    updated_task = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
    conn.close()

    cust_id = updated_task['customer_tg_id']
    free_id = updated_task['freelancer_tg_id']

    # --- ЛОГИКА УВЕДОМЛЕНИЙ ---
    
    if status == 'taken':
        # Пишем заказчику
        if cust_id:
            msg_cust = f"🤝 <b>Ваш заказ взят!</b>\nИсполнитель приступил к: <i>{updated_task['title']}</i>"
            background_tasks.add_task(send_tg_message, cust_id, msg_cust)
        # Пишем исполнителю
        if free_id:
            msg_free = f"🚀 <b>Вы взяли заказ!</b>\nРабота над: <i>{updated_task['title']}</i>\n\nНе забудьте сдать результат через кнопку в приложении!"
            background_tasks.add_task(send_tg_message, free_id, msg_free)
        
    elif status == 'work_submitted' and cust_id:
        msg = f"✅ <b>Работа сдана на проверку!</b>\n<i>{updated_task['title']}</i>\n🔗 {result_link}"
        background_tasks.add_task(send_tg_message, cust_id, msg)
        
    elif status == 'completed' and free_id:
        msg = f"💸 <b>Заказ оплачен!</b>\nЗаказ <i>{updated_task['title']}</i> завершен. Деньги отправлены на ваш кошелек."
        background_tasks.add_task(send_tg_message, free_id, msg)

    return {"status": "updated"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)