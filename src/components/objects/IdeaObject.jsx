import { useState, useEffect, useRef } from 'react'
import ResizeHandle from '../ResizeHandle'
import { supabase } from '../../supabase'
import micIcon from '../../assets/microphone.svg'

// Records audio (works reliably inside the iOS WKWebView, unlike Web Speech API)
// then sends it to the Netlify transcribe function -> OpenAI gpt-4o-transcribe.
// UX: tap mic -> speak -> tap stop -> ~1-2s -> transcribed text appended.
function useSpeechRecognition() {
  const [available] = useState(
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof window !== 'undefined' && !!window.MediaRecorder
  )
  const [listening, setListening] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const recRef = useRef(null)
  const chunksRef = useRef([])
  const streamRef = useRef(null)
  const onChangeRef = useRef(null)

  async function start(onChange) {
    if (!available) return
    onChangeRef.current = onChange
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const mime = MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4'
        : MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm'
        : ''
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream)
      chunksRef.current = []
      rec.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunksRef.current.push(e.data) }
      rec.onstop = async () => {
        streamRef.current?.getTracks().forEach(t => t.stop())
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' })
        await transcribe(blob)
      }
      rec.start()
      recRef.current = rec
      setListening(true)
    } catch (e) {
      console.warn('[voice] mic error', e)
      setListening(false)
    }
  }

  function stop() {
    if (recRef.current && recRef.current.state !== 'inactive') recRef.current.stop()
    setListening(false)
  }

  async function transcribe(blob) {
    if (!blob || blob.size === 0) return
    setTranscribing(true)
    try {
      const b64 = await blobToBase64(blob)
      const { data, error } = await supabase.functions.invoke('transcribe', {
        body: { audio: b64, mimeType: blob.type },
      })
      if (error) console.warn('[voice] transcribe error', error)
      else if (data?.text) onChangeRef.current?.(data.text.trim())
      else console.warn('[voice] no text returned', data)
    } catch (e) {
      console.warn('[voice] transcribe error', e)
    } finally {
      setTranscribing(false)
    }
  }

  return { available, listening, transcribing, start, stop }
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(String(reader.result).split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

export default function IdeaObject({ el, selected, editing, onUpdate, onResize, scaleRef }) {
  const textRef = useRef()
  const baseTextRef = useRef('')
  const w = el.w || 220
  const h = el.h || 120
  const fontSize = el.content.fontSize || 15
  const text = el.content.text || ''
  const title = el.content.title || ''
  const bgColor = el.content.bgColor || null
  const [speechMsg, setSpeechMsg] = useState('')
  const { available: speechAvail, listening, transcribing, start, stop } = useSpeechRecognition()

  useEffect(() => {
    if (editing) setTimeout(() => textRef.current?.focus(), 50)
  }, [editing])

  // Auto-grow the card height to fit the note (e.g. after a long transcription).
  // Grows only — never shrinks below what the user set. Caps at MAX_AUTO_H.
  const HEADER_H = 32
  const MAX_AUTO_H = 700
  useEffect(() => {
    const ta = textRef.current
    if (!ta) return
    const needed = Math.min(MAX_AUTO_H, ta.scrollHeight + HEADER_H + 2)
    if (needed > h + 1) onResize(w, needed)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, w, fontSize])

  function handleMic() {
    if (transcribing) return
    if (listening) {
      stop()
    } else if (!speechAvail) {
      setSpeechMsg('Recording not available on this device.')
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

  const displayText = text

  return (
    <div style={{ position: 'relative', width: w }}>
      <div className={`el-card el-idea ${selected ? 'selected' : ''}`}
        style={{ width: w, height: h, background: bgColor || undefined }}>
        <div className="drag-handle">
          <span className="handle-dots">⠿</span>
          <span className="idea-label">{title || 'Idea'}</span>
          {speechAvail && (
            <button
              className={`idea-mic-btn ${listening ? 'listening' : ''} ${transcribing ? 'transcribing' : ''}`}
              onPointerDown={e => e.stopPropagation()}
              onClick={e => { e.stopPropagation(); handleMic() }}
              disabled={transcribing}
              title={transcribing ? 'Transcribing…' : listening ? 'Stop recording' : 'Speak'}
            >{transcribing ? '⏳' : listening ? '⏹' : <img src={micIcon} alt="Speak" className="idea-mic-icon" />}</button>
          )}
          {listening && <span className="listening-dot" title="Recording…" />}
        </div>
        <textarea
          ref={textRef}
          className="card-textarea card-textarea-idea"
          style={{ height: h - 32, width: '100%', fontSize: `${fontSize}px`, color: 'inherit', background: 'transparent', pointerEvents: editing ? 'auto' : 'none' }}
          readOnly={!editing}
          value={displayText}
          onChange={e => { if (!listening) onUpdate({ ...el.content, text: e.target.value }) }}
          placeholder="Your idea…"
        />
        {transcribing && <div className="speech-msg">Transcribing…</div>}
        {speechMsg && <div className="speech-msg">{speechMsg}</div>}
      </div>
      {selected && <ResizeHandle w={w} h={h} onResize={onResize} minW={120} minH={60} scaleRef={scaleRef} />}
    </div>
  )
}
