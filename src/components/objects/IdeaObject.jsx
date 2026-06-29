import { useState, useEffect, useRef } from 'react'
import ResizeHandle from '../ResizeHandle'

function useSpeechRecognition() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition
  const [available] = useState(!!SR)
  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState('')
  const recRef = useRef(null)
  const finalAccumRef = useRef('')

  function start(onChange) {
    if (!SR) return
    const rec = new SR()
    rec.continuous = true
    rec.interimResults = true
    rec.lang = navigator.language || 'en-US'
    finalAccumRef.current = ''

    rec.onresult = (e) => {
      let interimText = ''
      let finalText = ''
      for (const result of Array.from(e.results)) {
        if (result.isFinal) finalText += result[0].transcript
        else interimText += result[0].transcript
      }
      if (finalText) finalAccumRef.current = finalText
      setInterim(interimText)
      onChange(finalAccumRef.current, interimText)
    }
    rec.onend = () => { setListening(false); setInterim('') }
    rec.onerror = (e) => { console.warn('[speech]', e.error); setListening(false); setInterim('') }
    rec.start()
    recRef.current = rec
    setListening(true)
  }

  function stop() {
    recRef.current?.stop()
    setListening(false)
    setInterim('')
  }

  return { available, listening, interim, start, stop }
}

export default function IdeaObject({ el, selected, editing, onUpdate, onResize, scaleRef }) {
  const textRef = useRef()
  const baseTextRef = useRef('')
  const w = el.w || 220
  const h = el.h || 120
  const text = el.content.text || ''
  const bgColor = el.content.bgColor || null
  const [speechMsg, setSpeechMsg] = useState('')
  const { available: speechAvail, listening, interim, start, stop } = useSpeechRecognition()

  useEffect(() => {
    if (editing) setTimeout(() => textRef.current?.focus(), 50)
  }, [editing])

  function handleMic() {
    if (listening) {
      stop()
    } else if (!speechAvail) {
      setSpeechMsg('Speech recognition not available.')
      setTimeout(() => setSpeechMsg(''), 3000)
    } else {
      baseTextRef.current = text
      start((final) => {
        const base = baseTextRef.current
        const combined = base ? base.trimEnd() + ' ' + final.trim() : final.trim()
        onUpdate({ ...el.content, text: combined })
      })
    }
  }

  const displayText = listening ? (text ? text.trimEnd() + ' ' : '') + interim : text

  return (
    <div style={{ position: 'relative', width: w }}>
      <div className={`el-card el-idea ${selected ? 'selected' : ''}`}
        style={{ width: w, height: h, background: bgColor || undefined }}>
        <div className="drag-handle">
          <span className="handle-dots">⠿</span>
          <span className="idea-label">Idea</span>
          {speechAvail && (
            <button
              className={`idea-mic-btn ${listening ? 'listening' : ''}`}
              onPointerDown={e => e.stopPropagation()}
              onClick={e => { e.stopPropagation(); handleMic() }}
              title={listening ? 'Stop recording' : 'Speak'}
            >{listening ? '⏹' : '🎙'}</button>
          )}
          {listening && <span className="listening-dot" title="Recording…" />}
        </div>
        <textarea
          ref={textRef}
          className="card-textarea card-textarea-idea"
          style={{ height: h - 32, width: '100%', color: listening && interim ? '#888' : 'inherit', background: 'transparent' }}
          value={displayText}
          onChange={e => { if (!listening) onUpdate({ ...el.content, text: e.target.value }) }}
          placeholder="Your idea…"
        />
        {speechMsg && <div className="speech-msg">{speechMsg}</div>}
        {selected && <ResizeHandle w={w} h={h} onResize={onResize} minW={120} minH={60} scaleRef={scaleRef} />}
      </div>
    </div>
  )
}
