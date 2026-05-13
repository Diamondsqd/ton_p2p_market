import { Address, toNano } from '@ton/core';
import { TaskEscrow } from '../wrappers/TaskEscrow';
import { NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider) {
    // 1. Указываем адрес заказчика (твой адрес из Tonkeeper)
    // ЗАМЕНИ НА СВОЙ АДРЕС
    const customerAddress = Address.parse('0QDbNONXZj1IeC1akPyTxWxlfSImhcpdEk6ei-yyTniUe94n'); 

    // 2. Указываем дедлайн (например, через 24 часа от текущего момента)
    const deadline = Math.floor(Date.now() / 1000) + 60 * 60 * 24;

    // Инициализируем контракт
    const taskEscrow = provider.open(await TaskEscrow.fromInit(customerAddress, BigInt(deadline)));

    // Отправляем транзакцию деплоя с депозитом (например, 0.1 TON на выполнение)
    // Сами деньги задачи (основной депозит) можно прислать этим же сообщением
    await taskEscrow.send(
        provider.sender(),
        {
            value: toNano('0.5'), // Сумма деплоя + комиссии
        },
        {
            $$type: 'Deploy',
            queryId: 0n,
        }
    );

    await provider.waitForDeploy(taskEscrow.address);

    console.log('--- КОНТРАКТ РАЗВЕРНУТ ---');
    console.log('Адрес контракта:', taskEscrow.address.toString());
}