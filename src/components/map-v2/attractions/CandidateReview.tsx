import { useState } from 'react'
import { candidatesFor, setCandidateHighlight, type OsmCandidate } from '@/attractions/candidates'
import { acceptOsmCandidate, rejectOsmCandidate, restoreOsmCandidate } from '@/attractions/store'
import type { AttractionRecord } from '@/attractions/types'

export function CandidateReview({ attraction, onMessage }: { attraction: AttractionRecord; onMessage: (message: string) => void }) {
  const candidates = candidatesFor(attraction.id)
  const [highlight, setHighlight] = useState<string | null>(null)
  const [pendingSourceId, setPendingSourceId] = useState<string | null>(null)

  const show = (candidate: OsmCandidate) => {
    const next = highlight === candidate.sourceId ? null : candidate.sourceId
    setCandidateHighlight(next)
    setHighlight(next)
  }

  return (
    <div className="space-y-1.5 rounded-xl bg-[#f4ead7] p-2">
      <p className="text-[11px] font-semibold text-neutral-800">OpenStreetMap candidates</p>
      <p className="text-[11px] leading-4 text-neutral-600">
        Nothing here is linked until you accept it. The visitor map has no coordinates, so compare the outlined feature with its place on this map.
      </p>
      {candidates.length === 0 ? (
        <p className="text-[11px] leading-4 text-neutral-700">
          No OpenStreetMap feature has a matching name, exhibit tag, and position inside the zoo. Draw a point or polygon instead.
        </p>
      ) : (
        candidates.map((candidate) => {
          const rejected = attraction.rejectedSourceIds.includes(candidate.sourceId)
          const linked = attraction.geometryOrigin === 'osm' && attraction.sourceFeatureId === candidate.sourceId
          return (
            <article key={candidate.sourceId} className="rounded-lg bg-white/90 p-2 text-[11px] leading-4 text-neutral-800">
              <p className="font-semibold">{candidate.name}</p>
              <p>Geometry type: {candidate.geometryType}</p>
              <p>OSM ID: {candidate.sourceId}</p>
              <p>Feature ID: {candidate.featureId}</p>
              <p>Name match: {nameMatchLabel(candidate)}</p>
              <p>{candidate.tags.join(' · ')} · inside the zoo</p>
              <p className="text-neutral-600">{candidate.note}</p>
              {candidate.alsoMatches.length > 0 ? <p className="text-neutral-600">Also a candidate for {candidate.alsoMatches.join(', ')}.</p> : null}
              <p className="font-medium">{linked ? 'Accepted' : rejected ? 'Rejected' : 'Not reviewed'}</p>
              {pendingSourceId === candidate.sourceId ? (
                <div className="mt-1 rounded-lg bg-amber-50 p-1.5">
                  <p>Link {candidate.sourceId} to exhibit {attraction.exhibitNumber}? The original OpenStreetMap feature stays in its dataset.</p>
                  <div className="mt-1 flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        const error = acceptOsmCandidate(attraction.id, candidate.sourceId)
                        setPendingSourceId(null)
                        onMessage(error ?? `Linked exhibit ${attraction.exhibitNumber} to ${candidate.sourceId}.`)
                      }}
                      className="rounded-full bg-neutral-900 px-2 py-0.5 font-semibold text-white"
                    >
                      Link
                    </button>
                    <button type="button" onClick={() => setPendingSourceId(null)} className="rounded-full bg-white px-2 py-0.5 font-medium">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-1 flex flex-wrap gap-1">
                  <button type="button" onClick={() => show(candidate)} className="rounded-full bg-neutral-100 px-2 py-0.5 font-medium">
                    {highlight === candidate.sourceId ? 'Hide on map' : 'Show on map'}
                  </button>
                  {linked ? null : (
                    <button type="button" onClick={() => setPendingSourceId(candidate.sourceId)} className="rounded-full bg-neutral-900 px-2 py-0.5 font-semibold text-white">
                      Accept
                    </button>
                  )}
                  {rejected ? (
                    <button
                      type="button"
                      onClick={() => {
                        restoreOsmCandidate(attraction.id, candidate.sourceId)
                        onMessage(`Restored ${candidate.sourceId} as a candidate.`)
                      }}
                      className="rounded-full bg-white px-2 py-0.5 font-medium"
                    >
                      Undo reject
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        rejectOsmCandidate(attraction.id, candidate.sourceId)
                        if (highlight === candidate.sourceId) {
                          setCandidateHighlight(null)
                          setHighlight(null)
                        }
                        onMessage(linked ? `Rejected ${candidate.sourceId} and removed the link.` : `Rejected ${candidate.sourceId}.`)
                      }}
                      className="rounded-full bg-white px-2 py-0.5 font-medium"
                    >
                      Reject
                    </button>
                  )}
                </div>
              )}
            </article>
          )
        })
      )}
    </div>
  )
}

function nameMatchLabel(candidate: OsmCandidate): string {
  if (candidate.nameMatch === 'exact') return 'yes'
  if (candidate.nameMatch === 'related') return `related (${candidate.name})`
  return 'shared name'
}
