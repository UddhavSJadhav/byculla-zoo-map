import type { LineString, Position } from 'geojson'
import { nodeKey } from './distance.ts'
import type { WalkingGraph } from './graph.ts'

export interface WalkingRoute {
  ok: true
  distanceMeters: number
  geometry: LineString
  pathIds: string[]
}

export interface UnavailableRoute {
  ok: false
  reason: 'start-not-on-network' | 'end-not-on-network' | 'no-route'
}

export type RouteResult = WalkingRoute | UnavailableRoute

interface Candidate {
  key: string
  distance: number
}

export function shortestWalk(graph: WalkingGraph, start: Position, end: Position): RouteResult {
  const startKey = nodeKey(start)
  const endKey = nodeKey(end)
  if (!startKey || !graph.nodes.has(startKey)) return { ok: false, reason: 'start-not-on-network' }
  if (!endKey || !graph.nodes.has(endKey)) return { ok: false, reason: 'end-not-on-network' }
  if (startKey === endKey) {
    const position = graph.nodes.get(startKey) ?? start
    return { ok: true, distanceMeters: 0, geometry: line([position, position]), pathIds: [] }
  }
  const best = new Map<string, number>([[startKey, 0]])
  const previous = new Map<string, { key: string; pathId: string }>()
  const heap: Candidate[] = [{ key: startKey, distance: 0 }]
  while (heap.length > 0) {
    const current = pop(heap)
    if (!current) break
    if (current.distance !== best.get(current.key)) continue
    if (current.key === endKey) break
    for (const arc of graph.adjacency.get(current.key) ?? []) {
      const next = current.distance + arc.meters
      const known = best.get(arc.to)
      if (known !== undefined && next >= known) continue
      best.set(arc.to, next)
      previous.set(arc.to, { key: current.key, pathId: arc.pathId })
      push(heap, { key: arc.to, distance: next })
    }
  }
  if (!best.has(endKey) || !previous.has(endKey)) return { ok: false, reason: 'no-route' }
  const keys: string[] = []
  const pathIds: string[] = []
  let cursor: string | undefined = endKey
  while (cursor && cursor !== startKey) {
    keys.push(cursor)
    const step: { key: string; pathId: string } | undefined = previous.get(cursor)
    if (!step) return { ok: false, reason: 'no-route' }
    if (pathIds[0] !== step.pathId) pathIds.unshift(step.pathId)
    cursor = step.key
  }
  keys.push(startKey)
  keys.reverse()
  const coordinates = keys.map((key) => graph.nodes.get(key)).filter((position): position is Position => position !== undefined)
  return { ok: true, distanceMeters: best.get(endKey) ?? 0, geometry: line(coordinates), pathIds }
}

function line(coordinates: Position[]): LineString {
  return { type: 'LineString', coordinates }
}

function push(heap: Candidate[], candidate: Candidate) {
  heap.push(candidate)
  let index = heap.length - 1
  while (index > 0) {
    const parent = Math.floor((index - 1) / 2)
    const parentItem = heap[parent]
    const child = heap[index]
    if (!parentItem || !child || parentItem.distance <= child.distance) break
    heap[parent] = child
    heap[index] = parentItem
    index = parent
  }
}

function pop(heap: Candidate[]): Candidate | undefined {
  const root = heap[0]
  const last = heap.pop()
  if (!root || !last || heap.length === 0) return root
  heap[0] = last
  let index = 0
  while (true) {
    const left = index * 2 + 1
    const right = left + 1
    let smallest = index
    const leftItem = heap[left]
    const rightItem = heap[right]
    const current = heap[smallest]
    if (leftItem && current && leftItem.distance < current.distance) smallest = left
    const chosen = heap[smallest]
    if (rightItem && chosen && rightItem.distance < chosen.distance) smallest = right
    if (smallest === index) break
    const swap = heap[index]
    const next = heap[smallest]
    if (!swap || !next) break
    heap[index] = next
    heap[smallest] = swap
    index = smallest
  }
  return root
}
