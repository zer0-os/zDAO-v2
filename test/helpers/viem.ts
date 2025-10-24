import hre from "hardhat";
import type { Account, WalletClient } from "viem";
import type { ContractReturnType } from "@nomicfoundation/hardhat-viem/types";

// <-- TYPES -->
// exact helper shape returned by hardhat-viem
export type Viem = Awaited<ReturnType<typeof hre.network.connect>>["viem"];
// valid compiled contract names inferred from viem.deployContract
export type ContractName = Parameters<Viem["deployContract"]>[0];
// instance type returned by viem.deployContract for a given name
export type Contract<Name extends ContractName> = ContractReturnType<Name>;
export type Wallet = WalletClient & { account : Account; };

// <-- HELPERS -->
// ensure a WalletClient definitely has an account (narrow once, use everywhere)
export const withAccount = <T extends WalletClient>(w : T) : T & { account : Account; } => {
  if (!w.account) throw new Error("WalletClient has no account");
  return w as T & { account : Account; };
};

// init viem, connect to Hardhat, get `walletCount` amount of wallets, 4 by default
export const setupViem = async (walletCount = 4) => {
  const { viem } = await hre.network.connect();
  const all = (await viem.getWalletClients()).map(withAccount);
  if (walletCount < 0) throw new Error("count must be >= 0");
  if (walletCount > all.length) {
    throw new Error(`Requested ${walletCount} wallets, but only ${all.length} are available`);
  }
  const wallets = all.slice(0, walletCount) as Array<Wallet>;
  return { viem, wallets } as const;
};

// deploy by contract name; return is correctly typed to that contract
export const deploy = async <Name extends ContractName>(
  viem : Viem,
  name : Name,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ...args : Array<any> // args validated by viem at runtime; keeps tests ergonomic
) : Promise<Contract<Name>> =>
  // @ts-expect-error viem’s deployContract has multiple call signatures; runtime validation covers args
  viem.deployContract(name, args);

