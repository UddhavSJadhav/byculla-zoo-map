import type { Position } from 'geojson'
import type { PathAccessStatus } from '../paths/types.ts'
import { haversineMeters, nodeKey } from './distance.ts'

export interface RouteSegment {
  id: string
  status: PathAccessStatus
  coordinates: readonly Position[]
}

export interface WalkArc {
  to: string
  pathId: string
  meters: number
}

export interface WalkingGraph {
  nodes: ReadonlyMap<string, Position>
  adjacency: ReadonlyMap<string, readonly WalkArc[]>
  includedPathIds: readonly string[]
  excluded: readonly { id: string; status: PathAccessStatus }[]
}

export interface NetworkStructure {
  segments: number
  nodes: number
  edges: number
  sharedNodes: number
  midLineJunctions: number
  components: number
  largestComponent: number
}

const visitorStatus: PathAccessStatus = 'accessible'

export function buildWalkingGraph(segments: readonly RouteSegment[]): WalkingGraph {
  const nodes = new Map<string, Position>()
  const adjacency = new Map<string, WalkArc[]>()
  const includedPathIds: string[] = []
  const excluded: { id: string; status: PathAccessStatus }[] = []
  for (const segment of segments) {
    if (segment.status !== visitorStatus) {
      excluded.push({ id: segment.id, status: segment.status })
      continue
    }
    const placed = placeSegment(segment, nodes, adjacency)
    if (placed) includedPathIds.push(segment.id)
  }
  return { nodes, adjacency, includedPathIds, excluded }
}

export function describeNetwork(segments: readonly { id: string; coordinates: readonly Position[] }[]): NetworkStructure {
  const membership = new Map<string, { ids: Set<string>; interior: boolean }>()
  const adjacency = new Map<string, Set<string>>()
  let edges = 0
  for (const segment of segments) {
    const keys: string[] = []
    segment.coordinates.forEach((position, index) => {
      const key = nodeKey(position)
      if (!key) return
      const last = index === segment.coordinates.length - 1
      const endpoint = index === 0 || last
      const entry = membership.get(key) ?? { ids: new Set<string>(), interior: false }
      entry.ids.add(segment.id)
      if (!endpoint) entry.interior = true
      membership.set(key, entry)
      keys.push(key)
    })
    for (let index = 1; index < keys.length; index += 1) {
      const from = keys[index - 1]
      const to = keys[index]
      if (!from || !to || from === to) continue
      edges += 1
      const left = adjacency.get(from) ?? new Set<string>()
      left.add(to)
      adjacency.set(from, left)
      const right = adjacency.get(to) ?? new Set<string>()
      right.add(from)
      adjacency.set(to, right)
    }
  }
  let sharedNodes = 0
  let midLineJunctions = 0
  for (const entry of membership.values()) {
    if (entry.ids.size < 2) continue
    sharedNodes += 1
    if (entry.interior) midLineJunctions += 1
  }
  const seen = new Set<string>()
  let components = 0
  let largestComponent = 0
  for (const start of membership.keys()) {
    if (seen.has(start)) continue
    components += 1
    let size = 0
    const stack = [start]
    seen.add(start)
    while (stack.length > 0) {
      const current = stack.pop()
      if (!current) continue
      size += 1
      for (const next of adjacency.get(current) ?? []) {
        if (seen.has(next)) continue
        seen.add(next)
        stack.push(next)
      }
    }
    if (size > largestComponent) largestComponent = size
  }
  return {
    segments: segments.length,
    nodes: membership.size,
    edges,
    sharedNodes,
    midLineJunctions,
    components,
    largestComponent,
  }
}

export function cachedGraph(read: () => readonly RouteSegment[], subscribe: (listener: () => void) => () => void): () => WalkingGraph {
  let current: WalkingGraph | null = null
  subscribe(() => {
    current = null
  })
  return () => {
    if (!current) current = buildWalkingGraph(read())
    return current
  }
}

function placeSegment(segment: RouteSegment, nodes: Map<string, Position>, adjacency: Map<string, WalkArc[]>): boolean {
  const keys: string[] = []
  for (const position of segment.coordinates) {
    const key = nodeKey(position)
    if (!key) continue
    if (!nodes.has(key)) nodes.set(key, [Number(position[0]), Number(position[1])])
    keys.push(key)
  }
  let linked = false
  for (let index = 1; index < keys.length; index += 1) {
    const from = keys[index - 1]
    const to = keys[index]
    if (!from || !to || from === to) continue
    const fromPosition = nodes.get(from)
    const toPosition = nodes.get(to)
    if (!fromPosition || !toPosition) continue
    const meters = haversineMeters(fromPosition, toPosition)
    addArc(adjacency, from, { to, pathId: segment.id, meters })
    addArc(adjacency, to, { to: from, pathId: segment.id, meters })
    linked = true
  }
  return linked
}

function addArc(adjacency: Map<string, WalkArc[]>, from: string, arc: WalkArc) {
  const arcs = adjacency.get(from)
  if (arcs) arcs.push(arc)
  else adjacency.set(from, [arc])
}
