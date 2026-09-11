import { useCallback, useEffect, useRef, useState } from 'react'

interface Props {
  onCapture: (file: Blob, previewUrl: string) => void
  preview: string | null
  onClear: () => void
  disabled?: boolean
}

/**
 * Explain why the browser is not offering a camera at all.
 *
 * Browsers only expose getUserMedia on a secure origin. http://localhost counts
 * as one; a LAN address like http://192.168.1.20:5173 does not, and the API is
 * then simply absent rather than failing with an error.
 */
function describeMissingCameraApi(): string {
  if (window.isSecureContext) {
    return 'This browser does not support a live camera. Use "Take photo" instead — it opens your device camera directly.'
  }

  const port = window.location.port || '5173'
  const onLocalhost = ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname)

  if (onLocalhost) {
    // Unusual: localhost is normally a secure context already.
    return `The browser is treating ${window.location.origin} as insecure, so it will not open a camera. Use "Take photo" instead.`
  }

  return (
    `The live camera needs a secure connection, and this page is on ${window.location.origin}. ` +
    `Either open http://localhost:${port} on the computer running the server, ` +
    `or restart it with "npm run dev:https" and reload this address over https. ` +
    `"Take photo" works either way.`
  )
}

interface Camera {
  deviceId: string
  label: string
}

/**
 * Two ways to get a photo of the pack.
 *
 * The live viewfinder uses getUserMedia. Browsers only expose that on a secure
 * origin -- HTTPS, or localhost -- so opening the app at a LAN address over
 * plain HTTP hides the camera API entirely. When that happens the file input
 * with `capture="environment"` still opens the device's own camera app, so a
 * photo can always be taken.
 */
