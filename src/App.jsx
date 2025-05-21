import React, { useState, useEffect, useRef } from 'react'
import * as JsSIP from 'jssip'
import './App.css'

// Konfigurasi SIP (pindahkan ke sini atau ke file konfigurasi)
const sipConfig = {
  uri: 'sip:1001@10.3.132.69', // Ganti dengan URI SIP Anda (sip:user@domain)
  password: '21619283efe1a13cc2a93f4d3445a173', // Ganti dengan password ekstensi
  sockets: [new JsSIP.WebSocketInterface('wss://10.3.132.69:8089/ws')], // URL WebSocket Server SIP Anda
  realm: 'asterisk', // Sesuaikan jika realm berbeda, bisa didapat dari tantangan 401
  register: true, // Otomatis register
  session_timers: false, // Dicoba untuk menonaktifkan jika ada masalah
  // Tambahkan parameter lain jika perlu, misal:
  // display_name: 'User 1001',
  // no_answer_timeout: 60,
  // session_timers: false, // Nonaktifkan jika menyebabkan masalah
}

// Komponen Placeholder untuk Kontak Item
const ContactItem = ({ name, status, onClick }) => (
  <div 
    className="contact-item" 
    onClick={onClick}
    style={{ 
      padding: '0.75rem 1rem',
      // borderBottom: '1px solid var(--border-light)', // Will be handled by CSS
      cursor: 'pointer',
      transition: 'background-color var(--transition-short)',
      // Gaya hover akan ditangani di CSS untuk `:hover` selector
    }}
  >
    <p style={{ margin: 0, fontWeight: 500 }}>{name}</p>
    {status && <small style={{ fontSize: '0.8em' }}>{status}</small>}
  </div>
);

// Fungsi untuk format durasi (detik ke MM:SS)
const formatDuration = (totalSeconds) => {
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
};

