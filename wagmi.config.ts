import { defineConfig } from '@wagmi/cli';
import { hardhat } from '@wagmi/cli/plugins';

// TODO proto: do we need this wagmi here at all ?!

export default defineConfig({
  out: 'src/abi/generated.ts',
  plugins: [hardhat({
    project: ".",
    commands: { build: 'yarn hardhat compile' },
  })],
});
