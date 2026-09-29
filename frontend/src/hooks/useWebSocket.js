import { useEffect, useRef, useCallback } from 'react'

export function useWebSocket(onMessage) {
  const ws = useRef(null)
  const reconnectTimer = useRef(null)
  const onMessageRef = useRef(onMessage)
  onMessageRef.current = onMessage

  const connect = useCallback(() => {
    const token = localStorage.getItem('chatly_token')
    if (!token) return

    const apiUrl = import.meta.env.VITE_API_URL || ''
    let wsUrl
    if (apiUrl) {
      // Remove /api suffix for WebSocket URL
      const baseUrl = apiUrl.replace('/api', '')
      const wsBase = baseUrl.replace('https://', 'wss://').replace('http://', 'ws://')
      wsUrl = `${wsBase}/ws?token=${token}`
    } else {
      const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
      wsUrl = `${protocol}://${window.location.host}/ws?token=${token}`
    }

    ws.current = new WebSocket(wsUrl)

    ws.current.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        onMessageRef.current(msg)
      } catch {}
    }

    ws.current.onclose = () => {
      reconnectTimer.current = setTimeout(connect, 3000)
    }

    ws.current.onerror = () => {
      ws.current?.close()
    }
  }, [])

  useEffect(() => {
    connect()
    return () => {
      clearTimeout(reconnectTimer.current)
      ws.current?.close()
    }
  }, [connect])

  const send = useCallback((data) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(data))
    }
  }, [])

  return { send }
}