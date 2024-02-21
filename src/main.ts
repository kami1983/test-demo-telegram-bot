import dotenv from 'dotenv';
dotenv.config();

import { bot } from './bot';
import { walletMenuCallbacks } from './connect-wallet-menu';
import {
    handleConnectCommand,
    handleDisconnectCommand,
    handleSendTXCommand,
    handleShowMyWalletCommand,
    handleCheckKFCoinCommand,
} from './commands-handlers';
import { initRedisClient } from './ton-connect/storage';
import TelegramBot from 'node-telegram-bot-api';

async function main(): Promise<void> {
    await initRedisClient();

    const callbacks = {
        ...walletMenuCallbacks
    };

    bot.on('message', (_msg: TelegramBot.Message) => {
        // console.log('on message: ', msg)
        // const chatId = msg.chat.id;
        // send a message to the chat acknowledging receipt of their message
        // bot.sendMessage(chatId, 'Received your message');
      });

    bot.on('callback_query', query => {
        console.log('on callback_query: ', query)
        if (!query.data) {
            return;
        }

        let request: { method: string; data: string };

        try {
            request = JSON.parse(query.data);
        } catch {
            return;
        }

        if (!callbacks[request.method as keyof typeof callbacks]) {
            return;
        }

        callbacks[request.method as keyof typeof callbacks](query, request.data);
    });

    bot.onText(/\/connect/, (msg: TelegramBot.Message) => { 
        console.log('onText - connect: ', msg)
        return handleConnectCommand(msg) 
    });

    bot.onText(/\/send_tx/, handleSendTXCommand);

    bot.onText(/\/disconnect/, handleDisconnectCommand);

    bot.onText(/\/my_wallet/, handleShowMyWalletCommand);

    bot.onText(/\/check_kfc_coin/, handleCheckKFCoinCommand);

    bot.onText(/\/start/, (msg: TelegramBot.Message) => {
        console.log('onText - start: ', msg)
        bot.sendMessage(
            msg.chat.id,
            `
This is an example of a telegram bot for connecting to TON wallets and sending transactions with TonConnect.
            
Commands list: 
/connect - Connect to a wallet
/my_wallet - Show connected wallet
/send_tx - Send transaction
/disconnect - Disconnect from the wallet
/check_kfc_coin - Check KFC coin balance
`
        );
    });
}

main();
