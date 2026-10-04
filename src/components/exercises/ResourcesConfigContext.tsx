"use client"

import { createContext, useContext } from "react"
import type { ResourcesConfig } from "@/api/exercises/capabilities"

const ResourcesConfigContext = createContext<ResourcesConfig | null>(null)

/** The platform's device resources settings; null until the capabilities load. */
export const ResourcesConfigProvider = ResourcesConfigContext.Provider
export const useResourcesConfig = () => useContext(ResourcesConfigContext)
