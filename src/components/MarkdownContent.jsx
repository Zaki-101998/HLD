import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import MermaidDiagram from './MermaidDiagram'

export default function MarkdownContent({ children, className = '' }) {
  return (
    <div className={`md-content ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: (props) => <a {...props} target="_blank" rel="noreferrer" />,
          pre: ({ children, ...props }) => {
            const child = Array.isArray(children) ? children[0] : children
            const cls = child?.props?.className || ''
            if (cls.includes('language-mermaid')) {
              return <MermaidDiagram code={String(child.props.children ?? '').trim()} />
            }
            return <pre {...props}>{children}</pre>
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}
