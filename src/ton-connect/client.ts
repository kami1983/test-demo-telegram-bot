import { TonClient, WalletContractV4, internal, TonClient4 } from "@ton/ton";
import { Factory, MAINNET_FACTORY_ADDR } from "@dedust/sdk";

let client: TonClient4 | null = null

export function getApiClient(): TonClient4 {
    if (!client) {
        client = new TonClient4({
            endpoint: "https://mainnet-v4.tonhubapi.com",
            
        });
    }
    return client
}

export function getApiFactory() {
    return getApiClient().open(Factory.createFromAddress(MAINNET_FACTORY_ADDR));
}