function App() {
  const [ua, setUa] = useState(null)
  const [sipStatusText, setSipStatusText] = useState('Belum Terhubung')
  const [sipStatusClass, setSipStatusClass] = useState('connecting') // default class
  const [isRegistered, setIsRegistered] = useState(false)
  const [targetExtension, setTargetExtension] = useState('')
  const [currentSession, setCurrentSession] = useState(null)
  const [incomingCall, setIncomingCall] = useState(null)

  // Ref untuk audio elements
  const remoteAudioRef = useRef(null)
  const localAudioRef = useRef(null) // Untuk self-view jika dibutuhkan

  // State untuk fitur baru
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [callDuration, setCallDuration] = useState(0);
  const [callTimer, setCallTimer] = useState(null); // Untuk menyimpan interval ID
  const [isMuted, setIsMuted] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState([
    { id: 1, sender: 'Bot', text: 'Selamat datang di chat!' },
    { id: 2, sender: '1002', text: 'Halo, ini pesan tes.' }
  ]); // Pesan placeholder

  const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);

  // Efek untuk timer durasi panggilan
  useEffect(() => {
    if (currentSession && currentSession.isEstablished()) {
      setCallDuration(0); // Reset durasi saat panggilan baru diterima/dibuat & aktif
      const timerId = setInterval(() => {
        setCallDuration(prevDuration => prevDuration + 1);
      }, 1000);
      setCallTimer(timerId);
      return () => {
        clearInterval(timerId);
        setCallTimer(null);
        setCallDuration(0); // Reset saat call berakhir
      };
    } else {
       // Pastikan timer berhenti jika sesi tidak aktif atau berakhir tiba-tiba
      if (callTimer) clearInterval(callTimer);
      setCallDuration(0);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSession?.isEstablished()]); // Hanya bergantung pada status established sesi

  useEffect(() => {
    // Aktifkan JsSIP Debugging
    JsSIP.debug.enable('JsSIP:*')

    console.log('Menginisialisasi JsSIP UA dengan konfigurasi:', sipConfig)
    const jssipUa = new JsSIP.UA(sipConfig)
    setUa(jssipUa)

    const updateStatus = (text, className) => {
      setSipStatusText(text)
      setSipStatusClass(className)
    }

    jssipUa.on('connecting', () => {
      console.log('UA connecting...')
      updateStatus('Menyambungkan ke WebSocket...', 'connecting')
    })

    jssipUa.on('connected', () => {
      console.log('UA connected to WebSocket')
      updateStatus('Terhubung ke WebSocket, mencoba registrasi...', 'connecting')
    })

    jssipUa.on('disconnected', () => {
      console.log('UA disconnected')
      updateStatus('Terputus dari WebSocket', 'failed')
      setIsRegistered(false)
    })

    jssipUa.on('registered', () => {
      console.log('UA registered')
      updateStatus(`Terdaftar sebagai: ${jssipUa.configuration.uri.user}`, 'registered')
      setIsRegistered(true)
    })

    jssipUa.on('unregistered', (e) => {
      console.log('UA unregistered', e)
      updateStatus('Registrasi dibatalkan/gagal', 'failed')
      setIsRegistered(false)
    })

    jssipUa.on('registrationFailed', (e) => {
      console.error('UA registrationFailed', e)
      updateStatus(`Registrasi Gagal: ${e.cause || 'Unknown reason'}`, 'failed')
      setIsRegistered(false)
    })

    // Menangani panggilan masuk
    jssipUa.on('newRTCSession', (data) => {
      const session = data.session
      console.log('Panggilan baru diterima/dibuat:', session)
      setCurrentSession(session)

      if (session.direction === 'incoming') {
        console.log('Panggilan MASUK dari:', session.remote_identity.uri.toString())
        updateStatus(`Panggilan masuk dari: ${session.remote_identity.uri.user}`, 'incoming')
        setIncomingCall(session)
      } else {
        console.log('Panggilan KELUAR ke:', session.remote_identity.uri.toString())
        updateStatus(`Memanggil: ${session.remote_identity.uri.user}`, 'calling')
      }
      
      session.on('progress', () => {
        console.log('Panggilan: progress')
        updateStatus(`Memanggil ${session.remote_identity.uri.user}... (Ringing)`, 'calling')
      })

      session.on('accepted', () => {
        console.log('Panggilan: accepted')
        updateStatus(`Panggilan diterima oleh ${session.remote_identity.uri.user}`, 'established')
        setIncomingCall(null)
      })

      session.on('confirmed', () => {
        console.log('Panggilan: confirmed (established)')
        updateStatus(`Panggilan berlangsung dengan ${session.remote_identity.uri.user}`, 'established')
      })
      
      session.on('ended', () => {
        console.log('Panggilan: ended')
        updateStatus('Panggilan berakhir', isRegistered ? 'registered' : 'failed')
        setCurrentSession(null)
        setIncomingCall(null)
        if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = null
        }
      })

      session.on('failed', (e) => {
        console.error('Panggilan: failed', e)
        updateStatus(`Panggilan Gagal: ${e.cause || 'Unknown reason'}`, 'failed')
        setCurrentSession(null)
        setIncomingCall(null)
      })

      // Menangani media stream
      session.on('peerconnection', (data) => {
        const peerconnection = data.peerconnection
        console.log('Panggilan: peerconnection event')
        peerconnection.ontrack = (event) => {
          console.log('Panggilan: ontrack - remote stream received')
          if (event.streams && event.streams[0] && remoteAudioRef.current) {
            remoteAudioRef.current.srcObject = event.streams[0]
          }
        }
      })

      // Mute/unmute handler for session
      session.on('update', (data) => {
        // Check for mute/unmute status if provided by JsSIP on 'update'
        // This part is highly dependent on how JsSIP signals mute state changes on the session object itself.
        // For now, we control 'isMuted' locally and command the session.
        // If JsSIP has a specific event or property for remote mute status, integrate here.
        console.log('Session update:', data);
      });
    })

    jssipUa.start()

    // Cleanup function
    return () => {
      console.log('Memberhentikan JsSIP UA...')
      if (jssipUa && jssipUa.isConnected()) {
        if (jssipUa.isRegistered()) jssipUa.unregister()
        jssipUa.stop()
      }
      updateStatus('Dihentikan', 'failed')
      setIsRegistered(false)
    }
  }, []) // MODIFIED: Removed isRegistered from dependency array

  const handleCall = (extension) => {
    const extToCall = extension || targetExtension;
    if (ua && isRegistered && extToCall) {
      const target = `sip:${extToCall}@${ua.configuration.uri.host}`
      console.log(`Mencoba memanggil: ${target}`)
      
      const options = {
        mediaConstraints: { audio: true, video: false },
        // Anda bisa menambahkan event handlers di sini juga jika diperlukan
        // eventHandlers: { ... }, 
        // pcConfig: { // Konfigurasi ICE (STUN/TURN) jika diperlukan
        //   iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        // },
      }
      try {
        ua.call(target, options)
      } catch (e) {
        console.error("Error saat memanggil ua.call:", e)
        updateStatus(`Error panggilan: ${e.message}`, 'failed')
      }
    } else {
      alert('Harap masukkan ekstensi tujuan dan pastikan sudah terdaftar.')
    }
  }

  const handleHangup = () => {
    if (currentSession) {
      console.log('Menutup panggilan...')
      currentSession.terminate()
    }
  }

  const handleAnswer = () => {
    if (incomingCall) {
      console.log('Menjawab panggilan masuk...')
      const options = {
        mediaConstraints: { audio: true, video: false },
        // pcConfig: {
        //   iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        // },
      }
      incomingCall.answer(options)
      setCurrentSession(incomingCall) // Pastikan sesi saat ini adalah yg dijawab
      setIncomingCall(null) // Hapus notifikasi panggilan masuk
    }
  }
  
  const handleReject = () => {
    if (incomingCall) {
      console.log('Menolak panggilan masuk...')
      incomingCall.terminate({
        status_code: 486, // Busy Here
        reason_phrase: 'Busy'
      })
      setIncomingCall(null)
    }
  }

  const toggleMute = () => {
    if (currentSession) {
      if (isMuted) {
        currentSession.unmute({ audio: true });
        setIsMuted(false);
        console.log("Call unmuted");
      } else {
        currentSession.mute({ audio: true });
        setIsMuted(true);
        console.log("Call muted");
      }
    }
  };

  const handleSendChatMessage = () => {
    if (chatInput.trim() === '') return;
    const newMessage = { id: Date.now(), sender: 'Saya', text: chatInput };
    setChatMessages(prevMessages => [...prevMessages, newMessage]);
    setChatInput('');
    // TODO: Implement sending chat message via SIP (MESSAGE request)
    if (currentSession) {
      currentSession.sendMessage(chatInput);
      console.log(`Sent message: ${chatInput} to ${currentSession.remote_identity.uri.user}`);
    }
  };

  // Placeholder data kontak
  const contacts = [
    { id: '1002', name: 'User 1002 (Marketing)', status: 'Online' },
    { id: '1003', name: 'User 1003 (Support)', status: 'Offline' },
    { id: '1004', name: 'John Doe (Sales)', status: 'Online' },
    { id: '1005', name: 'Jane Smith (Tech)', status: 'Sibuk' },
  ];

  return (
    <div className={`app-container ${isSidebarOpen ? 'sidebar-open' : 'sidebar-closed'}`}>
      <aside className="sidebar">
        <div style={{padding: '1rem', borderBottom: '1px solid var(--border-light)'}}>
            <h2 style={{ margin: 0, fontSize: '1.4em' }}>Kontak</h2>
        </div>
        <div className="contact-list" style={{overflowY: 'auto', flexGrow: 1}}>
          {contacts.map(contact => (
            <ContactItem 
                key={contact.id} 
                name={contact.name} 
                status={contact.status} 
                onClick={() => handleCall(contact.id.toString())} 
            />
          ))}
        </div>
      </aside>

      <main className="main-content">
        <header className="app-header" style={{ 
            display: 'flex', 
            alignItems: 'center', 
            padding: '0.75rem 1rem', 
            borderBottom: '1px solid var(--border-light)',
            backgroundColor: 'var(--surface-light)' // Header background
        }}>
          <button onClick={toggleSidebar} className="button button-icon" style={{marginRight: '1rem', padding: '0.5rem'}}>
            {/* Placeholder icon, replace with actual SVG/Icon component */}
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z"/></svg>
          </button>
          <h1 style={{margin: 0, fontSize: '1.5em', color: 'var(--on-surface-light)'}}>VoIP Chat App</h1>
        </header>
        
        <div className="content-area" style={{flexGrow: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto'}}>
            <div className="call-view-wrapper" style={{padding: '1rem'}}>
                <div className="card" style={{ maxWidth: '600px', margin: '1rem auto' }}>
                    <p className={`sip-status ${sipStatusClass}`}>Status SIP: <strong>{sipStatusText}</strong></p>

                    {!currentSession && !incomingCall && isRegistered && (
                    <div className="call-controls">
                        <input
                        type="text"
                        placeholder="Masukkan ekstensi tujuan (cth: 1002)"
                        value={targetExtension}
                        onChange={(e) => setTargetExtension(e.target.value)}
                        className="input-field" // Bisa tambahkan kelas spesifik jika perlu
                        />
                        <button onClick={() => handleCall()} className="button button-primary">
                        Panggil
                        </button>
                    </div>
                    )}

                    {currentSession && (
                    <div className="active-call-info" style={{textAlign: 'center', marginBottom: '1.5rem'}}>
                        {/* Placeholder Avatar */}
                        <div style={{
                            width: '80px', height: '80px', borderRadius: '50%', 
                            backgroundColor: 'var(--primary-container-light)', 
                            display: 'flex', alignItems: 'center', justifyContent: 'center', 
                            margin: '0 auto 1rem auto', color: 'var(--on-primary-container-light)',
                            fontSize: '2em', fontWeight: 'bold'
                        }}>
                        {currentSession.remote_identity.uri.user.substring(0,2).toUpperCase()}
      </div>
                        <h3 style={{margin: '0.25rem 0', color: 'var(--on-surface-light)'}}>{currentSession.remote_identity.uri.user}</h3>
                        <p style={{margin: '0 0 1rem 0', color: 'var(--on-surface-variant-light)', fontSize: '1.1em'}}>{formatDuration(callDuration)}</p>
                        
                        <div className="call-action-buttons" style={{display: 'flex', justifyContent: 'center', gap: '0.75rem'}}>
                            <button onClick={toggleMute} className={`button ${isMuted ? 'button-secondary' : 'button-primary'}`}>
                                {isMuted ? 'Unmute' : 'Mute'}
                            </button>
                            <button className="button button-secondary" disabled>Video</button>
                            <button className="button button-secondary" disabled>Share</button>
                            <button onClick={handleHangup} className="button button-danger">
                                Tutup
        </button>
                        </div>
                    </div>
                    )}

                    {incomingCall && !currentSession && (
                    <div className="incoming-call-controls">
                        <p style={{textAlign: 'center', fontWeight: '500', fontSize: '1.1em'}}>Panggilan masuk dari: <strong>{incomingCall.remote_identity.uri.user}</strong></p>
                        <div style={{display: 'flex', justifyContent: 'center', gap: '1rem', marginTop: '1rem'}}>
                            <button onClick={handleAnswer} className="button button-success">Jawab</button>
                            <button onClick={handleReject} className="button button-secondary">Tolak</button>
                        </div>
                    </div>
                    )}
                </div>
            </div>

            {/* Panel Chat - Tampil jika ada sesi aktif */} 
            {currentSession && (
                <div className="chat-panel-wrapper" style={{ padding: '0 1rem 1rem 1rem', marginTop: 'auto', flexShrink: 0 }}>
                    <div className="card chat-panel" style={{maxHeight: '300px', display: 'flex', flexDirection: 'column'}}>
                        <div className="chat-messages" style={{flexGrow: 1, overflowY: 'auto', padding: '0.75rem', borderBottom: '1px solid var(--border-light)'}}>
                            {chatMessages.map(msg => (
                                <div key={msg.id} className={`chat-message ${msg.sender === 'Saya' ? 'sent' : 'received'}`} style={{marginBottom: '0.5rem'}}>
                                    <span style={{fontWeight: 'bold', color: msg.sender === 'Saya' ? 'var(--primary-light)' : 'var(--secondary-light)'}}>{msg.sender}: </span>
                                    <span style={{color: 'var(--on-surface-light)'}}>{msg.text}</span>
                                </div>
                            ))}
                        </div>
                        <div className="chat-input-area" style={{display: 'flex', padding: '0.75rem'}}>
                            <input 
                                type="text" 
                                value={chatInput} 
                                onChange={(e) => setChatInput(e.target.value)}
                                placeholder="Ketik pesan..." 
                                style={{flexGrow: 1, marginRight: '0.5rem'}}
                                onKeyPress={(e) => e.key === 'Enter' && handleSendChatMessage()}
                            />
                            <button onClick={handleSendChatMessage} className="button button-primary">Kirim</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
        
        <audio ref={remoteAudioRef} autoPlay playsInline controls={false} /> 
      </main>
      </div>
  )
}

export default App
