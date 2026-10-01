import { useState, useEffect, useRef, useCallback } from 'react'
import { useWebSocket } from '../hooks/useWebSocket'
import { useAuth } from '../store/AuthContext'
import api from '../utils/api'
import toast from 'react-hot-toast'
import { format } from 'date-fns'

const ROLE_BADGE = { owner: '👑', admin: '⚡', member: null }
const C = {
  accent: '#7C6FF7', bg: '#1C1E26', bg2: '#22242E', bg3: '#2A2D3A',
  border: 'rgba(255,255,255,0.06)', text: '#E8E9F0', muted: '#6B7280',
  secondary: '#9CA3AF', green: '#4ADE80', red: '#F87171', yellow: '#FBBF24',
}

const Avatar = ({ user, size = 36 }) => {
  const initials = (user?.display_name || user?.username || '?').charAt(0).toUpperCase()
  if (user?.avatar_url) return <img src={user.avatar_url} alt="" style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
  const colors = ['#7C6FF7','#8B5CF6','#EC4899','#14B8A6','#F59E0B','#10B981']
  const color = colors[(user?.id || 0) % colors.length]
  return <div style={{ width: size, height: size, borderRadius: '50%', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: size * 0.38, fontWeight: 600, flexShrink: 0 }}>{initials}</div>
}

const OnlineDot = ({ online, size = 7 }) => (
  <div style={{ width: size, height: size, borderRadius: '50%', background: online ? C.green : '#4B5563', border: `1px solid ${C.bg}`, flexShrink: 0 }} />
)

const Modal = ({ show, onClose, title, children, width = 400 }) => {
  if (!show) return null
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }} onClick={onClose}>
      <div style={{ background: '#2A2D3A', borderRadius: 14, padding: 28, width, maxWidth: '95vw', border: '1px solid rgba(255,255,255,0.08)', maxHeight: '85vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        {title && <div style={{ fontSize: 16, fontWeight: 600, color: C.text, marginBottom: 18 }}>{title}</div>}
        {children}
      </div>
    </div>
  )
}

const inputSt = { background: '#1C1E26', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '10px 14px', color: C.text, fontSize: 14, outline: 'none', width: '100%', boxSizing: 'border-box' }
const btn = (accent, danger) => ({ background: danger ? 'rgba(248,113,113,0.1)' : accent ? C.accent : 'transparent', border: `1px solid ${danger ? C.red : accent ? C.accent : 'rgba(255,255,255,0.1)'}`, borderRadius: 8, padding: '8px 16px', color: danger ? C.red : accent ? '#fff' : C.secondary, cursor: 'pointer', fontSize: 13, fontWeight: accent ? 500 : 400 })
const iconBtn = (color = C.muted) => ({ background: 'none', border: 'none', cursor: 'pointer', color, fontSize: 14, padding: '3px 5px', borderRadius: 5, lineHeight: 1 })

const getDateLabel = (dateStr) => {
  const msgDate = new Date(dateStr)
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)
  if (msgDate.toDateString() === today.toDateString()) return 'Today'
  if (msgDate.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return format(msgDate, 'dd MMM yyyy')
}

const EMOJIS = ['👍','👎','❤️','😂','😮','😢','🔥','🎉','👀','✅']

