{/* A docs example as a cell you can edit and play. The children are the example's code
    block, which is what the page shows until the playground frame is up; it is also where
    the cell's source comes from, so the source is written once. The frame is the
    playground's embed view (playground/src/shared/embed.js), which reports its height and
    takes the page's theme through postMessage. Mintlify brings only the exported component
    into a page, so everything the component needs is inside it. */}

export const Cell = ({ children }) => {
  const wrap = useRef(null)
  const frame = useRef(null)
  const [src, setSrc] = useState(null)
  const [lines, setLines] = useState(1)
  const [height, setHeight] = useState(0)

  useEffect(() => {
    const playground = "https://composer-nb.vercel.app"
    const code = wrap.current && wrap.current.querySelector("pre code, pre, code")
    const source = (code ? code.textContent : "").replace(/\s+$/, "")
    if (!source) return

    const html = document.documentElement
    const themeNow = () =>
      html.classList.contains("dark") || html.dataset.theme === "dark" ? "dark" : "light"

    setLines(source.split("\n").length)
    setSrc(`${playground}/?embed#src=${encodeURIComponent(source)}&theme=${themeNow()}`)

    const onMessage = (e) => {
      if (!frame.current || e.source !== frame.current.contentWindow) return
      if (e.data && e.data.type === "composer-nb:height" && typeof e.data.height === "number") {
        setHeight(e.data.height)
      }
    }
    window.addEventListener("message", onMessage)

    const themeWatcher = new MutationObserver(() => {
      const target = frame.current && frame.current.contentWindow
      if (target) target.postMessage({ type: "composer-nb:theme", theme: themeNow() }, playground)
    })
    themeWatcher.observe(html, { attributes: true, attributeFilter: ["class", "data-theme"] })

    return () => {
      window.removeEventListener("message", onMessage)
      themeWatcher.disconnect()
    }
  }, [])

  const ready = height > 0
  return (
    <div className="composer-nb-cell" style={{ position: "relative", margin: "1.25em 0" }}>
      <div ref={wrap} style={ready ? { display: "none" } : undefined}>
        {children}
      </div>
      {src ? (
        <iframe
          ref={frame}
          src={src}
          title="composer-nb cell"
          loading="lazy"
          allow="autoplay"
          style={
            ready
              ? { display: "block", width: "100%", height: `${height}px`, border: 0 }
              : {
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: `${lines * 24 + 96}px`,
                  border: 0,
                  opacity: 0,
                  pointerEvents: "none",
                }
          }
        />
      ) : null}
    </div>
  )
}
