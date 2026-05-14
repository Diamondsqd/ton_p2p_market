import { Buffer } from 'buffer';
import React, { useState, useEffect } from 'react';
import { TonConnectButton, useTonAddress, useTonConnectUI } from '@tonconnect/ui-react';
import { Address, toNano, beginCell, storeStateInit } from '@ton/core';
import { TaskEscrow } from './wrappers/TaskEscrow_TaskEscrow';
const tg = (window as any).Telegram?.WebApp;
// Фикс Buffer для браузера
// @ts-ignore
window.Buffer = Buffer;

function App() {
  const userAddress = useTonAddress();
  const [tonConnectUI] = useTonConnectUI();
  const [user, setUser] = useState<any>(null);
  // Состояния
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('0.5');
  const [hours, setHours] = useState('24');
  const [tasks, setTasks] = useState<any[]>([]);
  const [now, setNow] = useState(Math.floor(Date.now() / 1000));
  const ADMIN_ADDRESS = "0QDbNONXZj1IeC1akPyTxWxlfSImhcpdEk6ei-yyTniUe94n";
  const API_URL = "https://ton-p2p-market.onrender.com";

  const fetchTasks = async () => {
    try {
      const response = await fetch(`${API_URL}/tasks`);
      const data = await response.json();
      setTasks(data.reverse()); 
    } catch (e) {
      console.error("Ошибка загрузки:", e);
    }
  };

  useEffect(() => {
    fetchTasks(); // Загружаем сразу
    const interval = setInterval(fetchTasks, 5000); // И потом каждые 5 секунд
    return () => clearInterval(interval); // Очищаем при закрытии
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Math.floor(Date.now() / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => { fetchTasks(); }, []);
  useEffect(() => {
        if (tg) {
            tg.ready();
            setUser(tg.initDataUnsafe?.user);
        }
    }, []);

  const formatTimeLeft = (deadline: number) => {
    const totalSeconds = deadline - now;
    if (totalSeconds <= 0) return "Срок истек ⏰";

    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;

    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Хелпер для транзакций
  const sendContractMessage = async (contractAddress: string, text: string) => {
    const transaction = {
      validUntil: Math.floor(Date.now() / 1000) + 600,
      messages: [{
        address: contractAddress,
        amount: toNano('0.05').toString(),
        payload: beginCell().storeUint(0, 32).storeStringTail(text).endCell().toBoc().toString('base64'),
      }],
    };
    return await tonConnectUI.sendTransaction(transaction);
  };

  // Создание задачи
  const createTask = async () => {
    if (!userAddress) return alert("Подключите кошелек!");
    
    // Валидация
    if (parseFloat(amount) <= 0 || parseInt(hours) <= 0) {
      return alert("Стоимость и дедлайн должны быть больше нуля!");
    }

    try {
      const customerAddr = Address.parse(userAddress);
      const adminAddr = Address.parse(ADMIN_ADDRESS);
      const amountInNano = toNano(amount);
      const gasForDeploy = toNano('0.05')
      const deadlineTimestamp = Math.floor(Date.now() / 1000) + (parseInt(hours) * 3600);
      const contract = await TaskEscrow.fromInit(customerAddr, adminAddr, BigInt(deadlineTimestamp),amountInNano);
      const contractAddress = contract.address.toString();

      const transaction = {
        validUntil: Math.floor(Date.now() / 1000) + 600,
        messages: [{
          address: contractAddress,
          amount: (amountInNano + gasForDeploy).toString(),
          stateInit: beginCell().store(storeStateInit(contract.init!!)).endCell().toBoc().toString('base64'),
          payload: beginCell().storeUint(0, 32).storeStringTail("Deploy").endCell().toBoc().toString('base64')
        }],
      };

      await tonConnectUI.sendTransaction(transaction);
      
      await fetch(`${API_URL}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: Date.now(),
          title, description, amount,
          deadline: deadlineTimestamp,
          contract_address: contractAddress,
          customer_address: userAddress,
          status: 'active',
          customer_tg_id: user?.id
        }),
      });

      setTitle(''); setDescription('');
      setTimeout(fetchTasks, 4000);
    } catch (e) { console.error(e); }
  };

  return (
    
     <div style={{ padding: '20px', fontFamily: 'sans-serif', maxWidth: '500px', margin: '0 auto', background: '#f4f7f9', minHeight: '100vh' }}>
    
    {/* --- ШАПКА ПРИЛОЖЕНИЯ --- */}
    <header style={{ 
      display: 'flex', 
      justifyContent: 'space-between', 
      alignItems: 'center', 
      marginBottom: '20px',
      padding: '10px',
      background: 'white',
      borderRadius: '12px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.05)'
    }}>
      {/* 1. Кнопка TON Connect */}
      <TonConnectButton />

      {/* 2. Блок профиля из Телеграма (вставляем сюда) */}
      {user && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontWeight: 'bold', fontSize: '14px' }}>{user.first_name}</div>
            <div style={{ fontSize: '11px', color: '#888' }}>@{user.username}</div>
          </div>
          <img 
            src={user.photo_url} 
            alt="avatar" 
            style={{ width: '38px', height: '38px', borderRadius: '50%', border: '2px solid #0088cc' }} 
          />
        </div>
      )}
    </header>

      {/* Форма создания */}
      {userAddress && (
        <div style={cardStyle}>
          <h3 style={{ marginTop: 0, color: '#333' }}>📦 Новый заказ</h3>
          
          <label style={labelStyle}>Название задачи</label>
          <input placeholder="Что нужно сделать?" value={title} onChange={(e) => setTitle(e.target.value)} style={inputStyle} />
          
          <label style={labelStyle}>Описание</label>
          <textarea placeholder="Детали задачи..." value={description} onChange={(e) => setDescription(e.target.value)} style={{ ...inputStyle, height: '60px' }} />
          
          <div style={{ display: 'flex', gap: '15px' }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Стоимость (TON)</label>
              <input type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} style={inputStyle} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Срок (в часах)</label>
              <input type="number" min="1" value={hours} onChange={(e) => setHours(e.target.value)} style={inputStyle} />
            </div>
          </div>
          
          <button onClick={createTask} style={buttonStyle}>Оплатить и опубликовать</button>
        </div>
      )}

      {/* Список задач */}
      <h3 style={{ marginBottom: '15px', color: '#333' }}>🚀 Лента заказов</h3>
      {tasks.filter(t => t.status !== 'completed').map((task) => {
        const isExpired = now > task.deadline;
        const isAdmin = userAddress === ADMIN_ADDRESS;

        return (
          <div key={task.id} style={taskCardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
              <span style={{ fontWeight: 'bold', fontSize: '16px' }}>{task.title}</span>
              <span style={priceTagStyle}>{task.amount} TON</span>
            </div>
            
            {/* ВЫВОД ТАЙМЕРА */}
            <div style={{ fontSize: '12px', color: isExpired ? '#f44336' : '#0088cc', marginBottom: '10px', fontWeight: 'bold' }}>
              {task.status === 'taken' || task.status === 'active' 
                ? `⏳ Осталось: ${formatTimeLeft(task.deadline)}` 
                : `✅ Работа на проверке`}
            </div>

            <p style={{ fontSize: '14px', color: '#555', marginBottom: '15px' }}>{task.description}</p>
            
            <div style={{ borderTop: '1px solid #eee', paddingTop: '15px' }}>
              {/* КНОПКА СПОРА: доступна когда задача в работе или сдана */}
              {(task.status === 'taken' || task.status === 'work_submitted') && 
               (task.customer_address === userAddress || task.freelancer_address === userAddress) && (
                <button 
                  onClick={async () => {
                    await sendContractMessage(task.contract_address, "Dispute");
                    await fetch(`${API_URL}/tasks/${task.id}?status=disputed`, { method: 'PATCH' });
                    fetchTasks();
                  }}
                  style={{ background: 'none', border: 'none', color: '#f44336', fontSize: '12px', cursor: 'pointer', marginBottom: '10px' }}
                >
                  ⚠️ Открыть спор (Арбитраж)
                </button>
              )}
              {/* ПАНЕЛЬ АДМИНА (видна только тебе) */}
              {task.status === 'disputed' && isAdmin && (
                <div style={{ background: '#fff3e0', padding: '10px', borderRadius: '8px', border: '1px solid #ffb74d' }}>
                  <div style={{ fontSize: '13px', fontWeight: 'bold', marginBottom: '10px', textAlign: 'center' }}>⚖️ АРБИТРАЖ</div>
                  <div style={{ display: 'flex', gap: '5px' }}>
                    <button 
                      onClick={async () => {
                        await sendContractMessage(task.contract_address, "AdminRelease");
                        await fetch(`${API_URL}/tasks/${task.id}?status=completed`, { method: 'PATCH' });
                        fetchTasks();
                      }}
                      style={{ ...actionBtn('#4caf50'), fontSize: '12px' }}
                    > Выплатить исполнителю </button>
                    <button 
                      onClick={async () => {
                        await sendContractMessage(task.contract_address, "AdminRefund");
                        await fetch(`${API_URL}/tasks/${task.id}?status=completed`, { method: 'PATCH' });
                        fetchTasks();
                      }}
                      style={{ ...actionBtn('#f44336'), fontSize: '12px' }}
                    > Вернуть заказчику </button>
                  </div>
                </div>
              )}
              
              {/* Логика Фрилансера */}
              {task.status === 'active' && task.customer_address !== userAddress && (
                <button onClick={async () => {
                  await sendContractMessage(task.contract_address, "Take");
                  await fetch(`${API_URL}/tasks/${task.id}?status=taken&freelancer_address=${userAddress}&freelancer_tg_id=${user?.id}`, { method: 'PATCH' });
                  fetchTasks();
                }} style={actionBtn('#4caf50')}>Взять в работу</button>
              )}
              
              {task.status === 'taken' && task.freelancer_address === userAddress && (
                <button onClick={async () => {
                  const link = prompt("Введите ссылку на результат работы (Google Drive, GitHub, и т.д.):");
                  if (!link) return alert("Нужно предоставить ссылку на результат!");

                  await sendContractMessage(task.contract_address, "Complete");
                  
                  // Отправляем на бэкенд и статус, и ссылку
                  await fetch(`${API_URL}/tasks/${task.id}?status=work_submitted&result_link=${encodeURIComponent(link)}`, { 
                    method: 'PATCH' 
                  });
                  
                  fetchTasks();
                }} style={actionBtn('#ff9800')}>Сдать работу ✅</button>
              )}

              {/* Логика Заказчика */}
              {task.customer_address === userAddress && (
                <div style={{ textAlign: 'center' }}>
                  {task.status === 'active' && <span style={{ color: '#0088cc' }}>🔍 Поиск исполнителя...</span>}
                  
                  {task.status === 'taken' && (
                    <div>
                      <div style={{ color: '#ff9800', marginBottom: '10px' }}>⏳ Исполнитель работает</div>
                      {isExpired && (
                        <button onClick={async () => {
                          await sendContractMessage(task.contract_address, "Refund");
                          await fetch(`${API_URL}/tasks/${task.id}?status=completed`, { method: 'PATCH' });
                          fetchTasks();
                        }} style={actionBtn('#f44336')}>⏰ Срок вышел: Вернуть TON</button>
                      )}
                    </div>
                  )}

                  {task.status === 'work_submitted' && (
                    <div style={{ background: '#e8f5e9', padding: '10px', borderRadius: '8px', marginBottom: '10px', textAlign: 'center' }}>
                      <div style={{ fontSize: '12px', color: '#2e7d32', fontWeight: 'bold' }}>ССЫЛКА НА РЕЗУЛЬТАТ:</div>
                      <a href={task.result_link} target="_blank" rel="noreferrer" style={{ wordBreak: 'break-all', color: '#0088cc' }}>
                        {task.result_link}
                      </a>
                    </div>
                  )}

                  {task.status === 'work_submitted' && (
                    <button onClick={async () => {
                      await sendContractMessage(task.contract_address, "Release");
                      await fetch(`${API_URL}/tasks/${task.id}?status=completed`, { method: 'PATCH' });
                      fetchTasks();
                    }} style={actionBtn('#0088cc')}>Подтвердить и Оплатить 💸</button>
                  )}
                </div>
              )}

              {/* Состояние для фрилансера на проверке */}
              {task.status === 'work_submitted' && task.freelancer_address === userAddress && (
                <div style={{ textAlign: 'center', color: '#4caf50', fontWeight: 'bold' }}>📡 На проверке у заказчика</div>
              )}
              {task.status === 'disputed' && !isAdmin && (
                <div style={{ textAlign: 'center', color: '#ff9800', fontWeight: 'bold' }}>⚖️ Идет разбирательство арбитром...</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Стили
const cardStyle = { background: '#fff', padding: '20px', borderRadius: '15px', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', marginBottom: '25px' };
const inputStyle = { width: '100%', padding: '12px', marginBottom: '12px', borderRadius: '8px', border: '1px solid #ddd', boxSizing: 'border-box' as const, fontSize: '14px' };
const labelStyle = { display: 'block', fontSize: '12px', color: '#666', marginBottom: '5px', fontWeight: 'bold' as const, marginLeft: '5px' };
const buttonStyle = { width: '100%', padding: '14px', background: '#0088cc', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 'bold' as const, cursor: 'pointer', fontSize: '16px' };
const taskCardStyle = { background: 'white', padding: '18px', borderRadius: '15px', marginBottom: '15px', boxShadow: '0 2px 6px rgba(0,0,0,0.04)' };
const priceTagStyle = { background: '#e3f2fd', color: '#1976d2', padding: '4px 12px', borderRadius: '8px', fontWeight: 'bold' as const, fontSize: '14px' };
const actionBtn = (color: string) => ({ width: '100%', padding: '12px', background: color, color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold' as const, cursor: 'pointer' });

export default App;