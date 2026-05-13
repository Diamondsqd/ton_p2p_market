import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { toNano } from '@ton/core';
import { TaskEscrow } from '../build/TaskEscrow/TaskEscrow_TaskEscrow';
import '@ton/test-utils';

describe('TaskEscrow', () => {
    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let taskEscrow: SandboxContract<TaskEscrow>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();

        taskEscrow = blockchain.openContract(await TaskEscrow.fromInit());

        deployer = await blockchain.treasury('deployer');

        const deployResult = await taskEscrow.send(
            deployer.getSender(),
            {
                value: toNano('0.05'),
            },
            null,
        );

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: taskEscrow.address,
            deploy: true,
            success: true,
        });
    });

    it('should deploy', async () => {
        // the check is done inside beforeEach
        // blockchain and taskEscrow are ready to use
    });
});
