import { describe, expect, it } from "vitest"
import { availableForwardingPorts, FORWARDING_PORTS, isForwardingPort } from "./topologyPorts"
import type { TopologyFormValues } from "./exerciseSchemas"

const endpoint = (deviceID: string, port: string) => ({ Kind: "device" as const, DeviceID: deviceID, Interface: port })

describe("forwarding ports", () => {
  it("has exactly the canonical first through 48th logical port", () => {
    expect(FORWARDING_PORTS).toHaveLength(48)
    expect(FORWARDING_PORTS[0]).toBe("GigabitEthernet0/1")
    expect(FORWARDING_PORTS[47]).toBe("GigabitEthernet0/48")
    expect(isForwardingPort("GigabitEthernet0/0")).toBe(false)
    expect(isForwardingPort("GigabitEthernet0/49")).toBe(false)
    expect(isForwardingPort("GigabitEthernet0/01")).toBe(false)
  })

  it("excludes occupied ports except the current endpoint while editing", () => {
    const topology = { Connections: [{ Endpoints: [endpoint("sw", "GigabitEthernet0/1"), endpoint("host", "eth0")] }] } as Pick<TopologyFormValues, "Connections">
    expect(availableForwardingPorts(topology, "sw")).not.toContain("GigabitEthernet0/1")
    expect(availableForwardingPorts(topology, "sw", { connectionIndex: 0, side: 0 })).toContain("GigabitEthernet0/1")
    expect(availableForwardingPorts(topology, "other-switch")).toContain("GigabitEthernet0/1")
    expect(availableForwardingPorts({ Connections: [] }, "sw")).toContain("GigabitEthernet0/1")
  })
})