export default function ChatPage() {
  const { user, logout } = useAuth()
  const [workspaces, setWorkspaces] = useState([])
  const [activeWs, setActiveWs] = useState(null)
  const [wsMembers, setWsMembers] = useState([])
  const [myRole, setMyRole] = useState('member')
  const [rooms, setRooms] = useState([])
  const [groups, setGroups] = useState([])
  const [activeRoom, setActiveRoom] = useState(null)
  const [activeRoomMembers, setActiveRoomMembers] = useState([])
  const [messages, setMessages] = useState([])
  const [pinnedMessages, setPinnedMessages] = useState([])
  const [input, setInput] = useState('')
  const [replyTo, setReplyTo] = useState(null)
  const [typing, setTyping] = useState({})
  const [isMuted, setIsMuted] = useState(false)
  const [onlineUsers, setOnlineUsers] = useState(new Set())
  const [panel, setPanel] = useState('rooms')
  const [modal, setModal] = useState(null)
  const [modalData, setModalData] = useState({})
  const [form, setForm] = useState({})
  const [selectedMembers, setSelectedMembers] = useState(new Set())
  const [memberSearch, setMemberSearch] = useState('')
  const [uploading, setUploading] = useState(false)
  const [activeEmojiPicker, setActiveEmojiPicker] = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768)

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])
  const fileRef = useRef(null)
  const bottomRef = useRef(null)
  const typingTimer = useRef(null)
  const isAdmin = myRole === 'owner' || myRole === 'admin'

  const handleWsMessage = useCallback((msg) => {
    const p = msg.payload
    switch (msg.type) {
      case 'connected': setOnlineUsers(new Set(p.online_users)); break
      case 'user_online': setOnlineUsers(prev => new Set([...prev, p.user_id])); break
      case 'user_offline': setOnlineUsers(prev => { const s = new Set(prev); s.delete(p.user_id); return s }); break
      case 'new_message':
        if (Notification.permission === 'granted' && document.hidden) {
          const senderName = p.sender?.display_name || p.sender?.username || 'Someone'
          const n = new Notification('Syncly', { body: `${senderName}: ${p.content || '📎 File'}`, icon: '/favicon.ico', tag: p.room_id })
          n.onclick = () => { window.focus(); n.close() }
        }
        setMessages(prev => prev.some(x => x.id === p.id) ? prev : [...prev, p])
        setRooms(prev => prev.map(r => r.id === p.room_id ? { ...r, last_message: p.content || '[file]', unread_count: r.id === activeRoom?.id ? 0 : (r.unread_count || 0) + 1 } : r))
        setGroups(prev => prev.map(r => r.id === p.room_id ? { ...r, last_message: p.content || '[file]', unread_count: r.id === activeRoom?.id ? 0 : (r.unread_count || 0) + 1 } : r))
        break
      case 'message_deleted':
        setMessages(prev => prev.map(m => m.id === p.message_id ? { ...m, is_deleted: true, content: 'This message was deleted' } : m)); break
      case 'reaction_update':
        setMessages(prev => prev.map(m => m.id === p.message_id ? { ...m, reactions: p.reactions } : m)); break
      case 'typing':
        if (p.room_id === activeRoom?.id) {
          setTyping(prev => ({ ...prev, [p.user_id]: p.username }))
          clearTimeout(typingTimer.current)
          typingTimer.current = setTimeout(() => setTyping(prev => { const n = { ...prev }; delete n[p.user_id]; return n }), 2000)
        }; break
      case 'mute_status':
        if (p.workspace_id === activeWs?.id) { setIsMuted(p.is_muted); toast(p.is_muted ? '🔇 You were muted' : '🔊 You were unmuted') }; break
      case 'role_updated':
        if (p.user_id === user?.id) { setMyRole(p.role); toast(`Your role: ${p.role}`, { icon: '🎭' }) }; break
      case 'message_pinned':
        if (p.workspace_id === activeWs?.id) loadPins(p.workspace_id); break
      case 'added_to_group':
        toast(`📬 Added to group: ${p.room_name}`, { duration: 4000 })
        if (activeWs) loadGroups(activeWs.id)
        loadRooms(); break
      case 'removed_from_group':
        toast(`Removed from group: ${p.room_name}`, { icon: '👋' })
        if (activeRoom?.id === p.room_id) setActiveRoom(null)
        if (activeWs) loadGroups(activeWs.id); break
      case 'group_deleted':
        toast(`Group deleted: ${p.room_name}`, { icon: '🗑' })
        if (activeRoom?.id === p.room_id) setActiveRoom(null)
        if (activeWs) loadGroups(activeWs.id); break
      case 'group_members_updated':
        if (activeRoom?.id === p.room_id) loadRoomMembers(p.room_id); break
      case 'removed_from_workspace':
        toast.error('You were removed from the workspace')
        setActiveWs(null); setActiveRoom(null); loadWorkspaces(); break
    }
  }, [activeRoom, activeWs, user])

  const { send } = useWebSocket(handleWsMessage)

  const loadWorkspaces = async () => { try { const r = await api.get('/workspaces/'); setWorkspaces(r.data) } catch {} }
  const loadRooms = async () => { try { const r = await api.get('/rooms/'); setRooms(r.data) } catch {} }
  const loadGroups = async (wsId) => { try { const r = await api.get(`/groups/workspace/${wsId}`); setGroups(r.data) } catch {} }
  const loadWsMembers = async (wsId) => { try { const r = await api.get(`/workspaces/${wsId}/members`); setWsMembers(r.data) } catch {} }
  const loadPins = async (wsId) => { try { const r = await api.get(`/workspaces/${wsId}/pins`); setPinnedMessages(r.data) } catch {} }
  const loadMessages = async (roomId) => { try { const r = await api.get(`/messages/${roomId}`); setMessages(r.data) } catch {} }
  const loadRoomMembers = async (roomId) => { try { const r = await api.get(`/groups/${roomId}/members`); setActiveRoomMembers(r.data) } catch {} }
  const markRead = async (roomId) => { try { await api.post(`/rooms/${roomId}/read`); setRooms(p => p.map(r => r.id === roomId ? { ...r, unread_count: 0 } : r)); setGroups(p => p.map(r => r.id === roomId ? { ...r, unread_count: 0 } : r)) } catch {} }

  useEffect(() => {
    loadWorkspaces(); loadRooms()
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission()
  }, [])
  useEffect(() => {
    if (activeWs) { loadWsMembers(activeWs.id); loadGroups(activeWs.id); loadPins(activeWs.id); setMyRole(activeWs.my_role); setActiveRoom(null) }
  }, [activeWs?.id])
  useEffect(() => {
    if (activeRoom) { loadMessages(activeRoom.id); markRead(activeRoom.id); if (activeRoom.room_type === 'private') loadRoomMembers(activeRoom.id) }
  }, [activeRoom?.id])
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const createWorkspace = async () => {
    if (!form.wsName?.trim()) return
    const r = await api.post('/workspaces/', { name: form.wsName, icon: form.wsIcon || '💬' })
    setWorkspaces(p => [...p, r.data]); setActiveWs(r.data); setModal(null); setForm({}); await loadRooms()
  }

  const joinWorkspace = async () => {
    try {
      const r = await api.post(`/workspaces/join/${form.inviteCode?.trim()}`)
      setWorkspaces(p => p.some(w => w.id === r.data.id) ? p : [...p, r.data])
      setActiveWs(r.data); setModal(null); setForm({}); await loadRooms(); toast.success(`Joined ${r.data.name}!`)
    } catch { toast.error('Invalid invite code') }
  }

  const regenerateInvite = async () => {
    const r = await api.post(`/workspaces/${activeWs.id}/regenerate-invite`)
    setActiveWs(r.data); setWorkspaces(p => p.map(w => w.id === r.data.id ? r.data : w))
    setModalData(r.data); toast.success('New invite code generated')
  }

  const deleteWorkspace = async () => {
    if (!window.confirm(`Delete "${activeWs.name}"? This cannot be undone.`)) return
    try {
      await api.delete(`/workspaces/${activeWs.id}`)
      setWorkspaces(p => p.filter(w => w.id !== activeWs.id)); setActiveWs(null); setActiveRoom(null)
      toast.success('Workspace deleted')
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed to delete') }
  }

  const createChannel = async () => {
    if (!form.roomName?.trim() || !activeWs) return
    await api.post(`/workspaces/${activeWs.id}/rooms`, { name: form.roomName.toLowerCase().replace(/\s+/g, '-') })
    setModal(null); setForm({}); await loadRooms()
  }

  const deleteChannel = async (roomId, roomName) => {
    if (!window.confirm(`Delete "#${roomName}"? All messages will be lost.`)) return
    try {
      await api.delete(`/rooms/${roomId}`)
      setRooms(p => p.filter(r => r.id !== roomId))
      if (activeRoom?.id === roomId) setActiveRoom(null)
      toast.success(`#${roomName} deleted`)
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed to delete') }
  }

  const createGroup = async () => {
    if (!form.groupName?.trim() || !activeWs) return
    if (selectedMembers.size === 0) { toast.error('Select at least one member'); return }
    try {
      const r = await api.post('/groups/', { name: form.groupName, description: form.groupDesc || '', workspace_id: activeWs.id, member_ids: [...selectedMembers] })
      setGroups(p => [...p, r.data]); setModal(null); setForm({}); setSelectedMembers(new Set())
      setActiveRoom(r.data); toast.success(`Group "${form.groupName}" created!`)
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed to create group') }
  }

  const addMembersToGroup = async () => {
    if (selectedMembers.size === 0) { toast.error('Select at least one member'); return }
    try {
      const r = await api.post(`/groups/${modalData.groupId}/members`, { user_ids: [...selectedMembers] })
      setModal(null); setSelectedMembers(new Set())
      if (r.data.added.length) toast.success(`Added: ${r.data.added.join(', ')}`)
      await loadGroups(activeWs.id)
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed') }
  }

  const removeMemberFromGroup = async (roomId, userId, name) => {
    if (!window.confirm(`Remove ${name} from this group?`)) return
    await api.delete(`/groups/${roomId}/members/${userId}`)
    await loadRoomMembers(roomId); toast.success(`${name} removed`)
  }

  const deleteGroup = async (roomId, name) => {
    if (!window.confirm(`Delete group "${name}"? This cannot be undone.`)) return
    await api.delete(`/groups/${roomId}`)
    if (activeRoom?.id === roomId) setActiveRoom(null)
    await loadGroups(activeWs.id)
  }

  const openDM = async (targetUserId, targetName) => {
    try {
      const r = await api.post('/rooms/dm', { target_user_id: targetUserId })
      await loadRooms(); setActiveRoom(r.data); setPanel('rooms'); toast.success(`DM with ${targetName}`)
    } catch { toast.error('Could not open DM') }
  }

  const toggleMute = async (userId, currentlyMuted) => {
    await api.patch(`/workspaces/${activeWs.id}/members/mute`, { user_id: userId, is_muted: !currentlyMuted })
    await loadWsMembers(activeWs.id)
  }

  const updateRole = async (userId, role) => {
    await api.patch(`/workspaces/${activeWs.id}/members/role`, { user_id: userId, role })
    await loadWsMembers(activeWs.id); toast.success(`Role → ${role}`)
  }

  const removeMember = async (userId, name) => {
    if (!window.confirm(`Remove ${name} from workspace?`)) return
    await api.delete(`/workspaces/${activeWs.id}/members/${userId}`)
    await loadWsMembers(activeWs.id)
  }

  const pinMessage = async (msgId) => {
    try { await api.post(`/workspaces/${activeWs.id}/pin/${msgId}`); toast.success('Pinned') }
    catch (e) { toast.error(e.response?.data?.detail || 'Cannot pin') }
  }

  const toggleReaction = async (msgId, emoji) => {
    try {
      const r = await api.post(`/reactions/${msgId}/toggle?emoji=${encodeURIComponent(emoji)}`)
      setMessages(prev => prev.map(m => m.id === msgId ? { ...m, reactions: r.data.reactions } : m))
      setActiveEmojiPicker(null)
    } catch { toast.error('Could not react') }
  }

  const sendMessage = async () => {
    if (!input.trim() || !activeRoom || isMuted) return
    const fd = new FormData(); fd.append('content', input.trim())
    if (replyTo) fd.append('reply_to_id', replyTo.id)
    setInput(''); setReplyTo(null)
    try { await api.post(`/messages/${activeRoom.id}/send`, fd) }
    catch { toast.error('Failed to send') }
  }

  const sendFile = async (file) => {
    if (!activeRoom || isMuted) { toast.error('Cannot send files'); return }
    setUploading(true)
    const fd = new FormData(); fd.append('file', file)
    try { await api.post(`/messages/${activeRoom.id}/send`, fd, { headers: { 'Content-Type': 'multipart/form-data' } }) }
    catch { toast.error('Upload failed') } finally { setUploading(false) }
  }

  const channels = activeWs ? rooms.filter(r => r.room_type === 'public') : rooms.filter(r => r.room_type === 'public')
  const dms = rooms.filter(r => r.room_type === 'dm')
  const typingUsers = Object.values(typing)
  const filteredWsMembers = wsMembers.filter(m => m.user_id !== user?.id && (m.display_name || m.username).toLowerCase().includes(memberSearch.toLowerCase()))
  const currentGroupMemberIds = new Set(activeRoomMembers.map(m => m.user_id))
  const getRoomIcon = (r) => r.room_type === 'dm' ? '👤' : r.room_type === 'private' ? '🔒' : '#'
  const getSenderBadge = (senderId) => { const m = wsMembers.find(m => m.user_id === senderId); return m ? ROLE_BADGE[m.role] : null }

  return (
    <div style={{ display: 'flex', height: '100vh', background: C.bg, color: C.secondary, fontFamily: 'Inter, sans-serif', overflow: 'hidden', fontSize: 14, flexDirection: isMobile ? 'column' : 'row' }}>

      {/* WORKSPACE RAIL */}
      {!isMobile && <div style={{ width: 64, borderRight: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '12px 0', gap: 8, flexShrink: 0, overflowY: 'auto' }}>
        {workspaces.map(ws => (
          <button key={ws.id} onClick={() => setActiveWs(ws)} title={ws.name}
            style={{ width: 44, height: 44, borderRadius: activeWs?.id === ws.id ? 14 : '50%', background: activeWs?.id === ws.id ? C.accent : C.bg3, border: `2px solid ${activeWs?.id === ws.id ? '#A78BFA' : 'transparent'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, cursor: 'pointer', transition: 'all 0.2s', flexShrink: 0 }}>
            {ws.icon}
          </button>
        ))}
        <div style={{ width: 32, height: 1, background: C.border }} />
        <button onClick={() => { setModal('createWs'); setForm({}) }} title="Create workspace"
          style={{ width: 44, height: 44, borderRadius: '50%', background: C.bg3, border: 'none', color: C.accent, fontSize: 24, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
        <button onClick={() => { setModal('joinWs'); setForm({}) }} title="Join with invite"
          style={{ width: 44, height: 44, borderRadius: '50%', background: C.bg3, border: 'none', color: C.muted, fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>🔗</button>
        <div style={{ flex: 1 }} />
        <button onClick={logout} title="Sign out"
          style={{ width: 44, height: 44, borderRadius: '50%', background: C.bg3, border: 'none', color: C.muted, fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>🚪</button>
      </div>}

      {/* SIDEBAR */}
      {(!isMobile || sidebarOpen) && (
      <div onClick={isMobile ? () => setSidebarOpen(false) : undefined} style={{ position: isMobile ? 'fixed' : 'relative', inset: isMobile ? 0 : 'auto', background: isMobile ? 'rgba(0,0,0,0.5)' : 'transparent', zIndex: isMobile ? 100 : 'auto', display: 'flex' }}>
      <div style={{ width: 248, borderRight: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', flexShrink: 0, background: C.bg2, height: isMobile ? '100vh' : 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.border}`, minHeight: 62 }}>
          {activeWs ? (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 18 }}>{activeWs.icon}</span>
                  <span style={{ fontWeight: 600, fontSize: 14, color: C.text }}>{activeWs.name}</span>
                </div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                  {myRole === 'owner' ? '👑 Owner' : myRole === 'admin' ? '⚡ Admin' : '👤 Member'} · {wsMembers.length} members
                </div>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                {isAdmin && <button onClick={() => { setModal('invite'); setModalData(activeWs) }} style={iconBtn(C.accent)} title="Invite">📨</button>}
                {myRole === 'owner' && <button onClick={deleteWorkspace} style={iconBtn(C.red)} title="Delete workspace">🗑</button>}
              </div>
            </div>
          ) : (
            <div style={{ fontFamily: 'Fira Code, monospace', color: C.accent, fontWeight: 700, fontSize: 16 }}>Syncly</div>
          )}
        </div>

        {activeWs && (
          <div style={{ display: 'flex', borderBottom: `1px solid ${C.border}` }}>
            {['rooms','members','pins'].map(p => (
              <button key={p} onClick={() => setPanel(p)} style={{ flex: 1, padding: '8px 0', fontSize: 11, background: 'none', border: 'none', cursor: 'pointer', color: panel === p ? C.accent : C.muted, borderBottom: `2px solid ${panel === p ? C.accent : 'transparent'}`, textTransform: 'capitalize' }}>{p}</button>
            ))}
          </div>
        )}

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {panel === 'rooms' && (
            <>
              {activeWs && <SectionHeader label="Channels" onAdd={isAdmin ? () => { setModal('createRoom'); setForm({}) } : null} />}
              {channels.map(r => (
                <div key={r.id} style={{ display: 'flex', alignItems: 'center' }}>
                  <div style={{ flex: 1 }}><RoomRow r={r} active={activeRoom?.id === r.id} onClick={() => setActiveRoom(r)} icon="#" /></div>
                  {isAdmin && <button onClick={() => deleteChannel(r.id, r.name)} style={{ ...iconBtn(C.muted), marginRight: 8, fontSize: 12, opacity: 0.5 }} title="Delete channel">🗑</button>}
                </div>
              ))}
              {activeWs && (
                <>
                  <SectionHeader label="Private groups" onAdd={isAdmin ? () => { setModal('createGroup'); setForm({}); setSelectedMembers(new Set()); setMemberSearch('') } : null} />
                  {groups.map(r => (
                    <div key={r.id} style={{ display: 'flex', alignItems: 'center' }}>
                      <div style={{ flex: 1 }}><RoomRow r={r} active={activeRoom?.id === r.id} onClick={() => setActiveRoom(r)} icon="🔒" /></div>
                      {isAdmin && <button onClick={() => { setModal('manageGroup'); setModalData({ groupId: r.id, groupName: r.name }); setActiveRoom(r); loadRoomMembers(r.id) }} style={{ ...iconBtn(C.muted), marginRight: 8, fontSize: 12 }} title="Manage">⚙️</button>}
                    </div>
                  ))}
                  {groups.length === 0 && isAdmin && <div style={{ padding: '8px 14px', fontSize: 12, color: C.muted }}>No private groups yet. Click + to create one.</div>}
                  {groups.length === 0 && !isAdmin && <div style={{ padding: '8px 14px', fontSize: 12, color: C.muted }}>No groups you belong to yet.</div>}
                </>
              )}
              <SectionHeader label="Direct messages" onAdd={() => { setModal('startDM'); setMemberSearch('') }} />
              {dms.map(r => <RoomRow key={r.id} r={r} active={activeRoom?.id === r.id} onClick={() => setActiveRoom(r)} icon="👤" />)}
              {dms.length === 0 && <div style={{ padding: '6px 14px', fontSize: 12, color: C.muted }}>Click + to start a private chat</div>}
            </>
          )}

          {activeWs && panel === 'members' && (
            <>
              <div style={{ padding: '10px 12px 6px', fontSize: 11, color: C.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Members — {wsMembers.length}</div>
              {wsMembers.map(m => {
                const badge = ROLE_BADGE[m.role]
                const isMe = m.user_id === user?.id
                return (
                  <div key={m.id} style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ position: 'relative', flexShrink: 0 }}>
                      <Avatar user={{ id: m.user_id, display_name: m.display_name, username: m.username, avatar_url: m.avatar_url }} size={30} />
                      <div style={{ position: 'absolute', bottom: 0, right: 0 }}><OnlineDot online={onlineUsers.has(m.user_id)} /></div>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ fontSize: 13, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.display_name || m.username}</span>
                        {badge && <span style={{ fontSize: 11 }}>{badge}</span>}
                        {m.is_muted && <span style={{ fontSize: 11 }}>🔇</span>}
                      </div>
                      <div style={{ fontSize: 11, color: C.muted }}>{m.role}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 2 }}>
                      {!isMe && <button onClick={() => openDM(m.user_id, m.display_name || m.username)} title="DM" style={iconBtn(C.accent)}>💬</button>}
                      {isAdmin && !isMe && m.role !== 'owner' && (
                        <>
                          <button onClick={() => toggleMute(m.user_id, m.is_muted)} title={m.is_muted ? 'Unmute' : 'Mute'} style={iconBtn()}>{m.is_muted ? '🔊' : '🔇'}</button>
                          {myRole === 'owner' && <button onClick={() => updateRole(m.user_id, m.role === 'admin' ? 'member' : 'admin')} title={m.role === 'admin' ? 'Demote' : 'Make admin'} style={iconBtn()}>⚡</button>}
                          <button onClick={() => removeMember(m.user_id, m.display_name || m.username)} title="Remove" style={iconBtn(C.muted)}>✕</button>
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
            </>
          )}

          {activeWs && panel === 'pins' && (
            <>
              <div style={{ padding: '10px 12px 6px', fontSize: 11, color: C.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Pinned</div>
              {pinnedMessages.length === 0 && <div style={{ padding: '10px 12px', fontSize: 12, color: C.muted }}>No pinned messages yet.</div>}
              {pinnedMessages.map(p => (
                <div key={p.pin_id} style={{ margin: '6px 10px', background: C.bg, border: '1px solid rgba(124,111,247,0.2)', borderLeft: `3px solid ${C.accent}`, borderRadius: 8, padding: '10px 12px' }}>
                  <div style={{ fontSize: 13, color: C.secondary, lineHeight: 1.4, marginBottom: 4 }}>{p.content || '[file]'}</div>
                  <div style={{ fontSize: 11, color: C.muted }}>📌 {p.pinned_by}</div>
                </div>
              ))}
            </>
          )}
        </div>

        <div style={{ padding: '10px 12px', borderTop: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ position: 'relative' }}>
            <Avatar user={user} size={28} />
            <div style={{ position: 'absolute', bottom: 0, right: 0 }}><OnlineDot online size={6} /></div>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.display_name || user?.username}</div>
            <div style={{ fontSize: 11, color: C.green }}>Online</div>
          </div>
        </div>
      </div>
      </div>)}

      {/* MOBILE HEADER */}
      {isMobile && activeRoom && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 52, background: C.bg2, borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', padding: '0 16px', gap: 12, zIndex: 99 }}>
          <button onClick={() => { setActiveRoom(null); setSidebarOpen(false) }} style={{ background: 'none', border: 'none', color: C.text, fontSize: 20, cursor: 'pointer', padding: 4 }}>←</button>
          <span style={{ fontWeight: 600, color: C.text, fontSize: 15, flex: 1 }}>{activeRoom.name}</span>
          <button onClick={() => setSidebarOpen(true)} style={{ background: 'none', border: 'none', color: C.muted, fontSize: 20, cursor: 'pointer', padding: 4 }}>☰</button>
        </div>
      )}
      {isMobile && !activeRoom && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 52, background: C.bg2, borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', padding: '0 16px', gap: 12, zIndex: 99 }}>
          <span style={{ fontWeight: 700, color: C.accent, fontFamily: 'Fira Code, monospace', fontSize: 16, flex: 1 }}>Chatly</span>
          <button onClick={() => setSidebarOpen(true)} style={{ background: 'none', border: 'none', color: C.muted, fontSize: 22, cursor: 'pointer', padding: 4 }}>☰</button>
        </div>
      )}

      {/* MAIN CHAT */}
      {activeRoom ? (
        <div style={{ flex: 1, display: 'flex', minWidth: 0 }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <div style={{ padding: '14px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, background: C.bg }}>
              <span style={{ fontSize: 16 }}>{getRoomIcon(activeRoom)}</span>
              <span style={{ fontWeight: 600, color: C.text, fontSize: 15 }}>{activeRoom.name}</span>
              {activeRoom.room_type === 'private' && <span style={{ fontSize: 12, color: C.muted, background: C.bg3, padding: '2px 8px', borderRadius: 6 }}>Private · {activeRoomMembers.length} members</span>}
              {isMuted && <span style={{ fontSize: 12, color: C.red, background: 'rgba(248,113,113,0.1)', padding: '2px 10px', borderRadius: 6 }}>🔇 Muted</span>}
              <div style={{ flex: 1 }} />
              {activeRoom.room_type === 'private' && isAdmin && (
                <button onClick={() => { setModal('addToGroup'); setModalData({ groupId: activeRoom.id, groupName: activeRoom.name }); setSelectedMembers(new Set()); setMemberSearch('') }} style={{ ...btn(true), fontSize: 12, padding: '5px 12px' }}>+ Add members</button>
              )}
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 2, background: C.bg }}>
              {messages.map((msg, i) => {
                const msgDateStr = new Date(msg.created_at).toDateString()
                const prevDateStr = i > 0 ? new Date(messages[i-1].created_at).toDateString() : null
                const showDateLabel = msgDateStr !== prevDateStr
                const dateLabel = getDateLabel(msg.created_at)
                const isMe = msg.sender_id === user?.id
                const showAvatar = i === 0 || messages[i-1]?.sender_id !== msg.sender_id || showDateLabel

                if (msg.message_type === 'system') return (
                  <div key={msg.id}>
                    {showDateLabel && <DateDivider label={dateLabel} />}
                    <div style={{ textAlign: 'center', color: C.muted, fontSize: 12, padding: '4px 0' }}>{msg.content}</div>
                  </div>
                )

                const badge = getSenderBadge(msg.sender_id)
                return (
                  <div key={msg.id}>
                    {showDateLabel && <DateDivider label={dateLabel} />}
                    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: showAvatar ? 10 : 1, position: 'relative' }}
                      onMouseEnter={e => { const a = e.currentTarget.querySelector('.ma'); if(a) a.style.opacity='1' }}
                      onMouseLeave={e => { const a = e.currentTarget.querySelector('.ma'); if(a) a.style.opacity='0' }}>
                      <div style={{ width: 36, flexShrink: 0 }}>{showAvatar && <Avatar user={msg.sender} size={36} />}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {showAvatar && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{msg.sender?.display_name || msg.sender?.username}</span>
                            {badge && <span style={{ fontSize: 11 }}>{badge}</span>}
                            <span style={{ fontSize: 11, color: C.muted }}>{format(new Date(msg.created_at), 'HH:mm')}</span>
                          </div>
                        )}
                        {msg.reply_to_id && <div style={{ fontSize: 12, color: C.muted, borderLeft: `2px solid ${C.accent}`, paddingLeft: 8, marginBottom: 4 }}>↩ Replied to a message</div>}
                        {msg.is_deleted
                          ? <span style={{ color: C.muted, fontStyle: 'italic' }}>This message was deleted</span>
                          : msg.message_type === 'image'
                            ? <img src={msg.file_url} alt={msg.file_name} style={{ maxWidth: 300, maxHeight: 200, borderRadius: 8, display: 'block', marginTop: 4 }} />
                            : msg.message_type === 'file'
                              ? <a href={msg.file_url} download={msg.file_name} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: C.bg3, borderRadius: 8, color: C.accent, fontSize: 13, textDecoration: 'none' }}>📎 {msg.file_name}</a>
                              : <span style={{ fontSize: 14, color: C.text, lineHeight: 1.6 }}>{msg.content}</span>}
                        {msg.reactions && msg.reactions.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                            {msg.reactions.map(r => (
                              <button key={r.emoji} onClick={() => toggleReaction(msg.id, r.emoji)}
                                style={{ background: r.user_ids.includes(user?.id) ? 'rgba(124,111,247,0.2)' : 'rgba(255,255,255,0.06)', border: `1px solid ${r.user_ids.includes(user?.id) ? 'rgba(124,111,247,0.5)' : 'rgba(255,255,255,0.1)'}`, borderRadius: 20, padding: '2px 8px', cursor: 'pointer', fontSize: 13, color: '#E8E9F0', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                {r.emoji} <span style={{ fontSize: 12, color: '#9CA3AF' }}>{r.count}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="ma" style={{ opacity: 0, transition: 'opacity 0.15s', display: 'flex', gap: 2, flexShrink: 0 }}>
                        <button onClick={() => setActiveEmojiPicker(activeEmojiPicker === msg.id ? null : msg.id)} style={iconBtn()} title="React">😀</button>
                        <button onClick={() => setReplyTo(msg)} style={iconBtn()} title="Reply">↩</button>
                        {isAdmin && activeWs && !msg.is_deleted && <button onClick={() => pinMessage(msg.id)} style={iconBtn()} title="Pin">📌</button>}
                        {isMe && !msg.is_deleted && <button onClick={() => api.delete(`/messages/${msg.id}`)} style={iconBtn()} title="Delete">🗑</button>}
                      </div>
                      {activeEmojiPicker === msg.id && (
                        <div style={{ position: 'absolute', right: 0, top: 32, background: '#2A2D3A', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: '8px 10px', display: 'flex', gap: 6, zIndex: 100, boxShadow: '0 4px 20px rgba(0,0,0,0.4)' }}>
                          {EMOJIS.map(e => (
                            <button key={e} onClick={() => toggleReaction(msg.id, e)}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, padding: '2px 4px', borderRadius: 6, lineHeight: 1 }}
                              onMouseEnter={ev => ev.target.style.background = 'rgba(255,255,255,0.1)'}
                              onMouseLeave={ev => ev.target.style.background = 'none'}>{e}</button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
              {typingUsers.length > 0 && <div style={{ fontSize: 12, color: C.muted, fontStyle: 'italic', paddingLeft: 46 }}>{typingUsers.join(', ')} is typing…</div>}
              <div ref={bottomRef} />
            </div>

            <div style={{ padding: '12px 20px', borderTop: `1px solid ${C.border}`, flexShrink: 0, background: C.bg }}>
              {replyTo && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', background: C.bg3, borderRadius: 8, marginBottom: 8, fontSize: 12, color: C.secondary }}>
                  <span style={{ color: C.accent }}>↩ {replyTo.sender?.display_name || replyTo.sender?.username}</span>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{replyTo.content}</span>
                  <button onClick={() => setReplyTo(null)} style={iconBtn()}>✕</button>
                </div>
              )}
              {isMuted ? (
                <div style={{ textAlign: 'center', padding: 12, background: 'rgba(248,113,113,0.08)', borderRadius: 10, color: C.red }}>🔇 You are muted and cannot send messages</div>
              ) : (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button onClick={() => fileRef.current?.click()} style={iconBtn(C.muted)} title="Attach file">📎</button>
                  <input ref={fileRef} type="file" style={{ display: 'none' }} onChange={e => e.target.files[0] && sendFile(e.target.files[0])} />
                  <input value={input}
                    onChange={e => { setInput(e.target.value); send({ type: 'typing', room_id: activeRoom.id }) }}
                    onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), sendMessage())}
                    placeholder={`Message ${activeRoom.room_type === 'dm' ? activeRoom.name : (activeRoom.room_type === 'private' ? '🔒 ' : '#') + activeRoom.name}…`}
                    style={{ flex: 1, background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 14px', color: C.text, fontSize: 14, outline: 'none' }} />
                  <button onClick={sendMessage} disabled={!input.trim() || uploading}
                    style={{ background: C.accent, border: 'none', borderRadius: 10, padding: '10px 20px', color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 500, flexShrink: 0, opacity: !input.trim() ? 0.5 : 1 }}>
                    {uploading ? '…' : 'Send'}
                  </button>
                </div>
              )}
            </div>
          </div>

          {activeRoom.room_type === 'private' && (
            <div style={{ width: 210, borderLeft: `1px solid ${C.border}`, background: C.bg2, display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
              <div style={{ padding: '14px 12px 8px', fontSize: 11, color: C.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Group · {activeRoomMembers.length} members</div>
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {activeRoomMembers.map(m => (
                  <div key={m.user_id} style={{ padding: '7px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ position: 'relative', flexShrink: 0 }}>
                      <Avatar user={{ id: m.user_id, display_name: m.display_name, username: m.username, avatar_url: m.avatar_url }} size={26} />
                      <div style={{ position: 'absolute', bottom: 0, right: 0 }}><OnlineDot online={onlineUsers.has(m.user_id)} size={6} /></div>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {m.display_name || m.username}
                        {m.is_admin && <span style={{ marginLeft: 4, fontSize: 10, color: C.accent }}>admin</span>}
                      </div>
                    </div>
                    {isAdmin && m.user_id !== user?.id && (
                      <button onClick={() => removeMemberFromGroup(activeRoom.id, m.user_id, m.display_name || m.username)} style={iconBtn(C.muted)} title="Remove">✕</button>
                    )}
                  </div>
                ))}
              </div>
              {isAdmin && (
                <div style={{ padding: '10px 12px', borderTop: `1px solid ${C.border}` }}>
                  <button onClick={() => { setModal('addToGroup'); setModalData({ groupId: activeRoom.id, groupName: activeRoom.name }); setSelectedMembers(new Set()); setMemberSearch('') }}
                    style={{ ...btn(true), width: '100%', fontSize: 12 }}>+ Add members</button>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, background: C.bg }}>
          {activeWs ? (
            <>
              <div style={{ fontSize: 48 }}>{activeWs.icon}</div>
              <div style={{ fontSize: 20, fontWeight: 600, color: C.text }}>Welcome to {activeWs.name}</div>
              <div style={{ fontSize: 14, color: C.muted }}>Pick a channel, group, or DM from the sidebar</div>
              {isAdmin && (
                <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                  <button onClick={() => { setModal('createGroup'); setForm({}); setSelectedMembers(new Set()); setMemberSearch('') }} style={btn(true)}>🔒 Create private group</button>
                  <button onClick={() => { setModal('invite'); setModalData(activeWs) }} style={btn(false)}>📨 Invite members</button>
                </div>
              )}
            </>
          ) : (
            <>
              <div style={{ fontSize: 48 }}>💬</div>
              <div style={{ fontSize: 20, fontWeight: 600, color: C.text }}>Welcome to Syncly</div>
              <div style={{ fontSize: 14, color: C.muted, marginBottom: 12 }}>Create a workspace or join one</div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => { setModal('createWs'); setForm({}) }} style={btn(true)}>Create workspace</button>
                <button onClick={() => { setModal('joinWs'); setForm({}) }} style={btn(false)}>Join with invite</button>
              </div>
            </>
          )}
        </div>
      )}

      {/* MODALS */}
      <Modal show={modal === 'createWs'} onClose={() => setModal(null)} title="Create a workspace">
        <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
          <input value={form.wsIcon || ''} onChange={e => setForm(f => ({...f, wsIcon: e.target.value}))} maxLength={2} placeholder="💬" style={{ ...inputSt, width: 52, textAlign: 'center', fontSize: 22 }} />
          <input value={form.wsName || ''} onChange={e => setForm(f => ({...f, wsName: e.target.value}))} onKeyDown={e => e.key === 'Enter' && createWorkspace()} placeholder="Workspace name" style={{ ...inputSt, flex: 1 }} autoFocus />
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={() => setModal(null)} style={btn(false)}>Cancel</button>
          <button onClick={createWorkspace} style={btn(true)}>Create</button>
        </div>
      </Modal>

      <Modal show={modal === 'joinWs'} onClose={() => setModal(null)} title="Join a workspace">
        <div style={{ fontSize: 13, color: C.muted, marginBottom: 14 }}>Ask your team lead for the invite code.</div>
        <input value={form.inviteCode || ''} onChange={e => setForm(f => ({...f, inviteCode: e.target.value}))} onKeyDown={e => e.key === 'Enter' && joinWorkspace()} placeholder="Paste invite code" style={{ ...inputSt, marginBottom: 12, fontFamily: 'Fira Code, monospace', letterSpacing: '0.1em' }} autoFocus />
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={() => setModal(null)} style={btn(false)}>Cancel</button>
          <button onClick={joinWorkspace} style={btn(true)}>Join</button>
        </div>
      </Modal>

      <Modal show={modal === 'invite' && !!modalData?.invite_code} onClose={() => setModal(null)} title={`Invite to ${modalData?.name}`}>
        <div style={{ fontSize: 13, color: C.muted, marginBottom: 16 }}>Share this code. Anyone with it can join your workspace.</div>
        <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, padding: '18px', fontFamily: 'Fira Code, monospace', fontSize: 26, color: C.accent, textAlign: 'center', letterSpacing: '0.15em', marginBottom: 14 }}>{modalData?.invite_code}</div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => { navigator.clipboard.writeText(modalData?.invite_code); toast.success('Copied!') }} style={{ ...btn(true), flex: 1 }}>Copy code</button>
          <button onClick={regenerateInvite} style={btn(false)}>Regenerate</button>
        </div>
      </Modal>

      <Modal show={modal === 'createRoom'} onClose={() => setModal(null)} title="Create a channel">
        <div style={{ fontSize: 13, color: C.muted, marginBottom: 12 }}>Channels are open to all workspace members.</div>
        <input value={form.roomName || ''} onChange={e => setForm(f => ({...f, roomName: e.target.value.toLowerCase().replace(/\s+/g,'-')}))} onKeyDown={e => e.key === 'Enter' && createChannel()} placeholder="channel-name" style={{ ...inputSt, marginBottom: 12 }} autoFocus />
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={() => setModal(null)} style={btn(false)}>Cancel</button>
          <button onClick={createChannel} style={btn(true)}>Create channel</button>
        </div>
      </Modal>

      <Modal show={modal === 'createGroup'} onClose={() => setModal(null)} title="Create private group" width={460}>
        <div style={{ fontSize: 13, color: C.muted, marginBottom: 14 }}>Only selected members can see this group.</div>
        <input value={form.groupName || ''} onChange={e => setForm(f => ({...f, groupName: e.target.value}))} placeholder="Group name" style={{ ...inputSt, marginBottom: 10 }} autoFocus />
        <input value={form.groupDesc || ''} onChange={e => setForm(f => ({...f, groupDesc: e.target.value}))} placeholder="Description (optional)" style={{ ...inputSt, marginBottom: 14 }} />
        <div style={{ fontSize: 12, color: C.muted, marginBottom: 8 }}>Select members ({selectedMembers.size} selected)</div>
        <input value={memberSearch} onChange={e => setMemberSearch(e.target.value)} placeholder="Search members…" style={{ ...inputSt, marginBottom: 10, fontSize: 13 }} />
        <div style={{ maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 16 }}>
          {filteredWsMembers.map(m => {
            const sel = selectedMembers.has(m.user_id)
            return (
              <div key={m.user_id} onClick={() => setSelectedMembers(prev => { const n = new Set(prev); sel ? n.delete(m.user_id) : n.add(m.user_id); return n })}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 8, cursor: 'pointer', background: sel ? 'rgba(124,111,247,0.15)' : 'transparent', border: `1px solid ${sel ? 'rgba(124,111,247,0.4)' : 'transparent'}` }}>
                <div style={{ width: 20, height: 20, borderRadius: 5, border: `2px solid ${sel ? C.accent : C.muted}`, background: sel ? C.accent : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {sel && <span style={{ color: '#fff', fontSize: 13, lineHeight: 1 }}>✓</span>}
                </div>
                <Avatar user={{ id: m.user_id, display_name: m.display_name, username: m.username }} size={26} />
                <div>
                  <div style={{ fontSize: 13, color: C.text }}>{m.display_name || m.username}</div>
                  <div style={{ fontSize: 11, color: C.muted }}>{m.role} {ROLE_BADGE[m.role] || ''}</div>
                </div>
              </div>
            )
          })}
          {filteredWsMembers.length === 0 && <div style={{ padding: '12px', fontSize: 13, color: C.muted }}>No members found</div>}
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={() => setModal(null)} style={btn(false)}>Cancel</button>
          <button onClick={createGroup} style={btn(true)} disabled={selectedMembers.size === 0}>Create group ({selectedMembers.size} members)</button>
        </div>
      </Modal>

      <Modal show={modal === 'addToGroup'} onClose={() => setModal(null)} title={`Add members to "${modalData?.groupName}"`} width={420}>
        <input value={memberSearch} onChange={e => setMemberSearch(e.target.value)} placeholder="Search members…" style={{ ...inputSt, marginBottom: 10, fontSize: 13 }} autoFocus />
        <div style={{ fontSize: 12, color: C.muted, marginBottom: 8 }}>Select members to add ({selectedMembers.size} selected)</div>
        <div style={{ maxHeight: 260, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 16 }}>
          {filteredWsMembers.filter(m => !currentGroupMemberIds.has(m.user_id)).map(m => {
            const sel = selectedMembers.has(m.user_id)
            return (
              <div key={m.user_id} onClick={() => setSelectedMembers(prev => { const n = new Set(prev); sel ? n.delete(m.user_id) : n.add(m.user_id); return n })}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 8, cursor: 'pointer', background: sel ? 'rgba(124,111,247,0.15)' : 'transparent', border: `1px solid ${sel ? 'rgba(124,111,247,0.4)' : 'transparent'}` }}>
                <div style={{ width: 20, height: 20, borderRadius: 5, border: `2px solid ${sel ? C.accent : C.muted}`, background: sel ? C.accent : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {sel && <span style={{ color: '#fff', fontSize: 13 }}>✓</span>}
                </div>
                <Avatar user={{ id: m.user_id, display_name: m.display_name, username: m.username }} size={26} />
                <div style={{ fontSize: 13, color: C.text }}>{m.display_name || m.username}</div>
              </div>
            )
          })}
          {filteredWsMembers.filter(m => !currentGroupMemberIds.has(m.user_id)).length === 0 && <div style={{ padding: 12, fontSize: 13, color: C.muted }}>All members already in this group</div>}
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={() => setModal(null)} style={btn(false)}>Cancel</button>
          <button onClick={addMembersToGroup} style={btn(true)} disabled={selectedMembers.size === 0}>Add {selectedMembers.size > 0 ? `(${selectedMembers.size})` : ''}</button>
        </div>
      </Modal>

      <Modal show={modal === 'manageGroup'} onClose={() => setModal(null)} title={`Manage "${modalData?.groupName}"`} width={380}>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 8 }}>Current members</div>
          {activeRoomMembers.map(m => (
            <div key={m.user_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: `1px solid ${C.border}` }}>
              <Avatar user={{ id: m.user_id, display_name: m.display_name, username: m.username }} size={28} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, color: C.text }}>{m.display_name || m.username}</div>
                <div style={{ fontSize: 11, color: C.muted }}>{m.is_admin ? 'group admin' : 'member'}</div>
              </div>
              {m.user_id !== user?.id && <button onClick={() => removeMemberFromGroup(modalData.groupId, m.user_id, m.display_name || m.username)} style={{ ...iconBtn(C.red), fontSize: 12 }}>Remove</button>}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => { setModal('addToGroup'); setSelectedMembers(new Set()); setMemberSearch('') }} style={{ ...btn(true), flex: 1 }}>+ Add members</button>
          <button onClick={() => deleteGroup(modalData.groupId, modalData.groupName)} style={btn(false, true)}>Delete group</button>
        </div>
      </Modal>

      <Modal show={modal === 'startDM'} onClose={() => setModal(null)} title="Start a direct message" width={380}>
        <input value={memberSearch} onChange={e => setMemberSearch(e.target.value)} placeholder="Search workspace members…" style={{ ...inputSt, marginBottom: 12 }} autoFocus />
        <div style={{ maxHeight: 280, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {wsMembers.filter(m => m.user_id !== user?.id && (m.display_name || m.username).toLowerCase().includes(memberSearch.toLowerCase())).map(m => (
            <div key={m.user_id} onClick={() => { openDM(m.user_id, m.display_name || m.username); setModal(null); setMemberSearch('') }}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, cursor: 'pointer', background: 'transparent' }}
              onMouseEnter={e => e.currentTarget.style.background = C.bg3}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <div style={{ position: 'relative' }}>
                <Avatar user={{ id: m.user_id, display_name: m.display_name, username: m.username, avatar_url: m.avatar_url }} size={34} />
                <div style={{ position: 'absolute', bottom: 0, right: 0 }}><OnlineDot online={onlineUsers.has(m.user_id)} /></div>
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: C.text }}>{m.display_name || m.username}</div>
                <div style={{ fontSize: 12, color: C.muted }}>{ROLE_BADGE[m.role] || ''} {m.role} · {onlineUsers.has(m.user_id) ? <span style={{ color: C.green }}>Online</span> : 'Offline'}</div>
              </div>
            </div>
          ))}
          {wsMembers.filter(m => m.user_id !== user?.id).length === 0 && <div style={{ padding: 12, fontSize: 13, color: C.muted }}>No other members yet</div>}
        </div>
      </Modal>

    </div>
  )
}

function DateDivider({ label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '16px 0 8px' }}>
      <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
      <span style={{ fontSize: 12, color: '#6B7280', background: '#22242E', padding: '3px 14px', borderRadius: 20, border: '1px solid rgba(255,255,255,0.06)', whiteSpace: 'nowrap' }}>{label}</span>
      <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
    </div>
  )
}

function SectionHeader({ label, onAdd }) {
  return (
    <div style={{ padding: '10px 14px 4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ fontSize: 11, color: '#6B7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
      {onAdd && <button onClick={onAdd} style={{ background: 'none', border: 'none', color: '#7C6FF7', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 0 }}>+</button>}
    </div>
  )
}

function RoomRow({ r, active, onClick, icon }) {
  return (
    <div onClick={onClick} style={{ padding: '8px 14px', cursor: 'pointer', background: active ? 'rgba(124,111,247,0.12)' : 'transparent', borderLeft: `3px solid ${active ? '#7C6FF7' : 'transparent'}`, display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ color: '#6B7280', fontSize: 13, flexShrink: 0 }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: '#E8E9F0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
          {r.unread_count > 0 && <span style={{ background: '#7C6FF7', color: '#fff', borderRadius: 10, padding: '1px 6px', fontSize: 10, flexShrink: 0 }}>{r.unread_count}</span>}
        </div>
        {r.last_message && <div style={{ fontSize: 11, color: '#6B7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.last_message}</div>}
      </div>
    </div>
  )
}