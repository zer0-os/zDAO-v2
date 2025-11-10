import { WalletClient, Transport, Chain, Account, RpcSchema } from "viem";


export type DaoTestWallet = WalletClient<Transport, Chain, Account, RpcSchema>;
