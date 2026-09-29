import { apiGet } from "@/api/client"

export type FlagPolicy = {
  RandomHexLength: number
  RandomBits: number
  WarningBits: number
}

export function getFlagPolicy(): Promise<FlagPolicy> {
  return apiGet<FlagPolicy>("/api/exercises/flag-policy")
}
