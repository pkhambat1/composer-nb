// components/MarkdownCell.jsx — Markdown rendering (marked -> React, no innerHTML)
import React from "react"
import { marked } from "marked"

function renderMdInline(tokens, keyBase) {
  if (!tokens) return null
  return tokens.map((tok, i) => {
    const key = keyBase + "-" + i
    switch (tok.type) {
      case "text":
        return tok.tokens ? renderMdInline(tok.tokens, key) : tok.raw
      case "strong":
        return <strong key={key}>{renderMdInline(tok.tokens, key)}</strong>
      case "em":
        return <em key={key}>{renderMdInline(tok.tokens, key)}</em>
      case "del":
        return <del key={key}>{renderMdInline(tok.tokens, key)}</del>
      case "codespan":
        return <code key={key}>{tok.text}</code>
      case "link":
        return (
          <a key={key} href={tok.href} target="_blank" rel="noopener noreferrer">
            {renderMdInline(tok.tokens, key)}
          </a>
        )
      case "br":
        return <br key={key} />
      default:
        return tok.raw || null
    }
  })
}

function renderMdBlock(tokens) {
  return tokens.map((tok, i) => {
    const key = "md-" + i
    switch (tok.type) {
      case "heading": {
        const Tag = "h" + tok.depth
        return (
          <Tag key={key}>
            {tok.tokens ? renderMdInline(tok.tokens, key) : tok.text}
          </Tag>
        )
      }
      case "paragraph":
        return <p key={key}>{renderMdInline(tok.tokens, key)}</p>
      case "code":
        return (
          <pre key={key}>
            <code>{tok.text}</code>
          </pre>
        )
      case "blockquote":
        return (
          <blockquote key={key}>{renderMdBlock(tok.tokens || [])}</blockquote>
        )
      case "list":
        return tok.ordered ? (
          <ol key={key} start={tok.start || 1}>
            {tok.items.map((item, j) => (
              <li key={key + "-li-" + j}>{renderMdBlock(item.tokens || [])}</li>
            ))}
          </ol>
        ) : (
          <ul key={key}>
            {tok.items.map((item, j) => (
              <li key={key + "-li-" + j}>{renderMdBlock(item.tokens || [])}</li>
            ))}
          </ul>
        )
      case "text":
        return tok.tokens
          ? <span key={key}>{renderMdInline(tok.tokens, key)}</span>
          : <span key={key}>{tok.raw}</span>
      case "hr":
        return <hr key={key} />
      case "space":
        return null
      default:
        return tok.raw ? <p key={key}>{tok.raw}</p> : null
    }
  })
}

export default function MarkdownContent({ source }) {
  if (!source.trim()) {
    return <p className="md-empty">Empty text cell — double-click to edit.</p>
  }
  const tokens = marked.lexer(source, { gfm: true, breaks: true })
  return <div className="md-rendered">{renderMdBlock(tokens)}</div>
}
