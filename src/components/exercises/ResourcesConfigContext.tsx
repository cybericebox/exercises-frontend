"use client"

import { createContext, useContext } from "react"
import type { ResourcesConfig } from "@/api/exercises/capabilities"

const ResourcesConfigContext = createContext<ResourcesConfig | null>(null)
const ResourcesConfigLoadingContext = createContext(false)

/** The platform's device resources settings; null while loading or when the platform does not provide them. */
export const ResourcesConfigProvider = ResourcesConfigContext.Provider
export const useResourcesConfig = () => useContext(ResourcesConfigContext)
/** True only while the settings are being fetched: a null config after that means there are none to show. */
export const ResourcesConfigLoadingProvider = ResourcesConfigLoadingContext.Provider
export const useResourcesConfigLoading = () => useContext(ResourcesConfigLoadingContext)
