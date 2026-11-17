import { parseAbi } from "viem"

// Event signatures copied from the verified Coordinator sources in
// (Coordinator.sol and CoordinatorV2.sol, version 2.04; Blockscout and Sourcify).
// decode.test.ts pins every topic0 to the values captured from chain.
export const statementPublishedV1 = parseAbi([
  "event StatementPublished(string indexed indexedStatementId, string statementId, string indexed indexedTeamId, string teamId, uint256 closingAccountBalanceCents, address collateralProxy, uint256 liquidatableAfter)",
])

export const statementPublishedV2 = parseAbi([
  "event StatementPublished(string indexed indexedStatementId, string statementId, string indexed indexedTeamId, string teamId, uint256 closingAccountBalanceCents, address collateralProxy, uint256 liquidatableAfter, address liquidationAddress)",
])

// Liquidation and Withdrawal are identical in both versions.
export const coordinatorEvents = parseAbi([
  "event Liquidation(address indexed collateralProxy, address[] assets, uint256[] amountsNative, uint256[] amountsCents, uint8[] assetDecimals, uint256 netAmountCents, uint256[] feeNative, string indexed indexedTeamId, string teamId, string indexed indexedStatementId, string statementId)",
  "event Withdrawal(address indexed collateralProxy, address asset, address recipient, uint256 amountNative)",
])

export const TOPICS = {
  statementPublishedV1:
    "0x81b3d17879f50f75656c1abbaa17b9e3f8476269565cf5e324f6ce031694328c",
  statementPublishedV2:
    "0x31c1d5ba9e877efe5b8abab29663eebb44829a60bea5c096a66cc8e2c6b636eb",
  liquidation:
    "0x8ffbf5b0226477a4783d04864504c4387123a733c097c607511ad62050434a66",
  withdrawal:
    "0x342e7ff505a8a0364cd0dc2ff195c315e43bce86b204846ecd36913e117b109e",
} as const

// A scanner that only knows the old StatementPublished topic silently loses
// every 2.04 Coordinator, so the indexer always asks for all four.
export const ALL_TOPICS = Object.values(TOPICS)
