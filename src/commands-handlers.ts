import { CHAIN, isTelegramUrl, toUserFriendlyAddress, UserRejectsError } from '@tonconnect/sdk';
import { bot } from './bot';
import { getWallets, getWalletInfo } from './ton-connect/wallets';
import QRCode from 'qrcode';
import TelegramBot from 'node-telegram-bot-api';
import { getConnector } from './ton-connect/connector';
import { addTGReturnStrategy, buildUniversalKeyboard, pTimeout, pTimeoutException } from './utils';
import { getApiClient, getApiFactory } from './ton-connect/client';
import { JettonWallet, JettonMaster, Address, Contract, ContractProvider, WalletContractV4, WalletContractV3R2 } from '@ton/ton';
// import { Address, Contract, ContractProvider } from "@ton/core";
import { PoolType } from "@dedust/sdk";
import { Asset, VaultNative, ReadinessStatus } from "@dedust/sdk";
import Prando from 'prando';
import { keyPairFromSeed } from '@ton/crypto';

let newConnectRequestListenersMap = new Map<number, () => void>();

export async function handleConnectCommand(msg: TelegramBot.Message): Promise<void> {
    const chatId = msg.chat.id;

    let messageWasDeleted = false;

    newConnectRequestListenersMap.get(chatId)?.();

    const connector = getConnector(chatId, () => {
        unsubscribe();
        newConnectRequestListenersMap.delete(chatId);
        deleteMessage();
    });

    await connector.restoreConnection();
    if (connector.connected) {
        const connectedName =
            (await getWalletInfo(connector.wallet!.device.appName))?.name ||
            connector.wallet!.device.appName;
        await bot.sendMessage(
            chatId,
            `You have already connect ${connectedName} wallet\nYour address: ${toUserFriendlyAddress(
                connector.wallet!.account.address,
                connector.wallet!.account.chain === CHAIN.TESTNET
            )}\n\n Disconnect wallet firstly to connect a new one`
        );

        return;
    }

    const unsubscribe = connector.onStatusChange(async wallet => {
        if (wallet) {
            await deleteMessage();

            const walletName =
                (await getWalletInfo(wallet.device.appName))?.name || wallet.device.appName;
            await bot.sendMessage(chatId, `${walletName} wallet connected successfully`);
            unsubscribe();
            newConnectRequestListenersMap.delete(chatId);
        }
    });

    const wallets = await getWallets();

    const link = connector.connect(wallets);
    const image = await QRCode.toBuffer(link);

    const keyboard = await buildUniversalKeyboard(link, wallets);

    const botMessage = await bot.sendPhoto(chatId, image, {
        reply_markup: {
            inline_keyboard: [keyboard]
        }
    });

    const deleteMessage = async (): Promise<void> => {
        if (!messageWasDeleted) {
            messageWasDeleted = true;
            await bot.deleteMessage(chatId, botMessage.message_id);
        }
    };

    newConnectRequestListenersMap.set(chatId, async () => {
        unsubscribe();

        await deleteMessage();

        newConnectRequestListenersMap.delete(chatId);
    });
}

export async function handleSendTXCommand(msg: TelegramBot.Message): Promise<void> {
    const chatId = msg.chat.id;

    const connector = getConnector(chatId);

    await connector.restoreConnection();
    if (!connector.connected) {
        await bot.sendMessage(chatId, 'Connect wallet to send transaction');
        return;
    }

    pTimeout(
        connector.sendTransaction({
            validUntil: Math.round(
                (Date.now() + Number(process.env.DELETE_SEND_TX_MESSAGE_TIMEOUT_MS)) / 1000
            ),
            messages: [
                {
                    amount: '1000000',
                    address: '0:0000000000000000000000000000000000000000000000000000000000000000'
                }
            ]
        }),
        Number(process.env.DELETE_SEND_TX_MESSAGE_TIMEOUT_MS)
    )
        .then(() => {
            bot.sendMessage(chatId, `Transaction sent successfully`);
        })
        .catch(e => {
            if (e === pTimeoutException) {
                bot.sendMessage(chatId, `Transaction was not confirmed`);
                return;
            }

            if (e instanceof UserRejectsError) {
                bot.sendMessage(chatId, `You rejected the transaction`);
                return;
            }

            bot.sendMessage(chatId, `Unknown error happened`);
        })
        .finally(() => connector.pauseConnection());

    let deeplink = '';
    const walletInfo = await getWalletInfo(connector.wallet!.device.appName);
    if (walletInfo) {
        deeplink = walletInfo.universalLink;
    }

    if (isTelegramUrl(deeplink)) {
        const url = new URL(deeplink);
        url.searchParams.append('startattach', 'tonconnect');
        deeplink = addTGReturnStrategy(url.toString(), process.env.TELEGRAM_BOT_LINK!);
    }

    await bot.sendMessage(
        chatId,
        `Open ${walletInfo?.name || connector.wallet!.device.appName} and confirm transaction`,
        {
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: `Open ${walletInfo?.name || connector.wallet!.device.appName}`,
                            url: deeplink
                        }
                    ]
                ]
            }
        }
    );
}

