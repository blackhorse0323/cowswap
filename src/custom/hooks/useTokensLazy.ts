import { useCallback } from 'react'

import { Token } from '@uniswap/sdk-core'
import { Contract } from '@ethersproject/contracts'

import { useActiveWeb3React } from '@src/hooks/web3'
import { getBytes32TokenContract, getTokenContract, useMulticall2Contract } from 'hooks/useContract'
import { CallParams, getMultipleCallsResults } from 'state/multicall/utils'
import { parseStringOrBytes32 } from '@src/hooks/Tokens'
import { useAddUserToken } from '@src/state/user/hooks'
import { Erc20 } from 'abis/types'

const contractsCache: Record<string, Erc20> = {}
const bytes32ContractsCache: Record<string, Contract> = {}

/**
 * Hook that exposes a function for lazy (non-hook) fetching tokens info async
 *
 * Similar to useToken, except it fetches multiple tokens at once, and does it after component hook phase
 *
 * All the logic is heavily adapted from /src/hooks/Tokens.ts > useToken
 */
export function useTokensLazy() {
  const { library, account, chainId } = useActiveWeb3React()
  const multicall2Contract = useMulticall2Contract()
  const addUserToken = useAddUserToken()

  return useCallback(
    async (addresses: string[], withSignerIfPossible?: boolean): Promise<Record<string, Token | null> | null> => {
      if (!library || !account || !chainId || !multicall2Contract) {
        console.warn(`useTokensLazy::not initialized`)
        return null
      }

      // For every token that we need fetch 5 properties:
      // - name, symbol, decimals, name (bytes32), symbol (bytes32)
      // For that we are using the multicall contract, combining multiple calls into a single one
      // In this reduce, we group all of them together and unwind them later
      const callsParams = addresses.reduce<CallParams[]>((acc, address) => {
        // Fetch the (regular) token contract, from cache if any
        contractsCache[address] =
          contractsCache[address] || getTokenContract(address, withSignerIfPossible, library, account, chainId)
        // Fetch the (bytes32) token contract, from cache if any
        bytes32ContractsCache[address] =
          bytes32ContractsCache[address] ||
          getBytes32TokenContract(address, withSignerIfPossible, library, account, chainId)

        // For every address, create 5 queries, one for each property
        // Each query is an object of type `CallParams`, which is the format expected by Multicall

        // Merge them into a single array to be used by the multicall contract
        return acc.concat([
          {
            contract: contractsCache[address],
            methodName: 'name',
          },
          {
            contract: contractsCache[address],
            methodName: 'symbol',
          },
          {
            contract: contractsCache[address],
            methodName: 'decimals',
          },
          {
            contract: bytes32ContractsCache[address],
            methodName: 'name',
          },
          {
            contract: bytes32ContractsCache[address],
            methodName: 'symbol',
          },
        ])
      }, [])

      // Single multicall to all tokens
      const results = await getMultipleCallsResults({
        callsParams,
        multicall2Contract,
      })

      // Map addresses list into map where the address is the key and the value is the Token obj or null
      // In this step we unwind the multicall results that are all grouped together
      // We rely on the original order, unpacking results per token based on token addresses rather than call results
      return addresses.reduce<Record<string, Token | null>>((acc, address, index) => {
        // Each token sent 5 queries, so we navigate the results 5 by 5
        // Unpack the array with properties in the order which they were queried
        const [tokenName, symbol, decimals, tokenNameBytes32, symbolBytes32] = results.slice(index * 5, (index + 1) * 5)

        // Make no assumptions regarding decimals (same as base code on `useToken`)
        if (!decimals) {
          console.warn(`useTokensLazy::no decimals for token ${address}`)
          acc[address] = null
        } else {
          const token = new Token(
            chainId,
            address,
            decimals[0],
            parseStringOrBytes32(symbol?.[0], symbolBytes32?.[0], 'UNKNOWN'),
            parseStringOrBytes32(tokenName?.[0], tokenNameBytes32?.[0], 'Unknown Token')
          )
          // Adding new token to the list of User tokens
          addUserToken(token)

          acc[address] = token
        }

        return acc
      }, {})
    },
    [account, addUserToken, chainId, library, multicall2Contract]
  )
}