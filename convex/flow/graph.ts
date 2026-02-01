export type FlowNode = {
  id: string
  dependsOn: string[]
}

export type FlowGraph = {
  version: string
  concurrencyLimit: number
  nodes: FlowNode[]
}

export const FLOW_GRAPH_V2: FlowGraph = {
  version: 'v2.1',
  concurrencyLimit: 2,
  nodes: [
    { id: 'G0', dependsOn: [] },
    { id: 'G0C', dependsOn: ['G0'] },
    { id: 'G1', dependsOn: ['G0C'] },
    { id: 'G2', dependsOn: ['G1'] },
    { id: 'G3', dependsOn: ['G2'] },
    { id: 'G4', dependsOn: ['G3'] },
    { id: 'G5', dependsOn: ['G4'] },
    { id: 'G6', dependsOn: ['G5'] },
    { id: 'G7', dependsOn: ['G6'] },
    { id: 'G8', dependsOn: ['G7'] },
    { id: 'G9', dependsOn: ['G8'] },
    { id: 'G10', dependsOn: ['G9'] },
  ],
}

export const FLOW_GRAPH_V3: FlowGraph = {
  version: 'v3.0',
  concurrencyLimit: 1,
  nodes: [
    { id: 'A', dependsOn: [] },
    { id: 'B', dependsOn: ['A'] },
    { id: 'C', dependsOn: ['B'] },
    { id: 'D', dependsOn: ['C'] },
    { id: 'E', dependsOn: ['D'] },
  ],
}

export function getNode(graph: FlowGraph, id: string): FlowNode | undefined {
  return graph.nodes.find((node) => node.id === id)
}

export function getReadyNodes(
  graph: FlowGraph,
  completed: Set<string>,
  running: Set<string>
): FlowNode[] {
  return graph.nodes.filter((node) => {
    if (completed.has(node.id) || running.has(node.id)) return false
    return node.dependsOn.every((dep) => completed.has(dep))
  })
}