export async function handleDisconnectCommand(msg: TelegramBot.Message): Promise<void> {
    const chatId = msg.chat.id;

    const connector = getConnector(chatId);

    await connector.restoreConnection();
    if (!connector.connected) {
        await bot.sendMessage(chatId, "You didn't connect a wallet");
        return;
    }

    await connector.disconnect();

    await bot.sendMessage(chatId, 'Wallet has been disconnected');
}

export async function handleShowMyWalletCommand(msg: TelegramBot.Message): Promise<void> {
    const chatId = msg.chat.id;

    const connector = getConnector(chatId);

    await connector.restoreConnection();
    if (!connector.connected) {
        await bot.sendMessage(chatId, "You didn't connect a wallet");
        return;
    }

    const walletName =
        (await getWalletInfo(connector.wallet!.device.appName))?.name ||
        connector.wallet!.device.appName;

    await bot.sendMessage(
        chatId,
        `Connected wallet: ${walletName}\nYour address: ${toUserFriendlyAddress(
            connector.wallet!.account.address,
            connector.wallet!.account.chain === CHAIN.TESTNET
        )}`
    );
}

export async function handleCheckKFCoinCommand(msg: TelegramBot.Message): Promise<void> {
    const chatId = msg.chat.id;

    const connector = getConnector(chatId);

    await connector.restoreConnection();
    if (!connector.connected) {
        await bot.sendMessage(chatId, "You didn't connect a wallet");
        return;
    }

    const client = getApiClient();
    let master = client.open(JettonMaster.create(Address.parse('EQANGI47B_rNmh2-H7GKlGfCF9hmf_vhf8iuPz62sQyVSanQ')));
    let walletAddress = await master.getWalletAddress(Address.parse('UQATezLBCtZQ5ToF-fak7wXqUu8RvVX0Ng-oE7hnTZ2uGkwN'));
    let jettonData = await master.getJettonData();

    let wallet = client.open(JettonWallet.create(walletAddress))
    let balance = await wallet.getBalance();
    console.log('jettonData = ', jettonData, balance)


    // const currentAddr = Address.parse('UQCHfNSbIXJsBmMlPjRnke6dEH5Nvww3hdKBSA7zhhu7QIAT')
    // console.log('currentAddr - ', currentAddr.workChain, currentAddr.toRawString())
    // const publicKeyBuffer = Buffer.from(currentAddr.toString(), 'hex');

    // let contract = client.open(WalletContractV4.create({ workchain: 0, publicKey: publicKeyBuffer }));

    // let balance_native = await contract.getBalance();
    // console.log('balance_native - ', contract.address, balance_native)

    function randomTestKey(seed: string) {
        let random = new Prando(seed);
        let res = Buffer.alloc(32);
        for (let i = 0; i < res.length; i++) {
            res[i] = random.nextInt(0, 256);
        }
        return keyPairFromSeed(res);
    }

    const publicKeyBuffer = Buffer.from('UQCHfNSbIXJsBmMlPjRnke6dEH5Nvww3hdKBSA7zhhu7QIAT', 'hex');
    // let key = randomTestKey('v4-treasure');
    // const publicKeyBuffer = key.publicKey;
    console.log('publicKeyBuffer - ', publicKeyBuffer.toString('hex'))
    
    let contract = client.open(WalletContractV3R2.create({ workchain: 0, publicKey: publicKeyBuffer }));
    let seqno = await contract.getSeqno();
    let accountAddress = Address.parse('UQCHfNSbIXJsBmMlPjRnke6dEH5Nvww3hdKBSA7zhhu7QIAT')
    console.log('seqno - ', {seqno, accountAddress})

    let accountData = await client.getAccount(seqno, accountAddress)
    console.log('accountData - ', accountData)
    
    // let accBalance = (await contract.getAccount(seqno, accountAddress)).account.balance
    // let balance_native = await contract.getBalance();
    // console.log('balance_native - ', contract.address, balance_native);

    

    await bot.sendMessage(chatId, 'handleCheckKFCoinCommand 2');

}