export function CameraCapture({ onCapture, preview, onClear, disabled }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [live, setLive] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [cameras, setCameras] = useState<Camera[]>([])
  const [activeCamera, setActiveCamera] = useState<string | null>(null)

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    setLive(false)
  }, [])

  // Release the camera when the component goes away, so the laptop or phone
  // camera light does not stay on.
  useEffect(() => stopCamera, [stopCamera])

  /**
   * Attach the stream once the viewfinder is on screen.
   *
   * `setLive(true)` does not render the <video> synchronously, so assigning
   * srcObject straight after opening the stream would hit a null ref and leave
   * a black viewfinder. Running it here guarantees the element exists.
   */
  useEffect(() => {
    if (!live) return
    const video = videoRef.current
    const stream = streamRef.current
    if (!video || !stream) return
    video.srcObject = stream
    void video.play().catch(() => undefined)
  }, [live, activeCamera])

  /**
   * List the cameras. Labels are blank until the user has granted permission
   * once, so this is called again after the stream opens.
   */
  const refreshCameras = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return
    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      setCameras(
        devices
          .filter((d) => d.kind === 'videoinput')
          .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Camera ${i + 1}` })),
      )
    } catch {
      /* listing is a convenience; a failure here must not block capture */
    }
  }, [])

  const startCamera = useCallback(
    async (deviceId?: string) => {
      setCameraError(null)

      // A missing mediaDevices almost always means an insecure origin rather
      // than a browser without camera support, so say which one it is.
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError(describeMissingCameraApi())
        return
      }

      // Ask for the rear camera where there is one. `ideal` is a soft
      // preference, so a laptop with only a front camera still opens.
      const attempts: MediaStreamConstraints[] = deviceId
        ? [{ video: { deviceId: { exact: deviceId } }, audio: false }]
        : [
            {
              video: {
                facingMode: { ideal: 'environment' },
                width: { ideal: 1920 },
                height: { ideal: 1440 },
              },
              audio: false,
            },
            { video: true, audio: false },   // last resort: any camera at all
          ]

      let stream: MediaStream | null = null
      let lastError: unknown = null
      for (const constraints of attempts) {
        try {
          stream = await navigator.mediaDevices.getUserMedia(constraints)
          break
        } catch (error) {
          lastError = error
          // Only a constraint problem is worth retrying. A denied permission
          // or a busy camera will fail the same way every time.
          if ((error as DOMException)?.name !== 'OverconstrainedError') break
        }
      }

      if (!stream) {
        const name = (lastError as DOMException)?.name
        setCameraError(
          name === 'NotAllowedError'
            ? 'Camera access was blocked. Allow it for this site in your browser settings, then try again. "Take photo" works without permission.'
            : name === 'NotFoundError' || name === 'OverconstrainedError'
              ? 'No camera was found on this device. Use "Take photo" or choose an image file.'
              : name === 'NotReadableError'
                ? 'The camera is in use by another app. Close anything else using it — a video call, for example — and try again.'
                : 'The live camera could not start. Use "Take photo" instead.',
        )
        setLive(false)
        return
      }

      streamRef.current = stream
      setActiveCamera(stream.getVideoTracks()[0]?.getSettings().deviceId ?? null)
      setLive(true)
      // The stream is attached in an effect below, once React has actually
      // rendered the <video> element.

      // Permission has been granted by now, so the labels are readable.
      void refreshCameras()
    },
    [refreshCameras],
  )

  /** Move to the next camera in the list: front to back, or between webcams. */
  const switchCamera = useCallback(() => {
    if (cameras.length < 2) return
    const current = cameras.findIndex((c) => c.deviceId === activeCamera)
    const next = cameras[(current + 1) % cameras.length]
    stopCamera()
    void startCamera(next.deviceId)
  }, [cameras, activeCamera, startCamera, stopCamera])

  const shoot = useCallback(() => {
    const video = videoRef.current
    if (!video || !video.videoWidth) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d')?.drawImage(video, 0, 0)
    canvas.toBlob(
      (blob) => {
        if (!blob) return
        stopCamera()
        onCapture(blob, URL.createObjectURL(blob))
      },
      'image/jpeg',
      0.92,
    )
  }, [onCapture, stopCamera])

  const pickFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      stopCamera()
      onCapture(file, URL.createObjectURL(file))
    }
    event.target.value = ''   // allow re-picking the same file
  }

  return (
    <div>
      <div className="viewport">
        {preview ? (
          <img src={preview} alt="The package label you captured" />
        ) : live ? (
          <>
            <video ref={videoRef} playsInline muted autoPlay />
            <div className="guide" />
          </>
        ) : (
          <p className="placeholder">
            Photograph the front of the pack, square on, with the whole label inside
            the frame.
          </p>
        )}
      </div>

      {cameraError && <p className="banner warn" style={{ marginTop: 12 }}>{cameraError}</p>}

      <div className="capture-actions">
        {preview ? (
          <button className="btn" onClick={onClear} disabled={disabled}>
            Retake
          </button>
        ) : live ? (
          <>
            <button className="btn btn-primary" onClick={shoot}>
              Capture
            </button>
            {cameras.length > 1 && (
              <button className="btn" onClick={switchCamera} title="Switch camera">
                Switch
              </button>
            )}
            <button className="btn btn-ghost" onClick={stopCamera}>
              Cancel
            </button>
          </>
        ) : (
          <>
            <button className="btn btn-primary" onClick={() => startCamera()} disabled={disabled}>
              Open camera
            </button>
            <button
              className="btn"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled}
            >
              Take photo
            </button>
          </>
        )}
      </div>

      {live && cameras.length > 1 && (
        <p className="field" style={{ marginTop: 10, marginBottom: 0 }}>
          <label htmlFor="camera-pick">Camera</label>
          <select
            id="camera-pick"
            value={activeCamera ?? ''}
            onChange={(e) => {
              stopCamera()
              void startCamera(e.target.value)
            }}
          >
            {cameras.map((c) => (
              <option key={c.deviceId} value={c.deviceId}>
                {c.label}
              </option>
            ))}
          </select>
        </p>
      )}

      {/* `capture="environment"` asks a phone for its rear camera. On a laptop
          the same control becomes an ordinary file picker. */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={pickFile}
        hidden
      />
    </div>
  )
}
