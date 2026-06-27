import ImageObject from './objects/ImageObject'
import IdeaObject from './objects/IdeaObject'
import LinkObject from './objects/LinkObject'
import PaletteObject from './objects/PaletteObject'
import TodoObject from './objects/TodoObject'
import CollectionObject from './objects/CollectionObject'
import DocumentObject from './objects/DocumentObject'

// Map stored type names to current canonical names.
// Never persisted — only used for rendering decisions.
export function normalizeType(type) {
  if (type === 'text' || type === 'note') return 'idea'
  if (type === 'color') return 'palette'
  if (type === 'column') return 'collection'
  return type
}

export default function ObjectRenderer(props) {
  const type = normalizeType(props.el.type)
  switch (type) {
    case 'image':      return <ImageObject {...props} />
    case 'idea':       return <IdeaObject {...props} />
    case 'link':       return <LinkObject {...props} />
    case 'palette':    return <PaletteObject {...props} />
    case 'todo':       return <TodoObject {...props} />
    case 'collection': return <CollectionObject {...props} />
    case 'document':   return <DocumentObject {...props} />
    default:           return null
  }
}
