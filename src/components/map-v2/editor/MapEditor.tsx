import type { Map } from 'maplibre-gl'
import { EditorChrome } from '@/components/map-v2/editor/EditorChrome'
import { useEditorSession } from '@/components/map-v2/editor/useEditorSession'

export function MapEditor({ map, editing }: { map: Map | null; editing: boolean }) {
  const session = useEditorSession(map, editing)
  if (!editing) return null
  return <EditorChrome session={session} />
}
