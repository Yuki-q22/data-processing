import { createElement, type ReactNode } from 'react'
import type { AbstractNode, IconDefinition } from '@ant-design/icons-svg/es/types'

type AntIconGlyphProps = {
  icon: IconDefinition
}

function renderNode(node: AbstractNode, key?: number): ReactNode {
  const children: ReactNode[] | undefined = node.children?.map((child, index) => renderNode(child, index))
  return createElement(node.tag, { ...node.attrs, key }, children)
}

export default function AntIconGlyph({ icon }: AntIconGlyphProps) {
  const node = typeof icon.icon === 'function' ? icon.icon('currentColor', 'currentColor') : icon.icon
  const children = node.children?.map((child, index) => renderNode(child, index))

  return (
    <span className="anticon app-menu-icon-glyph" aria-hidden="true">
      {createElement(
        node.tag,
        {
          ...node.attrs,
          width: '1em',
          height: '1em',
          fill: 'currentColor',
        },
        children
      )}
    </span>
  )
}
