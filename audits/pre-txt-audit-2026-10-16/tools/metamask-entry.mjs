import { createEVMClient } from '@metamask/connect-evm';
import { createMetaMaskAdapter } from './metamask-adapter.mjs';
const adapter = createMetaMaskAdapter(createEVMClient, window);
export const getProvider = adapter.getProvider;
export const connect = adapter.connect;
export const prepare = adapter.prepare;
export const disconnect = adapter.disconnect;
