import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'

export interface SignatureCanvasHandle {
  clear: () => void
  load: (signature: Blob) => Promise<void>
  toPngBlob: () => Promise<Blob>
}

interface SignatureCanvasProps {
  onInkChange: (hasInk: boolean) => void
}

export const SignatureCanvas = forwardRef<SignatureCanvasHandle, SignatureCanvasProps>(
  function SignatureCanvas({ onInkChange }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const drawingRef = useRef(false)
    const inkRef = useRef(false)

    useEffect(() => {
      const canvas = canvasRef.current
      if (!canvas) return

      const resize = () => resizeCanvas(canvas, inkRef.current)
      resize()
      const observer = new ResizeObserver(resize)
      observer.observe(canvas)
      return () => observer.disconnect()
    }, [])

    useImperativeHandle(ref, () => ({
      clear() {
        const canvas = canvasRef.current
        if (!canvas) return
        const context = getContext(canvas)
        context.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight)
        inkRef.current = false
        onInkChange(false)
      },
      async load(signature) {
        const canvas = canvasRef.current
        if (!canvas) return
        await drawBlob(canvas, signature)
        inkRef.current = true
        onInkChange(true)
      },
      toPngBlob() {
        const canvas = canvasRef.current
        if (!canvas || !inkRef.current) return Promise.reject(new Error('签名区是空白的。'))
        return new Promise<Blob>((resolve, reject) => {
          canvas.toBlob((blob) => {
            if (blob) resolve(blob)
            else reject(new Error('无法读取签名图片。'))
          }, 'image/png')
        })
      },
    }), [onInkChange])

    function startDrawing(event: React.PointerEvent<HTMLCanvasElement>) {
      if (event.pointerType === 'mouse' && event.button !== 0) return
      event.preventDefault()
      const canvas = event.currentTarget
      const context = getContext(canvas)
      const point = pointerPosition(canvas, event)
      canvas.setPointerCapture(event.pointerId)
      drawingRef.current = true
      context.beginPath()
      context.moveTo(point.x, point.y)
    }

    function continueDrawing(event: React.PointerEvent<HTMLCanvasElement>) {
      if (!drawingRef.current) return
      event.preventDefault()
      const canvas = event.currentTarget
      const point = pointerPosition(canvas, event)
      const context = getContext(canvas)
      context.lineTo(point.x, point.y)
      context.stroke()
      if (!inkRef.current) {
        inkRef.current = true
        onInkChange(true)
      }
    }

    function stopDrawing(event: React.PointerEvent<HTMLCanvasElement>) {
      if (!drawingRef.current) return
      event.preventDefault()
      drawingRef.current = false
      event.currentTarget.releasePointerCapture(event.pointerId)
    }

    return (
      <canvas
        ref={canvasRef}
        className="signature-canvas"
        aria-label="手写签名区"
        onPointerDown={startDrawing}
        onPointerMove={continueDrawing}
        onPointerUp={stopDrawing}
        onPointerCancel={stopDrawing}
        onPointerLeave={(event) => {
          if (event.pointerType === 'mouse') stopDrawing(event)
        }}
      />
    )
  },
)

function getContext(canvas: HTMLCanvasElement) {
  const context = canvas.getContext('2d')
  if (!context) throw new Error('无法开启签名画布。')
  context.strokeStyle = '#111827'
  context.lineWidth = 3
  context.lineCap = 'round'
  context.lineJoin = 'round'
  return context
}

function pointerPosition(canvas: HTMLCanvasElement, event: React.PointerEvent<HTMLCanvasElement>) {
  const bounds = canvas.getBoundingClientRect()
  return { x: event.clientX - bounds.left, y: event.clientY - bounds.top }
}

function resizeCanvas(canvas: HTMLCanvasElement, preserveInk: boolean) {
  const width = Math.max(canvas.clientWidth, 320)
  const height = Math.max(canvas.clientHeight, 280)
  const ratio = Math.max(window.devicePixelRatio || 1, 1)
  let snapshot: HTMLCanvasElement | null = null

  if (preserveInk && canvas.width > 0 && canvas.height > 0) {
    snapshot = document.createElement('canvas')
    snapshot.width = canvas.width
    snapshot.height = canvas.height
    snapshot.getContext('2d')?.drawImage(canvas, 0, 0)
  }

  canvas.width = Math.round(width * ratio)
  canvas.height = Math.round(height * ratio)
  const context = getContext(canvas)
  context.setTransform(ratio, 0, 0, ratio, 0, 0)
  if (snapshot) context.drawImage(snapshot, 0, 0, width, height)
}

async function drawBlob(canvas: HTMLCanvasElement, signature: Blob) {
  const url = URL.createObjectURL(signature)
  try {
    const image = new Image()
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('无法恢复尚未同步的签名。'))
      image.src = url
    })
    const context = getContext(canvas)
    context.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight)
    context.drawImage(image, 0, 0, canvas.clientWidth, canvas.clientHeight)
  } finally {
    URL.revokeObjectURL(url)
  }
}
