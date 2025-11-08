import assert from "node:assert";
import { ContractFunctionExecutionError, WriteContractReturnType } from "viem";


/**
 * Asserts that the given contract call fails with the expected error message.
 * If the call does not fail or the error message does not match, the test will fail.
 *
 * @param call - A function returning a Promise of a contract write call (e.g., () => contract.write.method(...)).
 * @param errorMessage - Any part of the expected error message (does not have to be the full revert reason).
 *
 * Example usage:
 * await shouldFailWith(
 *   () => contract.write.method(args),
 *   "PartOfExpectedRevertReason"
 * );
 */
export const shouldFailWith = async (
  call : () => Promise<WriteContractReturnType>,
  erorMessage : string
) => {
  try {
    await call();
    assert.fail("Test: Contract call should have failed but did not");
  }  catch (e) {
    assert.ok(
      (e as ContractFunctionExecutionError).message.includes(erorMessage)
    );
  }
};