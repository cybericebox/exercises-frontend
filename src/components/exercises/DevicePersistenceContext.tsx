"use client"

import { createContext, useContext } from "react"

/** Whether the platform can keep device state; the editor hides the option when it cannot. */
const DevicePersistenceContext = createContext(false)

export const DevicePersistenceProvider = DevicePersistenceContext.Provider
export const useDevicePersistenceAvailable = () => useContext(DevicePersistenceContext)
