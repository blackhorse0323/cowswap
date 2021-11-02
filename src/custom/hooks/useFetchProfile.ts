import { useActiveWeb3React } from 'hooks/web3'
import { useEffect, useState } from 'react'
import { getProfileData } from 'api/gnosisProtocol'
import { ProfileData } from 'api/gnosisProtocol/api'

type FetchProfileState = {
  profileData: ProfileData | null
  //error: string
  isLoading: boolean
}

const emptyState: FetchProfileState = {
  profileData: null,
  //error: '',
  isLoading: false,
}

const FETCH_INTERVAL_IN_MINUTES = 5

export default function useFetchProfile(): FetchProfileState {
  const { account, chainId } = useActiveWeb3React()
  const [profile, setProfile] = useState<FetchProfileState>(emptyState)

  useEffect(() => {
    async function fetchAndSetProfileData() {
      if (chainId && account) {
        setProfile({ ...emptyState, isLoading: true })
        const profileData = await getProfileData(chainId, account)
        setProfile({ ...emptyState, isLoading: false, profileData })
      } else {
        setProfile(emptyState)
      }
    }

    const intervalId = setInterval(fetchAndSetProfileData, FETCH_INTERVAL_IN_MINUTES * 60_000)

    fetchAndSetProfileData()
    return () => clearInterval(intervalId)
  }, [account, chainId])

  return profile
}
